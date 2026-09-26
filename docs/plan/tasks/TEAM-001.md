# TEAM-001 Agent Teams AI'dan koordinatör + rol ajanları düzenine geçiş
Status: done (2026-09-25)
Session: Koordinatör (local_7488a3bf)   Branch: yok (docs + ajan tanımları, main'e doğrudan fast-forward)   Worktree: newfork-wt/coord   DB: -

Reviewer: kullanıcı (düzen kararı), koordinatör (uygulama).

## Neden
2026-09-25 gecesi Agent Teams AI ile 3 takım, sonra tek takım (15 üye) kuruldu. Yaşananlar:
- Bilgisayar dondu (tek makinede 20+ ajan).
- Üyeler sık koptu, aynı mesaj tekrar tekrar gitti.
- Uygulamanın gömülü Claude Code'u (2.1.251) Opus 5.5'i çalıştıramıyor; takım Opus 5'te kaldı.
- Sessiz ayar hataları: yanlış klasör, yanlış takım adı (`signal-ops`), 10 üyede bozuk yol.
Kullanıcı uygulamayı bırakma kararı verdi (2026-09-25). Takımın ürettiği iş (FB-6.1 görev dosyası,
ölçümler, pre-mortem) değerli; kurallar ve rol kartları da değerli. Kaybolmamalı.

## Goal
Kullanıcı tek muhatapla (Koordinatör) konuşur; koordinatör sabit uzmanlıkları olan rol ajanlarını
ihtiyaç anında çağırır, ajan işi yapar, rapor verir ve kaybolur (idle). Uzun kod işleri ayrı ve
görünür bir işçi oturumunda, aynı rol tanımıyla koşar. Agent Teams AI'dan geriye iş, dosya ya da
branch kalmaz.

## Araştırma (2026-09-25, Claude Code belgeleri: code.claude.com/docs/en/sub-agents.md, agent-teams.md)
| Soru | Cevap | Bu plan için anlamı |
|---|---|---|
| Sabit rol tanımlanabilir mi? | Evet: `.claude/agents/<ad>.md`, alanlar `name, description, tools, disallowedTools, model, effort, permissionMode, skills, memory, background, maxTurns, isolation, color, hooks` | Rol = tek dosya; uzmanlık, model, effort, araç sınırı orada sabit |
| Rol ajanı birikim yapabilir mi? | Evet: `memory: project` → `.claude/agent-memory/<ad>/` (git'te) | Her rol kendi öğrendiklerini tutar, tekrar keşfetmez |
| Kod yazan rol başkasını ezer mi? | `isolation: worktree` ile geçici ayrı kopyada çalışır | Aynı dosyada iki rol çakışmaz |
| İş bitince devam ettirilebilir mi? | Evet: `SendMessage` ile ajan id'sine | Düzeltme turu aynı bağlamla yapılır |
| CLAUDE.md'yi görür mü? | Evet (non-fork) | Anayasa tek yerde kalır |
| Proje mi kullanıcı mı? | Proje `.claude/agents` kullanıcı seviyesini ezer | `nf-` önekiyle çakışma olmaz (kullanıcıda `supabase-backend-architect` vb. var) |
| Paralel sınır | Varsayılan 20 | Kendi kuralımız: aynı anda en çok 2 ağır iş |
| Sınırlar | Kullanıcı subagent'ı canlı izleyemez, ona yazamaz; koordinatör oturumu kapanırsa yarım iş gider; soru sormak için koordinatöre döner | Uzun ve görünür olması gereken iş işçi oturumuna gider |
| Yerleşik agent teams | Deneysel; görev durumu gecikir, `/resume` ile dönmez, önerilen 3-5 üye | Şimdilik kullanılmaz; ileride tek seferlik paralel araştırma için aday |

## Kararlar (kullanıcı onayı ister)
1. **Karışık düzen (Önerilen).** Roller subagent olarak tanımlanır. Kısa ve orta işler (inceleme,
   görsel QA, keşif, araştırma, plan, test koşturma, küçük düzeltme) subagent olarak çağrılır. Uzun
   kod işleri (ör. FB-6.1'in alt dilimleri) işçi oturumunda koşar; oturum aynı rol dosyasını okur,
   iş bitince rapor verir ve arşivlenir. Kalıcı açık rol oturumu yok.
   Alternatif: 3 kalıcı rol oturumu (DB, Backend, Arayüz). Artısı: canlı izleme hep hazır. Eksisi:
   bağlam birikir, her işte temizlik gerekir, kenar çubuğu kalabalık.
2. **Rol listesi (7).**
   | Ajan | Uzmanlık | Yazar mı | Model / effort | Kaynak kart |
   |---|---|---|---|---|
   | `nf-db` | şema, RLS, yetki çekirdeği, migration, pgTAP, performans | evet (worktree) | opus / high | muhendislik.md → db |
   | `nf-backend` | Fastify API, shared tipler, web veri/yetki katmanı, front-back sözleşmesi | evet (worktree) | opus / medium | muhendislik.md → backend + entegrasyon |
   | `nf-test` | vitest, pgTAP koşturma, Playwright e2e, CI ve runner'lar, kırmızı test ayrımı | evet (worktree) | sonnet / high | muhendislik.md → test |
   | `nf-arayuz` | ekran düzeni, CSS/token, metin, UX akışı, varyant hazırlama | evet (worktree) | opus / medium | tasarim.md → ux + ui + web |
   | `nf-guvenlik` | main'e gidecek her işin güvenlik ve kod incelemesi, tenant/yetki | hayır | opus / high | muhendislik.md → guvenlik + strateji.md → inceleme |
   | `nf-gorsel-qa` | ekran görüntüsüyle görsel tutarlılık, WCAG AA | hayır | sonnet / medium | tasarim.md → gorsel-qa |
   | `nf-planlama` | task dosyası, backlog, keşif/ölçüm, rakip araştırması, pre-mortem | yalnız `docs/plan/**` | opus / medium | strateji.md → planlama + kesif + arastirma + elestirmen |
   `marka` rolü şimdilik yok (MVP'de pazarlama işi yok); gerekirse eklenir.
3. **`docs/teams/` kaldırılır.** Rol kartları `.claude/agents/`'a taşınır; koordinatör kuralları
   `docs/teams/koordinator-mirasi.md` yerine `CLAUDE.md`'nin yeni bir bölümüne girer. Tek kaynak.
4. **Agent Teams AI uygulaması** kullanıcının bilgisayarından kaldırılsın mı? Kaldırma kullanıcının
   işi (Windows "Uygulamalar"). Veri klasörleri silinmeden önce yedeklenir (Task 2).

## Out of scope
- Ürün işi. FB-6.1 bu düzen kurulduktan sonra ilk gerçek iş olarak gelir.
- Yerleşik agent teams denemesi.
- `CLAUDE.md` dışındaki kural dosyalarının (REUSE, BACKLOG) yeniden düzeni.

## Done when
1. Agent Teams AI süreçleri kapalı: `Get-Process claude-multimodel` 0 döner.
2. Takımın bitmiş işi main'de (FB-6.0-can, FB-6.1a–d, BACKLOG değişikliği, pre-mortem), bitmemiş
   işi yok ya da adıyla kayıtlı.
3. `git worktree list` yalnız `newfork-clean` ve `newfork-wt/coord` gösteriyor; `team/*` ve
   `worktree-team-*` branch'i yok; `nf-muhendislik`, `nf-tasarim`, `nf-strateji` klasörleri yok.
4. `.claude/agents/nf-*.md` 7 dosya main'de; koordinatör oturumu yeniden başlatılınca Agent aracının
   listesinde 7'si görünüyor.
5. `CLAUDE.md` yeni düzeni anlatıyor; `docs/teams/` yok; eski düzene (takım, lead, `cross_team_send`,
   departman) atıf yok: `git grep -n "cross_team_send\|nf-strateji\|nf-tasarim\|departman" -- CLAUDE.md .claude/agents` boş.
6. Deneme turu geçti: `nf-planlama` bir salt okunur iş yaptı ve raporladı; `nf-guvenlik` bir diff'i
   inceledi; `nf-arayuz` worktree'de küçük bir değişiklik yapıp commit'ledi ve koordinatör onu
   main'e almadan attı; her birinin raporu 5 parçalı ve Türkçe; `memory: project` klasörü oluştu.
7. Kullanıcıya rapor: ne değişti, nasıl kullanılır ("şu işi yap" deyince ne olur), açık kalanlar.

## Global kurallar (her task için geçerli)
- Silmeden önce yedek; yedeğin adı ve yeri raporda.
- Ortak dosyaya (`CLAUDE.md`, `.claude/`) yalnız koordinatör yazar, `newfork-wt/coord`'da; main'e
  `git push origin HEAD:main` (fast-forward). Kod değişmediği için CI tetiklenmez; tetiklenirse izlenir.
- Silme, uygulama kaldırma ve kalıcı ayar kullanıcının onayıyla; onay koordinatör penceresine yazılır.
- Metin Türkçe; commit mesajı İngilizce Conventional Commits.
- Aynı anda en çok 2 ağır iş (test, e2e, build).

## Review Focus (testlerin yakalamadığı, en olası beş sorun)
1. **Rol ajanı belirsizlikte tahmin eder.** Subagent kullanıcıya soramaz. Beklenen: rol kartı "belirsizse dur,
   soruyu seçeneklerle koordinatöre döndür" der; deneme turunda belirsiz bir iş verilip durduğu görülür (Task 6 adım 3).
2. **İki yazan rol aynı dosyaya dokunur.** Beklenen: yazan roller `isolation: worktree`; koordinatör aynı
   dosyayı iki role aynı anda vermez (CLAUDE.md kuralı). Deneme turunda worktree'nin ayrı olduğu `git worktree list` ile görülür.
3. **Rol hafızası yanlış bilgi biriktirir.** Beklenen: rol kartı "hafızaya yazmadan önce repoda doğrula;
   yanlış çıkanı sil" der; koordinatör ayda bir `.claude/agent-memory/` farkını okur (CLAUDE.md'de satır).
4. **Yeni ajan dosyaları oturumu yeniden başlatmadan görünmez.** Beklenen: Task 4 sonunda kullanıcıya
   "koordinatör oturumunu yeniden başlat" adımı; Done when 4 bunu ölçer.
5. **Takımın yarım işi temizlikte kaybolur.** Beklenen: Task 1 her takım klasörünün `git status` ve
   `origin/main..HEAD` çıktısını kayda geçirir, bitmiş olanı main'e alır, gerisini yedekler; silme en son.

---

### Task 1: Agent Teams AI'ı durdur, takımın işini kurtar
**Files:**
- Modify (main'e alınacak): `nf-strateji` ve `nf-muhendislik` klasörlerindeki commit'lenmemiş `docs/plan/**` dosyaları
- Create: `docs/plan/research/premortem-fb61-2026-09-25.md` (hâlâ dışarıdaysa)

- [ ] **Adım 1 (kullanıcı):** Agent Teams AI'da takım ekranında **Stop** (her takım için), sonra uygulamayı kapat.
- [ ] **Adım 2:** Süreçlerin kapandığını doğrula.
  Run: `(Get-Process claude-multimodel -ErrorAction SilentlyContinue | Measure-Object).Count`
  Expected: `0`. Değilse kullanıcıya hangi PID'lerin kaldığını söyle; isimle toplu öldürme yok.
- [ ] **Adım 3:** Her takım klasörünün ve üye worktree'sinin durumunu kaydet.
  Run: `for d in nf-muhendislik nf-tasarim nf-strateji; do git -C ../$d status --short; git -C ../$d log --oneline origin/main..HEAD; done`
  ve `git worktree list` içindeki her `team-*` için aynısı.
  Expected: yalnız `docs/plan/**` altında dosyalar. Kod dosyası çıkarsa dur, kullanıcıya göster.
- [ ] **Adım 4:** Bitmiş docs'u main'e al: dosyaları `newfork-wt/coord`'a kopyala, oku (içerik
  doğruluğu, eski düzene atıf), commit, push.
  ```bash
  git -C ../newfork-wt/coord add docs/plan
  git -C ../newfork-wt/coord commit -m "docs(plan): keep the agent team's FB-6 slice drafts and measurements"
  git -C ../newfork-wt/coord push origin HEAD:main
  ```
- [ ] **Adım 5:** Rapor satırı: hangi dosya main'e girdi, hangisi bilerek bırakıldı ve neden.

### Task 2: Agent Teams AI artıklarını temizle
**Files:** yok (git ve dosya sistemi)

- [ ] **Adım 1:** Yedek: `~/.claude/teams/` ve `~/.claude/tasks/` klasörlerini
  `C:\Users\TheWe\Documents\Codex\backups\agent-teams-2026-09-25.zip` olarak sıkıştır; boyutunu yaz.
- [ ] **Adım 2:** Her `team-*` worktree'si için içi temiz ve commit'i main'de mi kontrol et, sonra kaldır.
  ```bash
  git worktree remove "<yol>"
  ```
  Uzun yol hatasında: PowerShell `Remove-Item -LiteralPath '\\?\<yol>' -Recurse -Force`, ardından `git worktree prune`.
- [ ] **Adım 3:** Branch'ler: `git branch --list "worktree-team-*" "team/*"`; her biri için
  `git merge-base --is-ancestor <branch> origin/main` doğruysa `git branch -d <branch>`. Değilse listele, kullanıcıya sor.
- [ ] **Adım 4:** `nf-muhendislik`, `nf-tasarim`, `nf-strateji` worktree'lerini aynı yolla kaldır.
- [ ] **Adım 5 (kullanıcı onayıyla):** `~/.claude/teams/*` ve `~/.claude/tasks/*` altındaki 4 takım klasörünü sil (yedek Adım 1'de).
- [ ] **Adım 6:** Doğrula: `git worktree list` iki satır; `git branch` yalnız `main`.
- [ ] **Adım 7 (kullanıcı, isteğe bağlı):** Agent Teams AI'ı Windows "Uygulamalar"dan kaldır.
  `agent-teams-kit` klasörü arşiv olarak kalır.

### Task 3: Yedi rol ajanını yaz
**Files:**
- Create: `.claude/agents/nf-db.md`, `nf-backend.md`, `nf-test.md`, `nf-arayuz.md`, `nf-guvenlik.md`, `nf-gorsel-qa.md`, `nf-planlama.md`
- Kaynak (okunur, sonra Task 4'te silinir): `docs/teams/muhendislik.md`, `tasarim.md`, `strateji.md`

**Interfaces:**
- Produces: ajan adları `nf-*` (Task 4 CLAUDE.md'de ve Task 6 denemesinde bu adlar kullanılır);
  her ajanın rapor biçimi aynı 5 parça.

- [ ] **Adım 1:** Ortak iskeleti yaz. Her dosya bu yapıda:
  ```markdown
  ---
  name: nf-db
  description: Newfork veritabanı ve yetki uzmanı. Şema, RLS, app_private yetki çekirdeği, migration, pgTAP ve sorgu performansı işlerinde kullan.
  model: opus
  effort: high
  isolation: worktree
  memory: project
  skills: [supabase:supabase, supabase:supabase-postgres-best-practices, superpowers:test-driven-development]
  ---
  Sen Newfork'un veritabanı ve yetki uzmanısın. CLAUDE.md anayasandır; önce onu uygula.

  UZMANLIK: <kaynak karttan, olduğu gibi>
  DOKUNABİLECEĞİN DOSYALAR: <CLAUDE.md bölüm 4'ten bu rolün satırı>
  KURALLAR: <kaynak karttaki KURAL satırları>

  ÇALIŞMA DÖNGÜSÜ:
  - Yalnız görev mesajındaki kapsamda çalış. Kapsam dışına taşan bir şey görürsen dokunma; raporda "yolda bulunan" başlığıyla yaz.
  - Görev belirsizse ya da birden fazla okuması varsa başlama: soruyu seçenekler ve önerinle rapor olarak döndür.
  - Geri alınamaz bir işlem (silme, sıfırlama, db reset, hosted işlem) gerekiyorsa yapma; ne gerektiğini yaz ve dur.
  - Ağır komut (test:db, e2e) öncesi db.lock al (CLAUDE.md bölüm 7).
  - Bitince commit'le (kendi worktree branch'inde), push etme.

  HAFIZA: Yalnız repoda doğruladığın ve bir dahaki işte işe yarayacak şeyi yaz (tuzak, komut, yer). Yanlış çıkan kaydı sil.

  RAPOR (Türkçe, kod okumayan biri için):
  1. Nerede duruyor  2. Ne yapıldı (etkisi)  3. Açık kalan ve nedeni  4. Ekranda ne değişti  5. Sırada ne var
  Kanıt: komut + sonuç, dosya:satır, commit sha, worktree branch adı.
  ```
- [ ] **Adım 2:** Yedi dosyayı iskeletle doldur; UZMANLIK/KURALLAR metni kaynak kartlardan
  (bkz. Kararlar 2. madde tablosu) alınır, yalnız takım/lead/departman atıfları çıkarılır.
  Yazmayan roller için `isolation` yok ve `disallowedTools: [Edit, Write, NotebookEdit]`.
  `nf-planlama` için `disallowedTools` yok ama kartında "yalnız `docs/plan/**`" yazar.
- [ ] **Adım 3:** Kontrol: `grep -L "^name: nf-" .claude/agents/nf-*.md` boş; her dosyada `model:` ve `effort:` var.
- [ ] **Adım 4:** Commit: `feat(agents): seven fixed role agents replace the agent team members (TEAM-001)`

### Task 4: CLAUDE.md'yi yeni düzene çevir, docs/teams'i kaldır
**Files:**
- Modify: `CLAUDE.md` (bölüm 3, 4, 5, 6, 7; yeni bölüm "Koordinatörün kuralları")
- Delete: `docs/teams/muhendislik.md`, `tasarim.md`, `strateji.md`, `koordinator-mirasi.md`
- Kaynak: scratchpad'deki `koordinator-mirasi-taslak.md` (2026-09-25 kullanıcıyla yazılan: Türkçe, iş başı/sonu, verim-kalite, kayıtlar, ilerleme planı, temizlik)

- [ ] **Adım 1:** Bölüm 3 "Takımlar" → "Koordinatör ve roller": kullanıcı yalnız koordinatörle konuşur;
  rol ajanlarının tablosu (ad, uzmanlık, yazar mı); iki çalışma biçimi (subagent / işçi oturumu) ve
  hangisinin ne zaman seçildiği; işçi oturumu koordinatöre `local_7488a3bf…` id'siyle rapor verir.
- [ ] **Adım 2:** Bölüm 4 dosya sahipliği: departman yerine rol adı.
- [ ] **Adım 3:** Bölüm 5 iş akışı: onay → görev mesajı → rol → `nf-guvenlik` (+ ekran değiştiyse `nf-gorsel-qa`) → koordinatör main'e alır.
- [ ] **Adım 4:** Bölüm 6-7: takım klasörleri ve takım port tablosu çıkar; subagent worktree'leri
  (`.claude/worktrees/`) ve işçi oturumu worktree'leri (`newfork-wt/<id>`); port tablosu role göre.
- [ ] **Adım 5:** Yeni bölüm: taslaktaki 11 başlık, koordinatör = uygulayıcı olacak şekilde; model
  kuralı: "rolün modeli dosyasında sabit; işe uymuyorsa koordinatör çağrıda `model` ile ezer ve söyler".
- [ ] **Adım 6:** `docs/teams/` sil; `git grep -n "docs/teams\|cross_team_send\|nf-strateji\|nf-tasarim\|departman"` → yalnız `docs/plan/` tarihçesi kalmalı.
- [ ] **Adım 7:** Kullanıcıya son hâlini göster, onayı al, commit + push:
  `docs: one coordinator and fixed role agents replace the agent team (TEAM-001)`
- [ ] **Adım 8 (kullanıcı):** Koordinatör oturumunu yeniden başlat (yeni ajanlar oturum başında yüklenir).

### Task 5: İşçi oturumu protokolü
**Files:**
- Modify: `CLAUDE.md` (Task 4'teki bölüme alt başlık)

- [ ] **Adım 1:** Görev kartı (spawn_task) metninin iskeletini yaz: rol dosyasını oku → görev dosyası
  → `newfork-wt/<id>` worktree → iş → 5 parçalı rapor `SendMessage` ile koordinatöre → dur.
- [ ] **Adım 2:** Kapanış: koordinatör doğrular (commit main'de, worktree yok, arkada iş yok), kullanıcıya "arşivlenebilir" der.

### Task 6: Deneme turu
- [ ] **Adım 1:** `nf-planlama`'yı çağır: "BACKLOG.md'deki `critical` işaretli maddeleri listele, her biri hâlâ geçerli mi repoda doğrula". Beklenen: salt okunur, 5 parçalı Türkçe rapor, `.claude/agent-memory/nf-planlama/` oluştu.
- [ ] **Adım 2:** `nf-arayuz`'u worktree'de çağır: bir sayfanın CSS'inde zararsız bir yorum satırı ekleyip commit'lesin. Beklenen: ayrı worktree branch'i, commit var, ana klasör temiz. Sonra koordinatör branch'i atar.
- [ ] **Adım 3:** `nf-guvenlik`'i Adım 2'nin diff'iyle çağır; ayrıca `nf-db`'ye kasıtlı belirsiz bir görev ver ("izin tablosunu düzelt"). Beklenen: inceleme kararı `ONAY @<sha>` biçiminde; `nf-db` başlamadan soruyu seçeneklerle döndürür.
- [ ] **Adım 4:** Bulguları kaydet; rol kartında düzeltme gerekiyorsa yap, commit.

### Task 7: Kayıt ve rapor
- [ ] **Adım 1:** `DONE.md` satırı; bu dosyanın "Notes / Result"u.
- [ ] **Adım 2:** Koordinatör hafızası: `coordinator-role.md` güncellenir (Agent Teams AI bırakıldı, yeni düzen).
- [ ] **Adım 3:** `~/.claude/OBSERVATIONS.md`: "kuruldu ve bırakıldı" girdisi (ne oldu, maliyeti, önleyen alışkanlık: yeni bir araca geçmeden önce küçük bir deneme).
- [ ] **Adım 4:** Kullanıcıya 5 parçalı rapor + ilk gerçek iş önerisi (FB-6.1a).

## Notes / Result

Kullanıcı kararları (2026-09-25): karışık düzen; 7 rol; `docs/teams/` kaldırıldı (koordinatör kararı); Agent Teams AI'ı kullanıcı kaldıracak.

- **Kurtarma** (`847fd0e`, `19ba417`, `41c9887`): takımın backlog yeniden doğrulaması, temel ölçüm, FB-6.1 pre-mortem'i, FB-6.0-can ve kullanıcının getirdiği FB-6.1 dış değerlendirmesi main'e alındı; iki bağımsız okuma ajanıyla doğrulandı, hiçbiri atılmadı; eskimiş kanıtlar ve var olmayan alt iş adları düzeltildi. Bilerek dışarıda: pazar/fiyat araştırması (kaynakları denetlenmedi) ve eski düzene göre bölünmüş FB-6.1a–d taslakları (main'deki FB-6.1 onların yerini aldı). Hepsi yedekte.
- **Temizlik:** 38 takım çalışma kopyası, 40 branch, `nf-muhendislik` / `nf-tasarim` / `nf-strateji` klasörleri ve `~/.claude/teams`, `~/.claude/tasks` altındaki 4 takım silindi. Yedek: `C:\Users\TheWe\Documents\Codex\backups\agent-teams-2026-09-25.zip` (8.9 MB; takım verisi, kaydedilmemiş taslaklar, iki diff, `team/strateji` bundle'ı). Bir klasör kilitli kaldı (BL-125).
- **Roller** (`19ba417`) ve **CLAUDE.md** (`27e2062`, `7be7502`): 7 rol, koordinatör kuralları (bölüm 11), işçi oturumu (bölüm 12).
- **Deneme turu:** `nf-db` belirsiz görevde ("İzin tablosunu düzelt") dosyaya dokunmadı, dört seçenekli soru döndürdü. `nf-arayuz` ayrı worktree'de tek satır değiştirip commit attı, push etmedi (`3937899`, sonra silindi). `nf-guvenlik` onu inceledi: `ONAY @3937899`, commit mesajındaki biçim hatasını yakaladı. `nf-planlama` salt okunur backlog kontrolü yaptı, hafızasını yazdı (`.claude/agent-memory/nf-planlama/`, `de6c823`), BL-124'ü buldu. Yeni rol dosyaları, ana klasör güncellenince bu oturumda yeniden başlatmadan yüklendi.
- **Açık:** BL-124, BL-125; Agent Teams AI'ın kullanıcı tarafından kaldırılması; FB-6.1 düzeltmeleri (FB-6.1.md Notes).
- **Kilit kuralı — Karar 2026-09-26 (kullanıcı):** `db.lock` / `main.lock` alma atomik bir yardımcıyla yapılır (varsa almaz, yoksa oluşturup sahibini yazar; iki oturum aynı anda alamaz). Yardımcıyı `nf-test` yazıyor (`scripts/`); CLAUDE.md §7'deki "Almak" satırına yardımcıyı gösteren iki satırı koordinatör ekler (kullanıcı onaylı). Rol kartlarındaki "Ağır komut öncesi db.lock al" satırı yardımcı main'e girince ona işaret eder.
