# Koordinatör devri — 2026-09-30 öğleden sonra (kullanıcı PC başında)

Devreden: "Koordinatör" (`local_c575161a-0a35-45af-ae96-d4e74880bc97`); bağlamı %71, iş sınırında (G8a main'e girdi) devrediyor.
Devralan: havuzdan "Bekle … (47)" (`local_0ee21aaa-9f24-4054-9a31-f2b30ed80270`); yeni başlık "Koordinatör". **Güncel koordinatör kimliği budur** (`CLAUDE.md` §3 ve §12 buraya işaret eder).
Ölçüm anı (12:10): `origin/main` = bu commit; altındaki son kod `3c07c15d` (G8a + BL-480 + `nf-guvenlik` notları); main CI koşuyordu — ilk iş sonucunu kontrol et. **Canlı veritabanı = main** (son migration `20261003000000`, MCP ile ölçüldü; danışman yeni bulgu yok). Ortak yerel DB = main. Kilitler boş. Haftalık kullanım %86 (sınır %90; `get_usage`).

**Kullanıcı UYANIK ve bu pencerede konuşuyor.** Kararları o verir (tek tık, önerilen ilk). Pano: `docs/plan/ILERLEME-PLANI.md` §0 (kayıt oturumu tutar). Kayıtları kendin yazma; kayıt oturumuna "BESLEME #n" gönder (sıradaki #18).

## 0. Bu devirde değişen iki temel gerçek (oku)
1. **Main her gönderimde CANLIYA çıkıyor.** Vercel projesi `mert-2a14/newfork-clean-api`, üretim `https://newfork-clean-api.vercel.app`, canlı veritabanı `hvyvyisrqyathtliyyyv`. Vercel MCP başka hesaba bağlı (eski `newfork` projesi) — canlıyı onunla değil `npx vercel ls newfork-clean-api --scope mert-2a14` ile ölç. Hafıza: `vercel-live-deploy`. BL-426 bu yüzden bayat kapandı.
2. **OPS-03 gevşemez:** kodu yeni bir veritabanı alanına/kuralına dayanan işte önce canlı migration, sonra main. 2026-09-30 sabah EMP-001 C bu kurala uyulmadan girdi; canlıda çekmece ~2 saat 20 dakika açılmadı (benim hatam). G8a doğru sırayla girdi.

## 1. İlk işler (sırayla)
1. `get_session self`: başlık "Koordinatör", sabitli, Remote Control açık (devreden ayarladı; doğrula). Main CI'ı (`3c07c15d`) kontrol et: `gh run list --limit 5 --json databaseId,headSha,headBranch,status,conclusion` — koşuyu `headSha`'dan bul (`--branch main --limit 1` eski koşu döndürüyor). Yeşilse kullanıcının ana klasörünü ileri sar: `git -C C:/Users/TheWe/Documents/Codex/newfork-clean merge --ff-only origin/main`.
2. **BESLEME #18** (kayıt oturumu `local_021d990c-f27a-4277-b47e-81e2a5f65129`): G8a main'de (`3c07c15d`; toplu dal `task/batch-t13`; dal CI 36762141166 yeşil; `nf-guvenlik` üç tur, ONAY @`53c70344`; kullanıcının ultrareview'ü iki bulgu — ikisi de düzeltildi; canlı migration kullanıcı tarafından main'den ÖNCE gönderildi, yedek `newfork-wt/coord/artifacts/g8a/hosted-*.sql`; yerel yedek `…/g8a/schema-before-20261003000000.sql`). BL-132 kapanır (G8a). BL-480 kapanır: kullanıcı B'yi seçti (kurulum sihirbazı 3. adım, yalnız Management varken "Your structure"da "<Management adı> comes with every workspace. Add a department for the jobs your team works."). Notlar backlog'a: arşivli atamada "Remove" ret, çıkış "geri al → çıkar → arşivle" (BL-493 zaten açıldı); `nf-guvenlik` N2 (bütün lokasyonları arşivli dışa aktarma kuralını müdür düzenleyemez, owner/admin düzenler; low); sihirbazda Management satırında "Remove" düğmesi (low / safe, `nf-arayuz` BL-480 raporu). KK: G8a sırası — önce canlı, sonra main (OPS-03, KK-65 düzeltmesiyle). Raporlar: `…/optimistic-dewdney-c78421/artifacts/nf-db/g8a/RAPOR.md`, `…/friendly-blackwell-4012e6/artifacts/nf-guvenlik/g8a/RAPOR.md`, `…/wonderful-gates-d0f15a/artifacts/nf-arayuz/bl-480/RAPOR.md`.
3. **`www.tepebash.com` taşıma — kullanıcı ONAYLADI ("Evet, G8a'dan sonra"), şimdi sırası.** Adımlar: (a) alan adını eski hesaptaki (`theweiwuer-1163's projects`, proje `newfork`) projeden çıkarmak — kullanıcı, eski hesabın Vercel paneli (ajan aracı yok); (b) `npx vercel domains add www.tepebash.com newfork-clean-api --scope mert-2a14` (ya da panel) — Vercel DNS doğrulaması isteyebilir, DNS kaydını kullanıcı ekler; (c) `newfork-clean-api` üretim ortamında `APP_URL=https://www.tepebash.com` (gizli değer değil; e-posta bağlantıları için); (d) Supabase → Authentication → URL Configuration: izinli yönlendirmelere `https://www.tepebash.com` (kullanıcı). Sonra canlıda giriş ve bir iki ekran kontrolü. Gizli anahtar girme; eski projenin ortam ayarlarına dokunma.
4. **Sıradaki iş (kullanıcıya sor, tek tık):** (a) BL-475 veritabanı kısmı — `nf-db`: işlerin okumaları ve iki seçim (yeni birincil iş, Employees listesindeki iş adı) `lower(name)` ile sıralanır, `reorder_organization_entities` yalnız departmanları kabul eder; ardından `nf-arayuz` Settings → Jobs'ta işlerin "Move up / Move down"unu söker (kullanıcı kararı "A→Z, elle sıralama kalksın"; `nf-arayuz` ölçümü BL-475 mesajında: `task/bl-475` boş). Yeni migration → OPS-03 sırası. (b) G8b / BL-254 (arşivli iş ve vardiya tipi adı; `tasks/G8.md` G8b; `nf-db` + `nf-backend`, R2). Kullanıcının genel sırası "küçükler, sonra G8a → G8b" idi; BL-475 sonradan geldi. Öneri: BL-475 önce (küçük, kullanıcının istediği), sonra G8b.

## 2. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt) | `local_021d990c-f27a-4277-b47e-81e2a5f65129` | boşta, bağlam ~%42; #17 main'de (`27fe4bb4`) |
| Rol: nf-db | `local_8918dfd6-f929-4312-857e-58362641f3a4` | G8a bitti; bağlam ölç (yarıyı geçtiyse BL-475'ten önce yenile) |
| Rol: nf-backend | `local_2464b099-317e-437f-ac12-5a506804d03d` | boşta, bağlam ~%56 → bir sonraki işte yenile |
| Rol: nf-arayuz | `local_0038c687-1790-4cc8-9238-7d12778fa31f` | BL-480 bitti; BL-475 web kısmını bekliyor |
| Rol: nf-test | `local_17d5b65d-25bc-435f-9d86-677996a391f2` | boşta |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta; notları main'de (`3c07c15d`) |
| Rol: nf-gorsel-qa | `local_2a24338f-ba49-4311-acbe-4f916b5ae06d` | boşta, bağlam ~%50 |
| Havuz | "Bekle … (48)", "(49)", "(50)" | boş |
| "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | `local_5834dbdf…` | **ARŞİVLEME:** bütün rol oturumları onun alt oturumu; arşivlenirse boştaki alt oturumları da arşivler |
| Kullanıcının oturumları | "Employee drawer UI improvements", "Dev sunucusu başlat" | dokunma |

2026-09-30'da 14 eski oturum arşivlendi (raporları `newfork-wt/coord/artifacts/archive-2026-09-30/`); klasörleri uygulamanın "hazır" havuzunda. Kalan 5 alt ajan klasörü (`agent-a…`) notları main'de, silinmeye hazır (kullanıcı henüz istemedi).
Worktree'lerin: `newfork-wt/coord` (docs, `CLAUDE.md`, canlı gönderim buradan — `supabase/.temp` bağlantısı orada; `git switch --detach origin/main` ile başla), `newfork-wt/merge-account` (toplu dallar; son `task/batch-t13`).

## 3. Kullanıcıda bekleyen (pano §0c'nin güncel özeti; ayrıntı orada)
BL-204 konuşması; BL-118 (owner kendi belgesi; öneri: şimdi değil); BL-437 (zamanlanmış dışa aktarma); OPS-03'e "alan silen işte sıra ters" cümlesi; `CLAUDE.md` bekleyen üç kural parçası (4b, 4c, 4d); BL-417, BL-419, BL-073, BL-355(3), BL-370; onaylar BL-105, BL-382, sürüm atlamaları; uzak dal silme komutu (48+ dal; `task/batch-t12`, `task/batch-t13`, `task/g8a` de eklendi); K10, K7.

## 4. Dersler (bu devir)
- **GateGuard kancası** ilk Bash'i, dal değiştiren / push eden / yeni dosya yazan / hafıza düzenleyen çağrıyı önce reddeder; istenen gerçekleri yazıp AYNI çağrıyı yinele.
- **Git Bash yol çevirisi:** `git rev-parse "origin/main:.claude/…"` ve `git show origin/main:<yol>` yanlış sonuç veriyor (MSYS yol çevirisi). `export MSYS_NO_PATHCONV=1` kullan; ama o açıkken `git -C /c/...` çalışmaz — Windows yolu (`C:/Users/...`) ver.
- **Kayıt oturumu ve öteki roller kullanıcıdan karar alabilir;** canlı işlem ve geri alınamaz silme onayı yine koordinatörün penceresinde yeniden alınır (`CLAUDE.md` §8).
- **Test dosyası ekranın yolunu kanıtlamaz:** G8a'da tabloyu doğrudan okuyan hücre Settings → Locations'ın servis yolunu kaçırdı (Y2). Lokasyon/yetki işinde görevi verirken "hücreler ekranın çağırdığı servisten" yaz.
- **Uygulamanın arşivi klasörleri silmiyor**, "hazır" havuzuna alıyor; kaydedilmemiş değişikliği olan klasörü "kept after archive" diye tutuyor → `get_storage_usage` + `discard_kept_worktree` (kullanıcı onay kartı).
- Önceki devirlerin dersleri git geçmişinde: `git show a98b0671:docs/plan/HANDOFF.md`.
