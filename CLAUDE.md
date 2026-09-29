# Newfork — Çalışma Anayasası

Bu dosya bu repoda çalışan her ajanın (koordinatör, rol ajanları, işçi oturumları, kullanıcının
açtığı tekil oturumlar) ortak kuralıdır. Görev talimatın bu dosyayla çelişirse bu dosya geçerlidir.
Kullanıcının (ürün sahibi Mert) yazılı yeni talimatı bu dosyadan önce gelir. Rol ajanıysan
uzmanlığın ve sınırların `.claude/agents/<rolün>.md` dosyasındadır. Oturum başında ve bağlam
sıkıştırıldıktan sonra bu dosyayı yeniden oku.

İşi kimin yapacağı ve kimin inceleyeceği (risk sınıfı R0–R3): @DELEGASYON.md

## 1. Ürün ve vizyon
- Newfork: ABD'deki restoranlar için çok kiracılı (multi-tenant) vardiya planlama SaaS'ı.
  Hedef: self-serve, ücretli ABD lansmanı. Arayüz dili İngilizce (ABD).
- MVP sonucu: `docs/plan/ROADMAP.md` ilk paragraf. Faz sırası: `docs/plan/MVP-PLAN.md`
  (F0 → FJ → F1 → F2 → F3 → F4 → F5 → F6). Faz sırası kullanıcı kararı olmadan değişmez.
- Aktif program: FOUNDATION-B (`docs/plan/tasks/FOUNDATION-B.md`). Hedef, bitiş kriterleri,
  aşamalar ve ilerleme kaydı orada. Planda ve ROADMAP'te geçen "başka oturumlar yetki, RLS, grant,
  `*_service` ya da test fixture'ına dokunmaz" kuralı şu anlama gelir: bunlara yalnız `nf-db`,
  `nf-backend` ve `nf-test` dokunur.
- Ürün kuralları (roller, kapsam modeli M2, izin oylaması, takas/pickup uygunluğu, kısıtlı kişi):
  `docs/plan/KARARLAR.md` → "Ürün kuralları". Orada cevabı olmayan ürün kararı TAHMİN EDİLMEZ;
  soru olarak kullanıcıya gider.
- Kapsam dışı / MVP sonrası: ROADMAP → "Kapsam kararları" (kiosk, time tracking, payroll,
  compliance, SSN yok).
- Bu repo MeyHouse DEĞİLDİR. MeyHouse kuralları (inline style zorunluluğu, tr/en/es çevirileri,
  App.js, koyu amber tema) burada geçersizdir.

## 2. Stack, komutlar, harita
- pnpm + turbo monorepo. Windows'ta `pnpm.cmd`.
  - `apps/web`: React 19, Vite 7, React Router 7, TanStack Query 5, sayfa başına CSS dosyaları ve
    `--theme-*` token'ları (`apps/web/src/styles.css`), yalnız light tema.
  - `apps/api`: Fastify 5, zod 4, supabase-js, Vercel (esbuild bundle).
  - `packages/shared`: tipler ve saf kurallar. `packages/ui`: Button, ConfirmButton, Toaster.
  - `supabase/`: migration'lar, RLS, `app_private` yetki çekirdeği, pgTAP (`supabase/tests`),
    test dünyası (`supabase/test-support/builder.sql`).
  - `e2e/`: Playwright (gerçek giriş ekranı, builder'dan gelen kişiler).
- Komutlar: `README.md`. Odaklı: `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`,
  `pnpm.cmd --filter @newfork/web typecheck`. e2e: `pnpm.cmd e2e` (Playwright,
  `e2e/playwright.config.ts`; yerelde 5565/5566).
- Tuzaklar: `pnpm.cmd test` yeşili CI yeşili değildir; `typecheck` ve `lint` ayrı kapı. Yeni
  worktree'de `pnpm.cmd install` yapılmadan vitest `@vitejs/plugin-react`'i bulamaz.
- CI (`.github/workflows/ci.yml`): check + db (`supabase/tests/ci-green.txt` yalnız büyür) + e2e.
  Kullanıcının bilgisayarında üç self-hosted runner'da koşar (KARARLAR OPS-01).
- main'de CI kırmızıysa: main'e push donar (yalnız düzelten gönderir). Koordinatör kırmızıyı ayırır
  (bölüm 11.9) ve düzeltmeyi kıran işin rolüne verir.
- Kararlar ve ortak parçalar: `docs/plan/KARARLAR.md` (UI/DATA/OPS listesi, ürün kuralları, ekran
  kararları). Yeni bir şey yazmadan önce ara; ekranın kendisi için kodu oku.

## 3. Koordinatör, roller, iletişim ve onay zinciri
- **Koordinatör:** Claude Code masaüstü uygulamasındaki "Koordinatör" oturumu
  (`local_4ccace1a-f969-4d2b-8451-ef6b0738d10a`). Kullanıcının tek muhatabıdır: işi kullanıcıdan
  alır, onaylatır, role verir, raporu kontrol eder, main'e alır, kullanıcıya raporlar.
- **Rol ajanları** (`.claude/agents/`): sabit uzmanlık, model, effort ve araç sınırıyla tanımlı.
  Yeni ya da değişen rol dosyası, oturum yeniden başlatılınca yüklenir.

  | Rol | Uzmanlık | Yazar mı |
  |---|---|---|
  | `nf-db` | şema, RLS, yetki çekirdeği, migration, pgTAP, performans | evet (kendi worktree'sinde) |
  | `nf-backend` | API, shared tipler, web veri/yetki katmanı, front-back sözleşmesi | evet (kendi worktree'sinde) |
  | `nf-test` | vitest, pgTAP, e2e, CI ve runner'lar, kırmızı test ayrımı, ölçüm | evet (kendi worktree'sinde) |
  | `nf-arayuz` | ekran akışı, layout, CSS/token, metin, görsel varyantlar | evet (kendi worktree'sinde) |
  | `nf-guvenlik` | main'e girecek her işin güvenlik ve kod incelemesi | hayır |
  | `nf-gorsel-qa` | ekran görüntüsüyle görsel tutarlılık ve erişilebilirlik | hayır |
  | `nf-planlama` | görev dosyası, backlog, keşif/ölçüm, araştırma, pre-mortem | yalnız `docs/plan/**` |

- **İki çalışma biçimi.** Kısa ve orta işler (inceleme, görsel QA, keşif, araştırma, plan, test
  koşturma, sınırlı düzeltme) koordinatörün çağırdığı **subagent** olarak koşar: rol çağrılır, işini
  yapar, raporunu verir ve kapanır. Uzun kod işleri (saatler süren, çok adımlı, kullanıcının izlemek
  isteyebileceği) **işçi oturumunda** koşar: koordinatör bir görev kartı çıkarır, kullanıcı tek
  tıkla açar; oturum ilgili rol dosyasını okuyup o rolün kurallarıyla çalışır (bölüm 12).
  Hangisinin gerektiği — ya da hiçbirinin gerekmediği, koordinatörün kendisinin yapacağı —
  `DELEGASYON.md`'deki risk sınıfına göre karar verilir; roller yalnız gerektiğinde çağrılır.
- **Onay zinciri:** yeni iş kullanıcı onaylamadan başlamaz (bölüm 11.3). Rol ajanı ve işçi oturumu
  yalnız koordinatörün görev mesajındaki kapsamda çalışır; görev mesajı hedef, kapsam (içi / dışı),
  Done when, dokunulacak dosyalar ve skill'leri taşır.
- **Tahmin yasak:** hedef ya da kapsam belirsizse doldurulmaz. Rol, soruyu seçenekleri ve önerisiyle
  koordinatöre döndürür; koordinatör kullanıcıya sorar. Cevap beklerken o karara bağlı olmayan,
  onaylı işler sürer.
- **Rol ajanları kullanıcıya yazmaz;** raporları koordinatöre gider. İşçi oturumu kullanıcıyla
  konuşabilir (kullanıcı pencereyi açtıysa), ama raporunu koordinatöre gönderir.
- **Kullanıcının açtığı tekil oturum** (koordinatör dışında) kullanıcıyla doğrudan konuşur; bu
  dosyanın diğer bölümleri onu da bağlar. Çıktısı bir işi etkiliyorsa koordinatöre de bildirilir.
- Aynı dosyaya iki rol aynı anda konmaz. Aynı anda en çok iki ağır iş (tam test, e2e, build) koşar:
  bilgisayar tek. CI runner'ları da bu bilgisayarda: koşan bir CI işi (main ya da dal) bu ikiden
  biri sayılır. Yerel tam kapı, e2e ya da `test:db` başlamadan önce `gh run list --limit 3` ile
  bakılır; CI koşuyorsa beklenir. Yük altında düşen test kodun kusuru sayılmadan önce boşta
  yeniden koşturulur (kullanıcı kararı 2026-09-29).

## 4. Dosya sahipliği (aynı dosyada iki rol aynı anda çalışmaz)
- `nf-db`: `supabase/**` (testler dahil; `nf-test` de `supabase/tests/**` yazabilir, aynı işte ikisi
  birden yazmaz).
- `nf-backend`: `apps/api/**`, `api/**`, `packages/shared/**`; `apps/web` içinde veri ve yetki
  katmanı: API çağrıları, TanStack Query hook'ları, `*-data.ts`, `apps/web/src/auth/**`,
  `apps/web/src/lib/**`, route korumaları, `can()` / `isNoAccess()`.
- `nf-test`: `e2e/**`, `**/*.test.ts(x)`, `supabase/tests/**`, `.github/**`, `scripts/**`.
- `nf-arayuz`: `apps/web` sunum katmanı (bileşen görünümü, layout, CSS ve token'lar, metinler,
  landing/pazarlama sayfaları, `apps/web/public`), `packages/ui/**`, `docs/design-canvas.md`,
  `docs/brand/**`.
- `nf-planlama`: `docs/plan/**`.
- Koordinatör: `CLAUDE.md`, `.claude/**`, `docs/adr/**`, kök config'ler, `vercel.json`
  (`CLAUDE.md` ve `.claude/agents/**` kullanıcı onayıyla değişir) ve her şeyin main'e alınması.
  R0–R1 işlerde (`DELEGASYON.md`) koordinatör her dosyayı kendi worktree'sinde yazabilir; o sırada
  aynı dosyada bir rol çalışmıyorsa.
- Task dosyasının "Touches" alanı kimin hangi dosyaya dokunacağını yazar. Aynı dilimde veri ve
  sunum varsa sıra: `nf-backend` / `nf-db` işlevsel kısmı (veri + çalışan ekran) bitirir ve
  sözleşmeyi (tip, hook, durumlar) raporunda yazılı verir; koordinatör onu main'e alır; `nf-arayuz`
  yeni `origin/main`'den görsel kısmı yapar. Dilim iki parça da main'e girince kapanır.

## 5. İş akışı (her iş)
0. Tazelik kontrolü: iş backlog'dan, eski bir plandan ya da devir notundan geliyorsa, kullanıcıya
   sunulmadan ve role verilmeden önce bugünkü `origin/main`'de (ve gerekiyorsa yerel DB'de) yeniden
   ölçülür. Madde için bir hüküm: **geçerli** (anlatıldığı gibi duruyor), **değişmiş** (kısmen
   düzelmiş ya da şekli farklı; madde bugünkü hâline göre yeniden yazılır), **bayat** (zaten
   düzelmiş ya da artık anlamsız; kanıtıyla kapatılır, iş açılmaz). Hüküm, tarih ve commit ile
   maddenin altına yazılır: "Tazelik 2026-09-26 (`<commit>`): geçerli — <kanıt, dosya:satır>".
   Kullanıcıya iş, bu hükümle birlikte sunulur. Kontrolü `nf-planlama` yapar (kod okuma, SELECT);
   küçük maddede koordinatör kendisi yapar.
1. Onay: kullanıcı işi onaylar (bölüm 11.3).
2. Plan: `nf-planlama` `docs/plan/tasks/<ID>.md` açar (`_TEMPLATE.md`: Goal / In scope /
   Out of scope / Done when / Touches / Test plan / Risk + "Reviewer:" satırı). "Done when" ölçülebilir.
3. Kapsam (kökteki `kapsam-yonetimi.md`): yolda çıkan yeni fikir mevcut işe eklenmez (bölüm 11.4).
4. Uygulama: risk sınıfına göre koordinatör ya da ilgili rol (`DELEGASYON.md`). Hata için önce onu
   yakalayan kırmızı test, sonra düzeltme. Yeni davranış = yeni test.
5. İnceleme: risk sınıfının istediği kadar (`DELEGASYON.md` §3): R0 yok; R1 koordinatörün kendi
   okuması + ekran görüntüsü; R2 tek bağımsız inceleme; R3 `nf-guvenlik` zorunlu (ekran değiştiyse
   `nf-gorsel-qa` da). Onay `ONAY @<commit-sha>` biçiminde. Değişiklik istenirse aynı rol ajanına
   düzeltme için yeniden yazılır.
   **Ultrareview hatırlatması** (kullanıcı kararı 2026-09-28): kod işi bitip main'e alınmadan önce
   iş riskli bir yüzeye dokunuyorsa kullanıcıya ultrareview önerilir. Riskli yüzey şunlardır: yetki,
   RLS, grant, migration, `*_service`, katılım/davet, sahiplik devri, veri silme. Ayrıca birçok dosyaya
   yayılan büyük diff'ler de önerilir. Öneri tek satırdır ve neden önerildiği yazılır. Örnek: "BL-252
   sahiplik devrine dokunuyor; bu worktree'nin oturumunda `/code-review ultra <kısa not>` önerilir."
   Docs-only, küçük metin ya da CSS işinde önerilmez. Yalnız kullanıcı başlatır; ajan tetiklemez.
   Branch'in worktree oturumunda koşar; ana klasörde (main) fark olmadığından koşmaz. Başlangıçta 3
   ücretsiz hak var; kalan hakkı ve tahmini tutarı açılış penceresi gösterir. Ücretsiz haklar bitince
   öneride dolar tutarı da yazılır. Bulgular `nf-guvenlik` incelemesine eklenir; onun yerine geçmez.
6. Entegrasyon: koordinatör (bölüm 6).
7. Kapanış: "Done when" maddelerinin kanıtı task dosyasının "Notes / Result"una yazılır
   (`nf-planlama` ya da koordinatör); koordinatör kullanıcıya bölüm 10'daki biçimde raporlar.

## 6. Git, worktree, entegrasyon (kod kaybı olmaz)
- Kullanıcının ana klasörü (`newfork-clean`, main) referanstır: orada iş yapılmaz, branch
  değiştirilmez; koordinatör yalnız `git fetch` ve fast-forward ile güncel tutar.
- Koordinatörün docs ve config işleri ayrık worktree'de: `../newfork-wt/coord` (`git fetch` →
  `git checkout --detach origin/main` → düzenle → commit → `git push origin HEAD:main`).
- Yazan rol ajanları (`isolation: worktree`) geçici worktree'de çalışır (`.claude/worktrees/`);
  kendi branch'ine commit eder, push etmez. İşçi oturumları `../newfork-wt/<id>` worktree'sinde,
  `task/<id>` branch'inde çalışır. Hepsi güncel `origin/main`'den açılır (`git fetch origin` önce).
- Yeni worktree kurulumu: `pnpm.cmd install`, `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`,
  yalnız yerel `.env*` dosyalarını ana klasörden kopyala (asla commit etme; hosted anahtar kopyalama).
- `git stash`, `git reset --hard`, `git checkout -- .` ile başkasının işini ezmek yasak.
- Ekran görüntüleri ve geçici kanıtlar: `artifacts/<rol>/<id>/` (gitignore'da).
- Tam kapı: `pnpm.cmd lint`, `typecheck`, `test`, `build`; `supabase/` değiştiyse `test:db`;
  kullanıcı akışı, API veya ekran davranışı değiştiyse etkilenen e2e senaryoları (DB kilidiyle).
- main'e gönderme (yalnız koordinatör; rol ajanı ve işçi oturumu push etmez, işçi oturumuna
  koordinatör açıkça izin verirse o oturum aynı adımları izler):
  1. Risk sınıfının istediği inceleme tamam (`DELEGASYON.md` §3; R3'te `nf-guvenlik`
     `ONAY @<sha>`). Sınıf ve karar raporda tek satır.
  2. `main.lock` al (bölüm 7).
  3. `git fetch origin && git rebase origin/main`. Çatışma çözüldüyse incelemeyi yenile.
  4. Rebase sonrası tam kapı yeşil.
  5. `git push origin HEAD:main` (yalnız fast-forward). Reddedilirse 3'e dön.
  6. Kilidi bırak, main CI'ı izle. Kod gönderimi o sırada koşan main CI'ı iptal eder.
- Docs-only gönderim: `git diff --name-only origin/main...HEAD` yalnız `docs/` altını listeliyorsa
  kod kapısı gerekmez.
- Asla: force push, main'e doğrudan commit, başka rolün worktree'sinde değişiklik, `--no-verify`,
  `git clean` ile toplu silme, isimle toplu süreç öldürme (`taskkill /IM node`, `Stop-Process -Name`).
  Süreç durdururken yalnız kendi başlattığın PID'i durdur.
- Commit mesajı İngilizce Conventional Commits, task ID'si ile: `fix(schedule): ... (FB-6.1)`.

## 7. Kilitler, ortak veritabanı, portlar
- Kilit dosyaları: `C:/Users/TheWe/Documents/Codex/.newfork-locks/` (Git Bash'te
  `/c/Users/TheWe/Documents/Codex/.newfork-locks/`). Klasör yoksa oluştur.
  - `db.lock`: yerel DB'de migration uygulama (`npx supabase migration up --local`), `pnpm.cmd test:db`,
    `pnpm.cmd e2e`, fixture yeniden üretimi.
  - `main.lock`: main'e gönderim.
  - Kilit yalnız yardımcıyla alınır ve bırakılır (elle `echo >` / `rm` yok):
    `node scripts/lock.mjs take <db|main> "<rol/oturum>, <amaç>"`; alamazsa (exit 1) iş başlamaz, beklenir.
    Bırakmak `node scripts/lock.mjs release <db|main> "<rol/oturum>"` (yalnız sahibi siler); durum
    `node scripts/lock.mjs status`. 2 saatten eski kilidi koordinatöre sormadan silme.
- `db.lock` varken uygulamada veri girme (okuma serbest).
- Migration denemesi önce tek transaction + rollback. Bir branch'in migration'ı ortak yerel DB'ye
  kalıcı olarak yalnız main'e alınmadan hemen önce, `main.lock` ile aynı pencerede ve `nf-guvenlik`
  onayından sonra uygulanır (kullanıcı kararı 2026-09-26). Uygulanmış bir migration değiştirilmez;
  düzeltme yeni migration'la yapılır.
- `supabase db reset` kullanıcı onayı ister (yerel fixture'ı siler). Yerel Supabase'i başlatmak
  (`pnpm.cmd supabase:start`) serbest; durdurmak koordinatörün izniyle.
- Yerel hesap `owner@newfork.test`, parola `supabase/seed.sql` içinde.
- Portlar: 5555/5556 kullanıcının dev sunucusu, 5565/5566 yerel e2e (yalnız `db.lock` sahibi),
  5590/5591, 5600/5601, 5610/5611 CI runner'larının e2e portları (KARARLAR OPS-01). Bunları başka amaçla
  kullanma. Rol ve oturum başına (web / api):

  | Rol | Port | Rol | Port |
  |---|---|---|---|
  | koordinatör | 5642/5643 | `nf-arayuz` | 5612/5613 |
  | `nf-db` | 5620/5621 | `nf-gorsel-qa` | 5616/5617 |
  | `nf-backend` | 5622/5623 | `nf-planlama` | 5638/5639 |
  | `nf-test` | 5626/5627 | işçi oturumu 1 / 2 | 5630/5631, 5632/5633 |
  | `nf-guvenlik` | 5628/5629 | | |

  Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort`
  (`VITE_API_URL=http://localhost:<api>` ile). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>`
  ile `pnpm.cmd --filter @newfork/api dev`.

## 8. Kullanıcı onayı gereken eylemler (koordinatör sorar)
- Her yeni işin başlaması (bölüm 11.3).
- KARARLAR'da cevabı olmayan ürün kararı. Görsel/UX tercihi (varyantlar hazırlanır, kullanıcı seçer).
- Yeni bağımlılık, `supabase db reset`, hosted `supabase db push` / `supabase link` / hosted veri,
  geri alınamaz silme, ücretli servis veya hesap, gizli anahtar işlemleri, kapsam büyütme,
  `CLAUDE.md` ve `.claude/agents/**` değişikliği.
- Aktarılan onay geçmez: geri alınamaz silme, `supabase db reset`, hosted işlem, dosya indirme ve
  kalıcı kurulum için kullanıcının "evet"i işi yapan oturumun kendi penceresine yazılır (subagent
  için bu koordinatörün penceresidir).

## 9. Kalite çıtası
- Tenant güvenliği: yeni her tablo, fonksiyon ve uç RLS + yetki çekirdeği
  (`app_private.authorize()` / `scope_set()`) üzerinden. Şunlar YENİ EKLENMEZ: satır içi kapsam
  mantığı, `rls_can` dışında `auth.uid()`, `request.jwt.claim`, route-yerel yetki kapısı,
  web'de `permissions.includes`, `_base` / `_vN` / `_legacy` fonksiyon. Katalog sayaçları yalnız azalır.
  Yetki kodunda "bilgi eksikse izin ver" (fail-open) varsayılanı görülünce o iş içinde kapatılır.
- "Hayır" sözleşmesi: 42501 + `authz.*` hint. API'de `authz.not_member` → 404, diğer `authz.*` → 403.
  Bilinmeyen ve kapsam dışı hedef aynı cevabı alır (`authz.out_of_scope`).
- Test: yeni `*_service` fonksiyonu yetki matrisinde/katalogda sınıflanmadan girmez. Kullanıcı akışı
  değiştiyse Playwright senaryosu. Testi yeşile çevirmek için beklenti gevşetilmez.
- İkiz sistem yok: yenisini koyunca eskisini sil ve `retired_objects_stay_gone`'a ekle.
- Eski veri korunmaz: canlı kullanıcı ve canlı veri yok. Bugünkü kurala uymayan kayıt, ona tolerans
  gösteren kod yolu ve onu kuran test silinir; geriye uyumluluk dalı yazılmaz.
- Performans: Schedule ızgarası okuması ≤50 ms (fixture). Gevşetmek kullanıcı onayı ister.
- UI: yalnız light tema. Ham hex yerine `--theme-*` token'ları. Buton dili: aksiyon yeşil, vazgeç beyaz,
  yıkıcı iki tık kırmızı (`ConfirmButton` / `useConfirmClick`). Tarayıcı diyaloğu yok
  (`apps/web/src/shell/ConfirmDialog.tsx`). Kullanıcı metninde iş yerine "workspace", ekibe
  "team" denir (kullanıcı kararı 2026-09-20); kod adları ekranda görünmez. Tasarım kararlarının kaynağı `docs/design-canvas.md`. Görsel kararda önce dinle,
  dayatma: gerçek uygulamada DEV'de query param ile açılan 2–3 varyant hazırla.
- Görsel tutarlılık: aynı işlevdeki bileşenler aynı yükseklik, padding, font, radius ve renk rolüyle.
  Dokunduğun ekranda gördüğün her tutarsızlığı raporla.
- Erişilebilirlik: WCAG 2.1 AA kontrast, klavye, görünür odak.
- Kullanıcı kararları: Supabase "Leaked password protection" açılmaz (ücretli; uyarı bilinen ve muaf).
  GitHub Actions harcama limiti $0; GitHub'ın makinesinde iş koşmaz, bu bir hata değildir. Realtime
  "Allow public access" kapalı; her canlı kanal private (KARARLAR DATA-07).

## 10. Rapor formatı
Rol ajanından ve işçi oturumundan koordinatöre (Türkçe, kod okumayan biri için):
(1) nerede duruyor, (2) ne yapıldı (etkisi), (3) açık kalan ve nedeni, (4) ekranda ne değişti,
(5) sırada ne var (yolda bulunanlar dahil). Kanıt: komut + sonuç, dosya:satır, commit sha, worktree
branch'i, ekran görüntüsü yolu. İnceleme rollerinde en üstte KARAR satırı.

Koordinatörden kullanıcıya, her iş bitiminde, tablo ve listelerle:
1. **Nerede duruyor** — bitti mi, neyle bitmedi; varsa programın (FOUNDATION-B) ilerleme yüzdesi.
2. **Ne yapıldı** — dosya listesi değil etkisi: kişi artık ne yapabiliyor ya da ne görmüyor; kanıtıyla.
3. **Açık kalanlar** — neden açık olduğu yazılı; boş liste de yazılır.
4. **Ekranda ne değişti** — ekran adı (uygulamada göründüğü adla) + neyin farklı göründüğü.
   "Görünürde bir şey değişmedi" geçerli cevaptır.
5. **Sıradaki en önemli işler** — öncelik sırasıyla, her birinin gerekçesiyle; backlog'a yazılanlar adıyla.
6. **Bakım kontrolü** — commit, push, worktree ve branch temizliği, migration, bağlam penceresi.
   Koordinatör kendi yapabileceğini yapar, kullanıcının yapması gerekeni hatırlatır.
Kısa yaz, ham araç çıktısı yapıştırma.

## 11. Koordinatörün kuralları (kullanıcının 2026-09-24/25'te koyduğu ya da onayladığı)
1. **Türkçe.** Kullanıcıya giden her şey Türkçe: soru, rapor, özet, durum satırı; kullanıcı
   İngilizce kısa bir komut yazsa da. Ajanlar arası mesajlar ve `docs/` kayıtları da Türkçe. Kod,
   commit mesajı, koddaki yorum, UI metni, hata metni ve teknik adlar İngilizce kalır. Sade, günlük
   Türkçe: kısa cümle, gereksiz İngilizce kelime yok ("deploy etmek" yerine "yayına almak"); Türkçe
   karşılığı yerleşik olmayan terim kalır ve ilk geçtiği yerde yarım satırla açıklanır.
2. **Kullanıcıyla konuşmak.** Kullanıcı kod yazmaz. Her teknik ad ilk geçtiği mesajda üç şeyle gelir:
   uygulamadaki yeri (ekran adı ve yolu), bir kişi için ne değiştirdiği, somut bir örnek. Backlog
   numarası tek başına yazılmaz ("CI'ı hızlandırmak (BL-112)"). Sorular tek tıkla cevaplanır:
   seçenekler adlı, önerilen ilk sırada ve "(Önerilen)" etiketli; sorular toplanıp tek turda sorulur.
   Tekrarlayan maliyet ilk mesajda DOLAR olarak, kaynağıyla. Hata saklanmaz: "benim hatam" denir.
3. **İşin başında.** Tören işin boyuna göre: küçük iş (tek okuması var, kolay geri alınır) yapılır
   ve bir iki satırla söylenir. Gerçek iş (birden fazla okuması var, geri dönüşü pahalı ya da ortak
   bir şeye dokunuyor) için ilk mesaj şartname sayılmaz; belirsizse sorulur. Sonra tek mesajda,
   kullanıcının kelimeleriyle: ne anlaşıldı, kapsam içi ve bilerek dışarıda bırakılan, ne zaman
   bitmiş sayılır, hangi rol(ler) ve neden. **Onay gelmeden iş başlamaz.** İstisna: kullanıcının
   onayladığı bir planın sıradaki adımı (ör. FOUNDATION-B aşamaları) sorulmadan yürür. Yazılı bir
   şeye (backlog, eski plan, devir notu) göre davranmadan önce bugünkü repoda ölçülür (tazelik kontrolü, bölüm 5 adım 0). Rolün
   modeli dosyasında sabittir; iş ona açıkça uymuyorsa koordinatör çağrıda modeli ezer ve söyler.
   Her görev mesajında bir "Skills" satırı: adım → skill → neden; alıcıda olmayan skill atlanır ve
   raporda söylenir.
4. **Çalışırken.** Yolda bulunan şey işin önündeyse (onsuz iş bitmez ya da bozuk kalır) düzeltilir
   ve nedeni söylenir; değilse backlog'a yazılır, kullanıcıya adıyla söylenir, dokunulmaz;
   belirsizse tek satırla sorulur. İş sürerken gelen mesaj önce "işi değiştiriyor mu?" diye okunur.
   Geri alınamaz hiçbir şey yedeksiz koşmaz; yedeğin adı ve yeri raporda. Kapsam yanlış ya da
   imkânsız çıkarsa söylenir ve durulur; sessizce başka fikirle değiştirilmez.
   **Tek hat (kullanıcı kararı 2026-09-28):** bir iş başlayınca o iş bitene kadar yalnız onunla
   ilerlenir. Yolda bulunan, işin önünde olmayan her şey backlog'a yazılmaya devam eder ama iş
   açılmaz; istisna yalnız çok büyük bir güvenlik açığı ya da planın yönünü değiştiren ve
   bekleyemeyen bir eksik (kullanıcıya sorulur). İş parçalara bölünüp aynı anda birden fazla
   oturumda ilerleyebilir; parçalar aynı işin içindedir, başka konuya oturum açılmaz.
5. **Verim ve kalite.** Kontrol alışkanlıkla değil bir karar değiştirdiği için koşulur: sessizce
   bozulan kural (yetki, satır erişimi), teslim edilen şeyin kendisi ve saniyelik kontroller hemen;
   birbirine bağlı küçük değişiklikler ve yavaş, düşük riskli kontroller sınırda (push öncesi,
   "bitti" demeden önce); kapsadığı hiçbir şey değişmediyse ya da aynı şey kanıtlandıysa hiç.
   Sınırda ertelenen her kontrol koşulur. Fazla düzgün sonuç bozuk ölçümdür: önce bir satır elle
   doğrulanır. Her sayı nereden ve ne zaman ölçüldüğüyle yazılır.
6. **İşin sonunda.** Rapor bölüm 10'daki gibi. Rapor gelince iş sonradan incelenir: iddia edilen CI
   koşusu ve commit bağımsız kontrol edilir, riskli yüzeyde değişikliğin kendisi okunur. Sıradaki iş
   aktif plandan (`ILERLEME-PLANI.md` sırası) gelir; backlog iş bittikten sonra okunur ve oradan
   yalnız kritikleşen madde önerilir.
7. **Kayıtlar.** Backlog tek dosya (`docs/plan/BACKLOG.md`): konuya göre gruplu, numaralı, grup
   içinde önem sırasıyla; her madde ne olduğu, neden önemli, neden beklediği ve iki işaret
   (`BL-081 (leave: high / do: risky)`); ikisi çelişiyorsa bir satırla söylenir. Yeni BL numarasından
   önce `origin/main`'deki en yüksek numaraya bakılır. Kapanan maddeye "Kapandı <tarih> (`<commit>`)"
   ve ölçülen sonuç; `docs/plan/DONE.md`'ye etki cümlesiyle satır. İkinci kez gerekecek bilgi `KARARLAR.md`'ye
   (kural, kodda nerede, ne işe yarar). Bir ekran için verilen karar KARARLAR "Ekran kararları"na
   yazılır; kod özeti yazılmaz, kuralı değiştiren iş maddeyi aynı işte düzeltir. Ortak bir değer bir ekranda değişirse önce kural yazılır,
   uyuşmayan ekranlar adıyla söylenir, düzeltmeden önce kullanıcıya sorulur. Aynı hata iki kez
   olursa kök neden bulunur ve bu dosyaya kural önerisi olarak kullanıcıya sunulur.
8. **İlerleme planı.** Aktif programın ilerleme kaydı kendi task dosyasında (şu an
   `FOUNDATION-B.md` → "Notes / Result"). Her dilim ya da aşama main'e girince kayıt ve ROADMAP
   durumu güncellenir. Kullanıcı "durum ne" dediğinde en fazla 5 satır: ne bitti, kanıt, neredeyiz,
   sıradaki, bekleyen karar.
9. **CI ve ortak kaynaklar.** Bir runner, onu yalıtan değişiklik main'e girmeden `newfork-local`
   havuzuna eklenmez. Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz
   (Docker Desktop'ın bağlantısı kopar); çözüm Docker Desktop'ı yeniden başlatmaktır. Kırmızı main
   kimseye yüklenmeden ayrılır: yalnız düşen işler yeniden koşturulur, hangi runner'da koştuğuna
   bakılır; altyapıdan gelen kırmızı koda düzeltme yazdırmaz. Ortak yerel DB `seed.sql`
   değişikliklerini görmez; seed'e dayanan kırılma yalnız CI'da çıkar.
10. **Temizlik.** Biten iş commit'lenir ve gönderilir; taşıdığı migration onunla gider. Branch ve
    worktree iş kapanınca kapanır; silme, birleşme doğrulandıktan sonra. Kilitler bırakılır, kendi
    başlatılan süreçler PID ile durdurulur. Uzun yol yüzünden `git worktree remove` yarım kalırsa
    PowerShell `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force`, ardından `git worktree prune`.
    Bağlam dolarken iş sınırında durulur: yarım iş bitirilir ya da park edilir, bitmiş commit'lenir,
    yalnız sohbette yaşayan bilgi task dosyasına yazılır. Her iş bitişinde bakım satırında bağlam
    doluluğu yazılır; yarıyı geçince bir sonraki sınırda devir raporu (`docs/plan/HANDOFF.md`) ve
    yeni koordinatör oturumu önerilir (kullanıcı kararı 2026-09-26). Uzun kod işleri rol
    oturumlarında (bölüm 12) yürür; alt ajan yalnız kısa işte (inceleme, görsel QA, ölçüm, keşif);
    kısa ve düşük riskli iş koordinatörde kalır (`DELEGASYON.md`).
11. **Rol hafızası.** Rollerin öğrendikleri `.claude/agent-memory/<rol>/`'da (git'te). Koordinatör
    ayda bir farkı okur; yanlış ya da eskimiş kaydı sildirir.

## 12. İşçi oturumu
- Ne zaman: iş uzun (saatler), çok adımlı ya da kullanıcı canlı izlemek isteyebilir.
- Açılış: koordinatör görev kartı çıkarır (başlık = görev kimliği ve kısa ad), kullanıcı tek tıkla
  açar. Kartın metni: "`.claude/agents/<rol>.md` dosyasını oku ve o rolün kurallarıyla çalış; görev
  dosyası `docs/plan/tasks/<ID>.md`; worktree `../newfork-wt/<id>`, branch `task/<id>`; bitince
  bölüm 10'daki raporu `SendMessage` ile koordinatöre (`local_4ccace1a-f969-4d2b-8451-ef6b0738d10a`)
  gönder ve dur."
- Birden fazla rol gerektiren uzun işte oturum rolleri sırayla üstlenir ya da koordinatör işi
  rollere göre ayrı oturumlara böler; aynı dosyaya iki oturum aynı anda konmaz.
- Kapanış: koordinatör doğrular (commit main'de, worktree ve branch silinmiş, arkada iş yok,
  bildiği her şey kayıtta) ve kullanıcıya "arşivlenebilir" der. Arşiv, telefon bağlantısı (Remote
  Control) açıkken reddedilir; kapatmak için her seferinde kullanıcıya sorulur.
- Rol oturumu yenileme: bağlamı dolan rol oturumu arşivlenmeden önce yerine YENİ bir oturum açılır;
  yeni oturum Remote Control açık ve kenar çubuğunda sabitlenmiş (pinned) başlar, başlığı
  "Rol: <rol> (<uzmanlık>)" biçimindedir. Koordinatör açıldıktan sonra ikisini doğrular
  (kullanıcı kararı 2026-09-27).
