# Koordinatör devri — 2026-10-01 ~22:00Z (kullanıcı PC başında, devri kendisi onayladı)

Devreden: "Koordinatör" `local_353d5a30-43c0-42ad-a441-672bec294a0d` (worktree `sharp-wescoff-6267c7`); bağlam yarıyı geçti, iş sınırında devrediyor.
Devralan: havuzdan "(51)" `local_b355d250-87e7-4503-b04c-16a7ebc581d1` (worktree `busy-kowalevski-4eedf7`) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.**
Kullanıcı (Mert) bu akşam PC başındaydı; son kararları ~21:50Z. Sorular çoktan seçmeli, tek turda, CLAUDE.md §13 şablonuyla.

## 0. Temel gerçekler
1. **Önce kendi worktree'ni tazele:** (51) 16 saat önceki main'den (`e013c442`) açıldı; yüklediğin CLAUDE.md/ILKELER eski. İlk komut: `git fetch origin && git checkout --detach origin/main` (kendi worktree'nde), sonra `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` dosyalarını yeniden oku. Hook betikleri (`scripts/*.mjs`) çalışma anında okunur, tazelenince yenisi geçer.
2. Main her gönderimde CANLIYA çıkar (Vercel). OPS-03: alan EKLEYEN migration önce canlı (kullanıcı onayı, bu pencerede) → ortak yerel DB → main; alan SİLEN iş önce main, sonra canlı.
3. Canlı gönderim yolu: Supabase MCP'li alt ajan — yedek → `apply_migration` → `schema_migrations.version` dosya adına eşle → md5 dosya = canlı `prosrc` → `get_advisors security`. CLI `supabase db push` yasak.
4. Kilitler ayrı Bash çağrısında: `node scripts/lock.mjs take main "<rol/oturum>, <amaç>"` → işlem → `release`. `lock take && git push` zinciri guard'da engellenir.
5. Yeni pgTAP dosyası taşıyan push'tan önce `bash scripts/ci-green-guard.sh origin/main`.
6. **YENİ (main `1b88c0d9`, Mert kararı "Uyarı modunda kapı kur"):** yerel Playwright koşusu temiz ağaçta geçince `<inbox>/e2e-pass.jsonl`'a damga düşer; main push'u ekran/API/e2e kodu değiştirip aynı içerikte damga yoksa guard uyarır + audit `push-main-e2e-missing`. Engellemez. Kural: **commit'ten sonra** etkilenen e2e'yi db.lock ile koş, sonra push. (e2e unutma main'i 3 kez kırdı; sonuncusu bugün G14, benim hatam.)
7. Posta kutusu: `node scripts/inbox.mjs claim` çıplak komut; arka planda `node scripts/inbox.mjs wait 3600`; her uyanışta oku → bağımsız doğrula (commit, CI) → `ack` → yeniden başlat.
8. İnceleme: R3 → `nf-guvenlik` alt ajanı (`model: opus`). Kayıt: `C:/Users/TheWe/Documents/Codex/newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` (§1–§9). Görsel QA → `nf-gorsel-qa` alt ajanı; **telefonda gerçek dokunma testi** iste (`hasTouch` + `touchscreen.tap`), fareyle 390px kanıt sayılmaz.
9. Bütün ilerleme kayıtlarını kayıt oturumu yazar; sen BESLEME gönderirsin (son: **#86**; sha'sı bekleniyor).
10. coord worktree (`../newfork-wt/coord`) artık `node_modules` taşıyor; birleştirme ve tam kapı orada koşar (`git checkout -B <ad> <dal>` → `rebase origin/main` → kapı → push → `checkout --detach origin/main`).

## 1. İlk işler (sırayla)
1. §0.1 tazeleme. `get_session self`: başlığı "Koordinatör" yap, sabitle, RC aç.
2. `node scripts/inbox.mjs claim` (çıplak), sonra arka planda `wait 3600`.
3. BESLEME #87 kayıt oturumuna: yeni koordinatör kimliği + bu HANDOFF'un sha'sı (kayıt ILERLEME §0'ı günceller).
4. Müdür notu oturumuna (`local_4ba671c6`) yeni adres (tek satır).
5. Kullanıcıya: devreden oturumu (`local_353d5a30`) arşivlemeyi sor (dalı yok, worktree temiz; bilgisi bu dosyada).

## 2. Aktif işler
**FB-6.3 (izin oylaması)** — `docs/plan/tasks/FB-6.3.md`. `.0`–`.8` (8b, 8c, 8d dahil) main'de ve canlıda; son: `.8c` "izin talebini yalnız karar veren görür" `21abd43e`, CI `36915443169` yeşil. **Kalan `.9` kapanış** (onaylı planın sıradaki adımı; sorulmadan yürür): Done-when kanıtları task dosyasına, ROADMAP/FOUNDATION-B kaydı, KARARLAR `:370` ve "İzin" satırı düzeltmesi (nf-db raporunun notu) — kayıt oturumuyla.

**G14 / BL-204 (Schedule müsaitlik ve onaylı izin işaretleri)** — kullanıcının doğrudan istediği, paralel iş.
- Dilim c **main'de**: `8ff3a6ce`, `aedf014f`, `144e8a18` + e2e düzeltmesi `f707e047`; CI `36927026697` yeşil. Görsel QA (alt ajan) ilk turda telefon dokunmasını yakaladı, düzeltildi.
- **Sürüyor: müdür notu metni** (Mert "Şimdi göster"): havuz (80) `local_4ba671c6` "Rol: nf-db — G14 müdür notu metni", dal `task/g14-manager-note`, worktree `../newfork-wt/g14-note`. R3 (kim görür kuralı yetki çekirdeğinde, `packages/shared/src/authorization.ts:274`): nf-guvenlik zorunlu; shared şemaya nullable alan → OPS-03 migration önce canlı (kullanıcı onayı). Ürün sorusu dönerse (ör. eş müdür görür mü) KARARLAR'da yoksa kullanıcıya sor. Rapor `G14-note` adıyla posta kutusuna gelir. Bitince ekran değiştiği için görsel QA (dokunma dahil).
- Yolda: Publish → Pre-flight'ta üç grubun ortak amber kenar çizgisi + ad sütunu simgesi → BL-524 (low/safe); renk körlüğü → BL-525 (Mert: backlog'a, ertelendi).

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt ve ilerleme) | `local_dfa3c062-8f57-4624-89e4-18878a8dd629` | aktif, sabit, RC açık, bağlam ~%40 |
| Rol: nf-db — G14 müdür notu metni | `local_4ba671c6-7f81-43ed-8a10-9bfa1048db9a` (80) | **çalışıyor** (~21:52Z başladı) |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta; incelemeler alt ajanla yapılıyor |
| (eski) Koordinatör — öğlen | `local_2464b099…` | **"Bilgisayarı uyanık tut" açık; yalnız kullanıcı kapatabilir**, sonra arşiv |
| Devreden koordinatör | `local_353d5a30…` | arşiv kullanıcıya sorulacak |
| Havuz boş | (52)–(55): `local_43ff0725…`, `local_3dd6f9d4…`, `local_abc4d126…`, `local_10a5177a…` | hepsi `e013c442` tabanlı: kullanırken önce worktree'yi origin/main'e taze. Başka boş oturum yok — gerekirse kullanıcıdan yeni havuz istenir |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

Bugün arşivlenenler (hepsi main'de doğrulandı): FB-6.3.6/6b/7/8b/8c/8d rol oturumları, eski kayıt `d0ebd71f`, G14 üretim `6c5affee`, G14 mockup `ea341890`. Silinen dallar `refs/nf-backup/branch/...` altında.

## 4. Temizlik artıkları
- Üç boş worktree klasörü kilitli (git listesinde yok): `.claude/worktrees/elastic-austin-a0eb0f`, `modest-nightingale-f80f25`, `strange-vaughan-f53be3`. PowerShell `Remove-Item -LiteralPath '\\?\<yol>' -Recurse -Force` ile sonra yeniden dene.
- `task/g14-a` (main'de, +0; silinebilir), `task/g14-plan` (+1 docs commit, worktree `agent-a4489d63f38f27eeb` — sahibini ölç, sonra karar), `refs/nf-backup/fb637-pre-reword` (FB-6.3.7 main'de; silinebilir).
- Ortak yerel DB'de G14 test verisi (Meyhouse: Alex Kim 10 Ekim izni, Jordan Lee pazartesi müdür notu, 5–11 Ekim taslağı) — müdür notu işi bunu kullanabilir; zararsız.

## 5. Dersler (bu devir)
- e2e: commit'ten sonra, push'tan önce (§0.6). Kapı artık uyarıyor; uyarıyı gördüğünde dur ve koş.
- Görsel QA'da telefon = gerçek dokunma; uygulayıcının "telefon" görüntüsü fareyle alınmıştı.
- Yeniden yazılmış (reword/rebase) dalın main'de olduğunu sha ile değil `git cherry -v origin/main <dal>` + başlık eşleşmesiyle ölç.
- Arşiv bazen worktree kaydını bırakır: temizse `git worktree remove`, uzun yol hatasında PowerShell `\\?\`.
- Önceki devirlerin dersleri: `git show 66ff28aa:docs/plan/HANDOFF.md`.
