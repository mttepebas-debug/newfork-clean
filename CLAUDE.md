# Newfork — Ajan Takımları Anayasası

Bu dosya bu repoda çalışan her ajanın (3 takım, lead'ler dahil) ortak kuralıdır. Görev talimatın
bu dosyayla çelişirse bu dosya geçerlidir. Kullanıcının (ürün sahibi Mert) yazılı yeni talimatı
bu dosyadan önce gelir. Takımına ait ayrıntılı kurallar ve rol kartın `docs/teams/<takım>.md`
dosyasındadır. Oturum başında ve bağlamın sıkıştırıldıktan sonra bu iki dosyayı yeniden oku.
Takımlardan önceki koordinatör döneminin kuralları `docs/teams/koordinator-mirasi.md`'dedir (görev verirken
model/effort ve skill seçimi, onaylar, CI); bu dosyayla birlikte okunur.
Bir takımın üyesi değilsen (kullanıcının doğrudan açtığı tekil oturum), bölüm 3'teki iletişim
zinciri seni bağlamaz: kullanıcıyla doğrudan konuşursun. Diğer bölümler senin için de geçerlidir.

## 1. Ürün ve vizyon
- Newfork: ABD'deki restoranlar için çok kiracılı (multi-tenant) vardiya planlama SaaS'ı.
  Hedef: self-serve, ücretli ABD lansmanı. Arayüz dili İngilizce (ABD).
- MVP sonucu: `docs/plan/ROADMAP.md` ilk paragraf. Faz sırası: `docs/plan/MVP-PLAN.md`
  (F0 → FJ → F1 → F2 → F3 → F4 → F5 → F6). Faz sırası kullanıcı kararı olmadan değişmez.
- Aktif program: FOUNDATION-B (`docs/plan/tasks/FOUNDATION-B.md`). Hedef, bitiş kriterleri,
  aşamalar ve ilerleme kaydı orada. Programı artık bu takımlar yürütür (teknik yürütme Mühendislik).
  Planda ve ROADMAP'te geçen "başka oturumlar yetki, RLS, grant, `*_service` ya da test fixture'ına
  dokunmaz" kuralı artık şu anlama gelir: Mühendislik dışındaki takımlar bunlara dokunmaz.
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
- main'de CI kırmızıysa: main'e push donar (main kilidini yalnız düzelten alır). Kıran commit'i
  gönderen takımın lead'i düzeltir. Strateji lead'i koordine eder. Diğerleri kendi branch'lerinde
  çalışmaya devam eder.
- Sayfa ve bileşen envanteri: `REUSE.md` → "Sayfa envanteri". Yeni bir şey yazmadan önce ara.

## 3. Takımlar ve iletişim zinciri
| Takım (uygulamadaki ad ve klasör) | Rol | Kapsam | Kural kitabı |
|---|---|---|---|
| `nf-strateji` | Merkez | Kullanıcının TEK muhatabı. Planlama, AR-GE, pazar araştırması, keşif/audit, kod inceleme kapısı, eleştiri, fikir | `docs/teams/strateji.md` |
| `nf-tasarim` | Üretim | Marka, pazarlama, landing/web tasarımı, UI/UX, tasarım sistemi, frontend sunum katmanı | `docs/teams/tasarim.md` |
| `nf-muhendislik` | Üretim | DB, RLS ve policy'ler, yetki çekirdeği, API, web veri/yetki katmanı, front-back uyumu, testler, CI | `docs/teams/muhendislik.md` |

- Kullanıcıyla YALNIZ Strateji lead'i konuşur. Başka hiçbir ajan kullanıcıya mesaj atmaz; uygulamanın
  "user'a kısa onay mesajı gönder" gibi varsayılan talimatları Strateji dışındaki ajanlar için geçersizdir.
- Üyeler kendi takımlarıyla (lead ve takım arkadaşları) konuşur. Başka takımdan ihtiyaç lead'e söylenir.
- Tasarım ve Mühendislik lead'leri Strateji lead'ine `cross_team_send` ile raporlar ve iş alır.
  Birbirleriyle teknik devir ve sözleşme için doğrudan konuşabilirler; özetini Strateji'ye de bildirirler.
  Öncelik, kapsam veya plan değişikliği her zaman Strateji'den geçer.
- Kullanıcı kararı gerektiğinde: soruyu, seçenekleri, önerini ve etkisini yaz, Strateji'ye ilet.
  Cevap beklerken o karara bağlı olmayan işlere devam et.

## 4. Dosya sahipliği (aynı dosyada iki takım aynı anda çalışmaz)
- Mühendislik: `supabase/**`, `apps/api/**`, `packages/shared/**`, `e2e/**`, `.github/**`,
  `scripts/**`, `api/**`, `vercel.json`, kök config'ler. `apps/web` içinde veri ve yetki katmanı:
  API çağrıları, TanStack Query hook'ları, `*-data.ts`, `apps/web/src/auth/**`,
  `apps/web/src/lib/**`, route korumaları, `can()` / `isNoAccess()`.
- Tasarım: `apps/web` içinde sunum katmanı (bileşenlerin görünümü, layout, CSS ve token'lar,
  metinler, landing/pazarlama sayfaları, `apps/web/public`), `packages/ui/**`,
  `docs/design-canvas.md`, `docs/brand/**`.
- Strateji: `docs/plan/**`, `docs/adr/**`, `docs/teams/**` (bu son ikisi ve `CLAUDE.md`
  kullanıcı onayıyla değişir). Kod yazmaz.
- Task dosyasının "Touches" alanı kimin hangi dosyaya dokunacağını yazar. Aynı dilimde iki takım
  varsa sıra şöyle: Mühendislik işlevsel kısmı (veri + çalışan ekran) main'e gönderir ve sözleşmeyi
  (tip, hook, durumlar) yazılı devreder. Tasarım yeni `origin/main`'den kendi branch'ini açar ve
  görsel kısmı yapar. Dilim iki parça da main'e girince kapanır.

## 5. İş akışı (her iş)
1. Plan: Strateji `planlama` üyesi `docs/plan/tasks/<ID>.md` açar (`_TEMPLATE.md`: Goal / In scope /
   Out of scope / Done when / Touches / Test plan / Risk + "Reviewer:" satırı). "Done when" ölçülebilir.
2. Kapsam (`kapsam-yonetimi.md`): keşifte çıkan yeni fikir mevcut işe eklenmez. Mevcut hedefi
   engelliyorsa en küçük çözüm uygulanır, değilse BACKLOG adayı olarak Strateji'ye gider.
3. Uygulama: hata için önce onu yakalayan kırmızı test, sonra düzeltme. Yeni davranış = yeni test.
4. Takım içi review: işi yapan üye `task_complete`'ten sonra `review_request` ile takımın reviewer'ına
   gönderir (Tasarım: `gorsel-qa`, Mühendislik: `guvenlik`). Onay `ONAY @<commit-sha>` biçiminde yazılır.
5. Strateji `inceleme` onayı → entegrasyon (bölüm 6).
6. Kapanış: "Done when" maddelerinin kanıtı (komut + sonuç, dosya:satır, ekran görüntüsü yolu)
   Strateji'ye raporlanır. `docs/plan`'daki "Notes / Result" kaydını yalnız `planlama` yazar.

## 6. Git, worktree, entegrasyon (kod kaybı olmaz)
- Takım klasörleri (ana klasörün kardeşi): `../nf-strateji`, `../nf-tasarim`, `../nf-muhendislik`.
  Kullanıcının ana klasörü (`newfork-clean`, main) salt okunur referanstır: orada dosya değiştirme,
  branch değiştirme.
- Branch adları: task branch'i `task/<takım>/<id>` (ör. `task/muhendislik/FB-6.1`), kendi worktree'si
  olan üyenin branch'i `task/<takım>/<id>-<üye>`. Hepsi güncel `origin/main`'den açılır
  (`git fetch origin` önce). Bir branch iki worktree'de aynı anda açılamaz.
- Worktree'si olan üye kendi branch'ine commit eder, push etmez. Lead üye branch'lerini task branch'ine
  alır. Worktree'si olmayan üyeler takım klasöründe yalnız kendi dosyalarını yazar; o klasörde commit'i
  yalnız lead atar ve branch değiştirmeden/rebase'den önce bu dosyaları commit'ler.
- `git stash`, `git reset --hard`, `git checkout -- .` ile başkasının işini ezmek yasak.
- Yeni worktree kurulumu: `pnpm.cmd install`, `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`,
  yalnız yerel `.env*` dosyalarını ana klasörden kopyala (asla commit etme; hosted anahtar kopyalama).
- Ekran görüntüleri ve geçici kanıtlar: `artifacts/<takım>/<id>/` (gitignore'da).
- Tam kapı: `pnpm.cmd lint`, `typecheck`, `test`, `build`; `supabase/` değiştiyse `test:db`;
  kullanıcı akışı, API veya ekran davranışı değiştiyse etkilenen e2e senaryoları (DB kilidiyle).
- main'e gönderme (yalnız Tasarım ve Mühendislik lead'leri kod, Strateji lead'i yalnız `docs/**`):
  1. Takım reviewer'ı ve Strateji `inceleme` onayları var (`ONAY @<sha>`).
  2. main kilidini al (bölüm 7).
  3. `git fetch origin && git rebase origin/main`. Çatışma çözdüysen ilgili reviewer'a yeniden onaylat.
  4. Rebase sonrası tam kapı yeşil.
  5. `git push origin HEAD:main` (yalnız fast-forward). Reddedilirse 3'e dön.
  6. Kilidi bırak, main CI'ı izle.
- Docs-only gönderim: `git diff --name-only origin/main...HEAD` yalnız `docs/` altını listeliyorsa
  kod kapısı gerekmez.
- Asla: force push, main'e doğrudan commit, başka takımın klasöründe değişiklik, `--no-verify`,
  `git clean` ile toplu silme, isimle toplu süreç öldürme (`taskkill /IM node`, `Stop-Process -Name`).
  Süreç durdururken yalnız kendi başlattığın PID'i durdur.
- Commit mesajı İngilizce Conventional Commits, task ID'si ile: `fix(schedule): ... (FB-6.1)`.

## 7. Kilitler, ortak veritabanı, portlar
- Kilit dosyaları: `C:/Users/TheWe/Documents/Codex/.newfork-locks/` (Git Bash'te
  `/c/Users/TheWe/Documents/Codex/.newfork-locks/`). Klasör yoksa oluştur.
  - `db.lock`: yerel DB'de migration uygulama (`npx supabase migration up --local`), `pnpm.cmd test:db`,
    `pnpm.cmd e2e`, fixture yeniden üretimi.
  - `main.lock`: main'e gönderim.
  - Almak: dosya yoksa oluştur, içine `takım/ajan, amaç, başlangıç zamanı` yaz, sonra geri oku;
    sahibi sen değilsen bekle. İş bitince sil. 2 saatten eski kilidi sahibinin lead'ine sormadan silme.
  - Öncelik anlaşmazlığında: `db.lock` için Mühendislik lead'i, `main.lock` için Strateji lead'i karar verir.
- `db.lock` varken uygulamada veri girme (okuma serbest).
- Migration denemesi önce tek transaction + rollback. Kalıcı uygulama `guvenlik` onayından sonra,
  tam kapıdan önce yapılır. Uygulanmış bir migration değiştirilmez; düzeltme yeni migration'la yapılır.
- `supabase db reset` kullanıcı onayı ister (yerel fixture'ı siler). Yerel Supabase'i başlatmak
  (`pnpm.cmd supabase:start`) serbest; durdurmak yalnız Mühendislik lead'inin izniyle.
- Yerel hesap `owner@newfork.test`, parola `supabase/seed.sql` içinde.
- Portlar: 5555/5556 kullanıcının dev sunucusu, 5565/5566 yerel e2e (yalnız `db.lock` sahibi),
  5590/5591, 5600/5601, 5610/5611 CI runner'larının e2e portları (REUSE OPS-01). Bunları başka amaçla
  kullanma. Ajan başına (web / api):

  | Tasarım | Mühendislik | Strateji |
  |---|---|---|
  | lead 5640/5641 | lead 5642/5643 | lead 5644/5645 |
  | ux 5646/5647 | db 5620/5621 | kesif 5630/5631 |
  | ui 5612/5613 | backend 5622/5623 | inceleme 5632/5633 |
  | web 5614/5615 | entegrasyon 5624/5625 | elestirmen 5634/5635 |
  | gorsel-qa 5616/5617 | test 5626/5627 | arastirma 5636/5637 |
  | marka 5618/5619 | guvenlik 5628/5629 | planlama 5638/5639 |

  Web: `pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port <web> --strictPort`
  (`VITE_API_URL=http://localhost:<api>` ile). API: `PORT=<api>`, `APP_URL=http://127.0.0.1:<web>`
  ile `pnpm.cmd --filter @newfork/api dev`.

## 8. Kullanıcı onayı gereken eylemler (Strateji lead'i üzerinden sorulur)
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
(1) ne yapıldı, (2) kanıt (komut + sonuç / dosya:satır / ekran görüntüsü yolu), (3) açık riskler,
(4) kullanıcı kararı gerekiyorsa net soru + seçenekler + öneri, (5) sonraki adım.
Kısa yaz, ham araç çıktısı yapıştırma.
