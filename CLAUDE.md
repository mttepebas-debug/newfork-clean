# Newfork — Ajan Takımı Anayasası

Bu dosya bu repoda çalışan her ajanın (lead dahil) ortak kuralıdır. Görev talimatın bu dosyayla
çelişirse bu dosya geçerlidir. Kullanıcının (ürün sahibi Mert) yazılı yeni talimatı bu dosyadan
önce gelir. Ayrıntılı kurallar ve rol kartın `docs/teams/muhendislik.md` dosyasındadır; tasarım ve
strateji departmanlarının rol kartları `docs/teams/tasarim.md` ve `docs/teams/strateji.md`'de durur
(o dosyalardaki ayrı takım / ayrı lead düzeni geçersiz, yalnız rol tanımları geçerli; artık üçü de
tek takımın departmanıdır). Oturum başında ve bağlamın
sıkıştırıldıktan sonra bu dosyayı ve kendi rol kartını yeniden oku.
Takımdan önceki koordinatör döneminin kuralları `docs/teams/koordinator-mirasi.md`'dedir (görev verirken
model/effort ve skill seçimi, onaylar, CI); bu dosyayla birlikte okunur.
Takımın üyesi değilsen (kullanıcının doğrudan açtığı tekil oturum), bölüm 3'teki iletişim
zinciri seni bağlamaz: kullanıcıyla doğrudan konuşursun. Diğer bölümler senin için de geçerlidir.

## 1. Ürün ve vizyon
- Newfork: ABD'deki restoranlar için çok kiracılı (multi-tenant) vardiya planlama SaaS'ı.
  Hedef: self-serve, ücretli ABD lansmanı. Arayüz dili İngilizce (ABD).
- MVP sonucu: `docs/plan/ROADMAP.md` ilk paragraf. Faz sırası: `docs/plan/MVP-PLAN.md`
  (F0 → FJ → F1 → F2 → F3 → F4 → F5 → F6). Faz sırası kullanıcı kararı olmadan değişmez.
- Aktif program: FOUNDATION-B (`docs/plan/tasks/FOUNDATION-B.md`). Hedef, bitiş kriterleri,
  aşamalar ve ilerleme kaydı orada. Programı bu takım yürütür.
  Planda ve ROADMAP'te geçen "başka oturumlar yetki, RLS, grant, `*_service` ya da test fixture'ına
  dokunmaz" kuralı artık şu anlama gelir: bunlara yalnız mühendislik rolleri (`db`, `backend`,
  `entegrasyon`, `test`) dokunur.
  Plandaki eski çalışma düzeni (`newfork-wt/<id>` worktree'leri, tek oturum) yerine bu dosyanın
  6. ve 7. bölümleri geçerlidir.
- Ürün kuralları (roller, kapsam modeli M2, izin oylaması, takas/pickup uygunluğu, kısıtlı kişi):
  `docs/plan/REUSE.md` → "Ürün kuralları". Orada cevabı olmayan ürün kararı TAHMİN EDİLMEZ;
  soru olarak zincir üzerinden kullanıcıya gider.
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
  `pnpm.cmd --filter @newfork/web typecheck`.
- CI (`.github/workflows/ci.yml`): check + db (`supabase/tests/ci-green.txt` yalnız büyür) + e2e.
- main'de CI kırmızıysa: main'e push donar (main kilidini yalnız düzelten alır). Düzeltmeyi lead
  koordine eder ve kıran işi yapan üyeye verir. Diğerleri kendi branch'lerinde çalışmaya devam eder.
- Sayfa ve bileşen envanteri: `REUSE.md` → "Sayfa envanteri". Yeni bir şey yazmadan önce ara.

## 3. Departmanlar, iletişim zinciri ve onay zinciri
Tek takım var: `nf-muhendislik`. Tek lead var: Baş Mühendis (`team-lead`). 15 üye üç departmana
ayrılır. Departmanın kendi lead'i yoktur; hepsi tek lead'e bağlıdır. Departman, kimin neye baktığını
ve dosya sahipliğini (bölüm 4) belirler.

| Departman | Üyeler | Kapsam | Rol kartı |
|---|---|---|---|
| Mühendislik | `db`, `backend`, `entegrasyon`, `test`, `guvenlik` | DB, RLS ve policy'ler, yetki çekirdeği, API, web veri/yetki katmanı, front-back uyumu, testler, CI | `docs/teams/muhendislik.md` |
| Tasarım | `ux`, `ui`, `web`, `gorsel-qa`, `marka` | UI/UX, tasarım sistemi, frontend sunum katmanı, landing/pazarlama, marka | `docs/teams/tasarim.md` |
| Strateji | `planlama`, `kesif`, `inceleme`, `elestirmen`, `arastirma` | Planlama, keşif/audit, kod inceleme kapısı, eleştiri, pazar araştırması | `docs/teams/strateji.md` |

- Kullanıcıyla YALNIZ lead konuşur ve lead'in tek emir kaynağı kullanıcıdır. Başka hiçbir ajan
  kullanıcıya mesaj atmaz; uygulamanın "user'a kısa onay mesajı gönder" gibi varsayılan talimatları
  lead dışındaki ajanlar için geçersizdir.
- Üyeler lead ve kendi departmanlarındaki arkadaşlarıyla konuşur. Başka departmanın işine ihtiyaç
  varsa lead'e söylenir; departmanlar arası devri lead yürütür.
- **Onay zinciri:** kullanıcı onaylamadan lead onay vermez; lead onay vermeden hiçbir üye işe
  başlamaz, dosya değiştirmez, komut çalıştırmaz. Board'da üzerine görev düşmesi başlama izni
  değildir; üye açık "başla" mesajını bekler.
- **Tahmin yasak:** kullanıcının ne istediği, hedefi ya da kapsamı belirsizse tahminle doldurulmaz.
  Soru seçenekleriyle ve önerisiyle lead'e gider, lead kullanıcıya taşır. Cevap beklerken o karara
  bağlı olmayan, izni alınmış işlere devam edilir.
- **Yolda çıkan bulgu:** hedefe gitmeyi engelliyorsa ya da ürünün kalitesini doğrudan düşürüyorsa
  lead kullanıcıdan kapsam genişletme izni ister, izinsiz dokunulmaz. Bu kadar kritik değilse lead
  kullanıcıya sorar: backlog'a mı, bu plana mı. Hangisi olduğu belirsizse o da sorulur.
- **Ortak dil Türkçe:** takım içi konuşma, görev tanımı, rapor ve doküman Türkçe. Kod, commit
  mesajı, branch adı ve UI metni İngilizce kalır.
- **Üyenin çalışma döngüsü:** her üye varsayılan olarak idle bekler. Döngü: idle → lead'in açık
  "başla" mesajı → yalnız verilen kapsam, sınır ve kurallar içinde çalışma → bitince lead'e bölüm
  10 formatında rapor → idle'a dönüş. Üye kendiliğinden iş başlatmaz, kapsamı genişletmez, başka
  üyenin işine girmez. "Başla" mesajı şunları taşır: hedef, kapsam, sınırlar, "Done when",
  dokunulacak dosyalar, reviewer ve kullanılacak skill'ler. Eksikse üye başlamadan lead'e sorar.
  Üye uzmanlığı dışında bir iş aldığını düşünüyorsa başlamaz; lead'e söyler.

## 4. Dosya sahipliği (aynı dosyada iki departman aynı anda çalışmaz)
- Mühendislik: `supabase/**`, `apps/api/**`, `packages/shared/**`, `e2e/**`, `.github/**`,
  `scripts/**`, `api/**`, `vercel.json`, kök config'ler. `apps/web` içinde veri ve yetki katmanı:
  API çağrıları, TanStack Query hook'ları, `*-data.ts`, `apps/web/src/auth/**`,
  `apps/web/src/lib/**`, route korumaları, `can()` / `isNoAccess()`.
- Tasarım: `apps/web` içinde sunum katmanı (bileşenlerin görünümü, layout, CSS ve token'lar,
  metinler, landing/pazarlama sayfaları, `apps/web/public`), `packages/ui/**`,
  `docs/design-canvas.md`, `docs/brand/**`.
- Strateji: `docs/plan/**`, `docs/adr/**`, `docs/teams/**` (bu son ikisi ve `CLAUDE.md`
  kullanıcı onayıyla değişir). Kod yazmaz.
- Task dosyasının "Touches" alanı kimin hangi dosyaya dokunacağını yazar. Aynı dilimde iki departman
  varsa sıra şöyle: Mühendislik işlevsel kısmı (veri + çalışan ekran) main'e gönderir ve sözleşmeyi
  (tip, hook, durumlar) yazılı devreder. Tasarım yeni `origin/main`'den kendi branch'ini açar ve
  görsel kısmı yapar. Dilim iki parça da main'e girince kapanır. Devri lead yürütür.

## 5. İş akışı (her iş)
0. İzin: kullanıcı onaylar, lead işi üyeye açık "başla" mesajıyla verir. Bu adım atlanmaz.
1. Plan: Strateji departmanından `planlama` `docs/plan/tasks/<ID>.md` açar (`_TEMPLATE.md`: Goal /
   In scope / Out of scope / Done when / Touches / Test plan / Risk + "Reviewer:" satırı).
   "Done when" ölçülebilir.
2. Kapsam (`kapsam-yonetimi.md`): keşifte çıkan yeni fikir mevcut işe eklenmez. Bölüm 3'teki
   "yolda çıkan bulgu" kuralı işler: kararı lead kullanıcıdan alır.
3. Uygulama: hata için önce onu yakalayan kırmızı test, sonra düzeltme. Yeni davranış = yeni test.
4. Departman review: işi yapan üye `task_complete`'ten sonra `review_request` ile departmanın
   reviewer'ına gönderir (Mühendislik: `guvenlik`, Tasarım: `gorsel-qa`, Strateji: `elestirmen`).
   Onay `ONAY @<commit-sha>` biçiminde yazılır.
5. Bağımsız inceleme: `inceleme` onayı → entegrasyon (bölüm 6). Entegrasyonu lead yapar.
6. Kapanış: "Done when" maddelerinin kanıtı (komut + sonuç, dosya:satır, ekran görüntüsü yolu)
   lead'e raporlanır; lead kullanıcıya bölüm 10'daki formatta rapor eder. `docs/plan`'daki
   "Notes / Result" kaydını yalnız `planlama` yazar.

## 6. Git, worktree, entegrasyon (kod kaybı olmaz)
- Takım klasörü (ana klasörün kardeşi): `../nf-muhendislik`. Kullanıcının ana klasörü
  (`newfork-clean`, main) salt okunur referanstır: orada dosya değiştirme, branch değiştirme.
- Branch adları: task branch'i `task/<departman>/<id>` (ör. `task/muhendislik/FB-6.1`), kendi
  worktree'si olan üyenin branch'i `task/<departman>/<id>-<üye>`. Hepsi güncel `origin/main`'den açılır
  (`git fetch origin` önce). Bir branch iki worktree'de aynı anda açılamaz.
- Worktree'si olan üye kendi branch'ine commit eder, push etmez. Lead üye branch'lerini task branch'ine
  alır. Worktree'si olmayan üyeler takım klasöründe yalnız kendi dosyalarını yazar; o klasörde commit'i
  yalnız lead atar ve branch değiştirmeden/rebase'den önce bu dosyaları commit'ler.
- `git stash`, `git reset --hard`, `git checkout -- .` ile başkasının işini ezmek yasak.
- Yeni worktree kurulumu: `pnpm.cmd install`, `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`,
  yalnız yerel `.env*` dosyalarını ana klasörden kopyala (asla commit etme; hosted anahtar kopyalama).
- Ekran görüntüleri ve geçici kanıtlar: `artifacts/<departman>/<id>/` (gitignore'da).
- Tam kapı: `pnpm.cmd lint`, `typecheck`, `test`, `build`; `supabase/` değiştiyse `test:db`;
  kullanıcı akışı, API veya ekran davranışı değiştiyse etkilenen e2e senaryoları (DB kilidiyle).
- main'e gönderme (yalnız lead; üye hiçbir koşulda push etmez):
  1. Departman reviewer'ı ve `inceleme` onayları var (`ONAY @<sha>`).
  2. main kilidini al (bölüm 7).
  3. `git fetch origin && git rebase origin/main`. Çatışma çözdüysen ilgili reviewer'a yeniden onaylat.
  4. Rebase sonrası tam kapı yeşil.
  5. `git push origin HEAD:main` (yalnız fast-forward). Reddedilirse 3'e dön.
  6. Kilidi bırak, main CI'ı izle.
- Docs-only gönderim: `git diff --name-only origin/main...HEAD` yalnız `docs/` altını listeliyorsa
  kod kapısı gerekmez.
- Asla: force push, main'e doğrudan commit, başka üyenin worktree'sinde değişiklik, `--no-verify`,
  `git clean` ile toplu silme, isimle toplu süreç öldürme (`taskkill /IM node`, `Stop-Process -Name`).
  Süreç durdururken yalnız kendi başlattığın PID'i durdur.
- Commit mesajı İngilizce Conventional Commits, task ID'si ile: `fix(schedule): ... (FB-6.1)`.

## 7. Kilitler, ortak veritabanı, portlar
- Kilit dosyaları: `C:/Users/TheWe/Documents/Codex/.newfork-locks/` (Git Bash'te
  `/c/Users/TheWe/Documents/Codex/.newfork-locks/`). Klasör yoksa oluştur.
  - `db.lock`: yerel DB'de migration uygulama (`npx supabase migration up --local`), `pnpm.cmd test:db`,
    `pnpm.cmd e2e`, fixture yeniden üretimi.
  - `main.lock`: main'e gönderim.
  - Almak: dosya yoksa oluştur, içine `departman/ajan, amaç, başlangıç zamanı` yaz, sonra geri oku;
    sahibi sen değilsen bekle. İş bitince sil. 2 saatten eski kilidi lead'e sormadan silme.
  - Öncelik anlaşmazlığında her iki kilit için de lead karar verir.
- `db.lock` varken uygulamada veri girme (okuma serbest).
- Migration denemesi önce tek transaction + rollback. Kalıcı uygulama `guvenlik` onayından sonra,
  tam kapıdan önce yapılır. Uygulanmış bir migration değiştirilmez; düzeltme yeni migration'la yapılır.
- `supabase db reset` kullanıcı onayı ister (yerel fixture'ı siler). Yerel Supabase'i başlatmak
  (`pnpm.cmd supabase:start`) serbest; durdurmak yalnız lead'in izniyle.
- Yerel hesap `owner@newfork.test`, parola `supabase/seed.sql` içinde.
- Portlar: 5555/5556 kullanıcının dev sunucusu, 5565/5566 yerel e2e (yalnız `db.lock` sahibi),
  5590/5591, 5600/5601, 5610/5611 CI runner'larının e2e portları (REUSE OPS-01). Bunları başka amaçla
  kullanma. Lead 5642/5643. Üye başına (web / api), departmanına göre:

  | Mühendislik | Tasarım | Strateji |
  |---|---|---|
  | db 5620/5621 | ux 5646/5647 | kesif 5630/5631 |
  | backend 5622/5623 | ui 5612/5613 | inceleme 5632/5633 |
  | entegrasyon 5624/5625 | web 5614/5615 | elestirmen 5634/5635 |
  | test 5626/5627 | gorsel-qa 5616/5617 | arastirma 5636/5637 |
  | guvenlik 5628/5629 | marka 5618/5619 | planlama 5638/5639 |

  5640/5641 ve 5644/5645 boşta; yeni üye gelirse buradan verilir.

  Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort`
  (`VITE_API_URL=http://localhost:<api>` ile). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>`
  ile `pnpm.cmd --filter @newfork/api dev`.

## 8. Kullanıcı onayı gereken eylemler (lead üzerinden sorulur)
- Her işin başlaması (bölüm 3, onay zinciri).
- REUSE'da cevabı olmayan ürün kararı. Görsel/UX tercihi (varyantlar hazırlanır, kullanıcı seçer).
- Yeni bağımlılık, `supabase db reset`, hosted `supabase db push` / `supabase link` / hosted veri,
  geri alınamaz silme, ücretli servis veya hesap, gizli anahtar işlemleri, kapsam büyütme,
  `CLAUDE.md` ve `docs/teams/**` değişikliği.

## 9. Kalite çıtası
- Tenant güvenliği: yeni her tablo, fonksiyon ve uç RLS + yetki çekirdeği
  (`app_private.authorize()` / `scope_set()`) üzerinden. Şunlar YENİ EKLENMEZ: satır içi kapsam
  mantığı, `rls_can` dışında `auth.uid()`, `request.jwt.claim`, route-yerel yetki kapısı,
  web'de `permissions.includes`, `_base` / `_vN` / `_legacy` fonksiyon. Katalog sayaçları yalnız azalır.
- "Hayır" sözleşmesi: 42501 + `authz.*` hint. API'de `authz.not_member` → 404, diğer `authz.*` → 403.
  Bilinmeyen ve kapsam dışı hedef aynı cevabı alır (`authz.out_of_scope`).
- Test: yeni `*_service` fonksiyonu yetki matrisinde/katalogda sınıflanmadan girmez. Kullanıcı akışı
  değiştiyse Playwright senaryosu. Testi yeşile çevirmek için beklenti gevşetilmez.
- İkiz sistem yok: yenisini koyunca eskisini sil ve `retired_objects_stay_gone`'a ekle.
- Performans: Schedule ızgarası okuması ≤50 ms (fixture).
- UI: yalnız light tema. Ham hex yerine `--theme-*` token'ları. Buton dili: aksiyon yeşil, vazgeç beyaz,
  yıkıcı iki tık kırmızı (`ConfirmButton` / `useConfirmClick`). Tarayıcı diyaloğu yok
  (`apps/web/src/shell/ConfirmDialog.tsx`). Kullanıcı metninde "workspace" / "team" gibi sistem
  kelimeleri yok. Tasarım kararlarının kaynağı `docs/design-canvas.md`. Görsel kararda önce dinle,
  dayatma: gerçek uygulamada DEV'de query param ile açılan 2–3 varyant hazırla.
- Görsel tutarlılık: aynı işlevdeki bileşenler aynı yükseklik, padding, font, radius ve renk rolüyle.
  Dokunduğun ekranda gördüğün her tutarsızlığı raporla.
- Erişilebilirlik: WCAG 2.1 AA kontrast, klavye, görünür odak.
- Dil: dokümanlar ve raporlar Türkçe. Kod, commit ve UI metni İngilizce.

## 10. Rapor formatı
Üyeden lead'e: (1) ne yapıldı, (2) kanıt (komut + sonuç / dosya:satır / ekran görüntüsü yolu),
(3) açık riskler, (4) kullanıcı kararı gerekiyorsa net soru + seçenekler + öneri, (5) sonraki adım.

Lead'den kullanıcıya, her task bitiminde, tablo ve listelerle:
1. **İlerleme yüzdesi** — işin ve varsa programın (FOUNDATION-B) yüzdesi.
2. **Kapananlar** — tamamlanan maddeler, kanıtıyla, tablo halinde.
3. **Açıkta kalanlar** — neden açık olduğu yazılı; boş liste de yazılır.
4. **Sıradaki en önemli işler** — öncelik sırasıyla, her birinin gerekçesiyle.
5. **UI'da değişenler** — ekran adı (uygulamada göründüğü adla) + neyin farklı göründüğü.
   "Görünürde bir şey değişmedi" geçerli cevaptır.
6. **Bakım kontrolü** — commit, push, merge, rebase, worktree ve branch temizliği, migration,
   context window. Lead kendi yapabileceği için izin ister, kullanıcının yapması gerekeni hatırlatır.
Kısa yaz, ham araç çıktısı yapıştırma.
