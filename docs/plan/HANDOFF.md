# Koordinatör devri — 2026-09-29 gece

Devreden: "Koordinatör — devir 2026-09-29 akşam" (`local_54c1c741-4bc2-436c-9ae2-60aeb8ef74df`); bağlamı ~%56.
Devralan: bu dosyayı okuyan yeni koordinatör oturumu (havuzdan).
Ölçüm anı: `origin/main` = bu devir commit'i (altı `42e7378e`). Main CI: T4 (`2211d09c`) koşusu devir anında sürüyordu — **ilk iş onu doğrula**. Önceki main koşuları yeşil (T1 36581376867, T2 36583110901, G9b 36585158337 ikinci deneme). Kilitler boş.
**Kullanıcı PC başında değil, yönetim koordinatörde.** Kurallar: `docs/plan/KOORDINATOR-KARARLARI.md` başı (karar ver, KK-n olarak logla; geri alınamaz / hosted / ücretli park) ve kullanıcı hafızası `user-away-mode`, `single-track-and-computed-plan`, `coordinator-session-address`. Kullanıcı paralel işçilere izin verdi (KK-15/16/18); dosya kümeleri ayrık olmalı.

## 0. İlk işler (sırayla)
1. Kendi `local_` kimliğini al (`get_session self`). Bütün rol, işçi ve inceleme oturumlarına (§2) yeni adresi `mcp__ccd_session_mgmt__send_message` ile bildir. Raporları `SendMessage` değil `mcp__ccd_session_mgmt__send_message` ile istemek şart (öbürü düşüyor). CLAUDE.md §3/§12'deki koordinatör kimliği hâlâ eski (`local_243f826b…`); değiştirmek kullanıcı onayı ister (§8) → §5 listesinde.
2. Eski koordinatörü (`local_54c1c741…`) arşivle: telefon bağlantısını kapat, sabitlemeyi kaldır, `archive_session`. Kendi worktree'si (`.claude/worktrees/affectionate-hellman-efb2af`) temiz, yalnız okuma yaptı. Senin kullanacağın worktree'ler: `newfork-wt/coord` (docs/karar; detached, `git checkout --detach origin/main` ile başla) ve `newfork-wt/merge-account` (toplu dallar; node_modules kurulu; şu an `task/batch-t4b`).
3. Main CI (T4 `2211d09c`) sonucunu oku: `gh run list --branch main --limit 2`. Kırmızıysa önce yük mü kod mu ayır (§6): yalnız düşen işi yeniden koştur; kod ise düzeltmeyi kıran işin sahibine ver. Yeşilse nf-planlama'ya run numarasını ver (T4 kapanışında yer tutucu var).

## 1. Bugün main'e girenler (bu koordinatör, 2026-09-29 öğleden sonra–gece)
| Tur | main commit | İçerik | CI |
|---|---|---|---|
| T1 | `209dbf8c` | Account yeniden tasarımı, BL-335 telefon, BL-332, G2, G22, G19, G6, G9a (+ kurulumdaki owner'a Profile notu) | dal + main yeşil; 4 migration uygulandı |
| T2 | `4490f8e3` | G4 zamanlanmış dışa aktarma, G5 hesap güvenliği (+ orta düzeltme e2ad5087), G13 test/CI kararlılığı | yeşil; 2 migration (`--include-all`, damgaları G9a'dan önce; fonksiyon kesişimi 0 ölçüldü) |
| T3 | `8d2f112a` | G9b izni kısaltıp atamak (BL-182, BL-127) | dal: ızgara bütçesi yük kaynaklı düştü → yeniden koşu yeşil; main: G5 duvar saati testi yükte düştü → yeniden koşu yeşil; 1 migration |
| T4 | `2211d09c` | G1 Schedule pencereleri (13 madde), G12 dayanıklı pgTAP (9 madde, ci-not-green 14→12, bütçe testi yüke dayanıklı), G5 zamanlama testi sahte saatte | dal yeşil (ilk deneme App.test eski tek tık kuralı → 4de8b2fd); **main koşuyor** |
| docs | `8c911da6`, `547c706c`, `248d02b6`, `ca55fa7a`, `42e7378e` | T1–T3 kapanışları, FB-6.2 planı, KK-21…KK-25 | — |

Açık madde (nf-planlama sayımı, T3 sonrası): 231; T4 kapanışı yazılıyor.

## 2. Yürüyen işler
| Oturum | İş | Durum / sıradaki adım |
|---|---|---|
| İşçi: G7 / FB-6.2 Dal A (`local_669a823d…`, nf-db) | yetki çekirdeği `.0b`→`.6` (`docs/plan/tasks/FB-6.2.md`) | `.0b` ölçüldü (09-28 ile aynı), `.1` 287 kırmızı hücre yazıldı, `.2`'de. Tur sonu T5a = `.0b`–`.3`: dur, raporla → nf-guvenlik (R3, zorunlu) → toplu dal + CI → main. Migration damgası ≥ `20260930120000`. KK-24 (admin ↔ admin) uygulanıyor. |
| İnceleme: G4, G5, G11 (`local_a7a832aa…`, nf-guvenlik) | G11 incelemesi `ca55fa7a..23710521` (R2) | karar bekleniyor |
| İşçi: G11 (`local_b6c16533…`, nf-backend; bağlam %57) | hata sözleşmesi — bitti, 9 commit, push yok (`task/g11-error-contract` @23710521, worktree `exciting-fermi-8887dd`) | ONAY gelince: toplu dal + CI → main; migration `20260930090000_refusals_say_why.sql` main penceresinde uygulanır. Kalan 3 web maddesi (BL-193, BL-324, SchedulePage `followUpAfterUnpublish` onError ham `error.message`) G11 main'e girdikten sonra **G1 işçisine**. G11 oturumu sonra arşivlenebilir (devir notu `G11-kararlar.md`). |
| İşçi: G1 devralan (`local_963d0be0…`, nf-arayuz; ~%40) | G1 bitti, main'de | boşta; G11 main'e girince BL-193 + BL-324 + onError'u ver (SchedulePage'i biliyor). |
| İşçi: G3 (`local_fcfd3ec2…`, nf-backend; yeni) | bayat ekranlar ve önbellek (BL-271 BL-273 BL-278 BL-149 BL-152) | başladı; R2, inceleme nf-guvenlik (BL-271 kiracı önbelleği). |
| nf-gorsel-qa (`local_13e7e4de…`) | G9b görsel QA (KK-22) | rapor bekleniyor; bulgu çıkarsa küçük düzeltme (G9b işçisi `local_f510f0b1…` boşta, ~%50). |
| nf-planlama (`local_86b620a0…`, ~%50) | T4 kapanışı + biriken madde önerileri (G1, G11 a–k, G12) + KARARLAR'a KK-24 + "Kullanıcıya dönüşte" listesi | dal `task/backlog-program-8`; gelince `newfork-wt/coord`'da cherry-pick → main.lock → push. |

Bekleyen ve sırası gelmemiş:
- **G7 Dal B** (`.7a`, nf-backend, web: BL-176, BL-243, BL-365, 12 `permissions.includes` → `can()`): G3 bitince (ikisi Employees çekmecesine dokunuyor). T5a ile main'e girer. Havuzdan yeni oturum.
- **G12 sonraki tur** (nf-test): BL-248 testini sil (KK-25), 12 gerçek kırmızı dosya (nf-planlama madde açacak), `shift_exchanges_v1`'i test dünyasına taşı.
- **G8** G7'den sonra (ikisi `scope_set`). Program sırası: `docs/plan/tasks/BACKLOG-PROGRAM.md`.
- Boştaki roller: nf-guvenlik (`local_2a1c91fd…`), nf-test (`local_50c331df…`), nf-db (`local_3dc69041…`), nf-backend (`local_7a9cd29c…`). Havuz: "Bekle: handoff raporu gelene kadar idle (N)", kalan 16–30.

## 3. Oturum kalıbı
Devir (hafıza `user-away-mode`): en küçük numaralı havuz oturumuna `send_message` ile rol dosyası + görev + rapor adresi + worktree kurulumu; başlık "İşçi: …" / "Rol: …", sabitle (telefon bağlantısı havuzda zaten açık). Bağlamı dolan oturum iş sınırında devir notu yazar; worktree'si temiz ve işi origin'de/main'de olduğu doğrulanınca (RC kapat, sabitlemeyi kaldır) arşivlenir. Aynı dal iki worktree'de açılamaz: eskiyi önce arşivle. Görev mesajında: Skills satırı, dokunulmayacak dosyalar (başka işçilerin), migration damgası aralığı, "push'tan önce paketin bütün vitest'i".

## 4. Toplu tur kalıbı (bugün 4 kez uygulandı)
`newfork-wt/merge-account`'ta: `git switch -c task/batch-tN origin/main` → dalları `git cherry-pick $(git rev-list --reverse origin/main..<dal>)` → `ci-green.txt` çakışması: iki taraf da kalır (işaret satırlarını sil; `git diff origin/main -- supabase/tests/ci-green.txt` yalnız `+` satır) → `bash scripts/ci-green-guard.sh origin/main` = 0 → push (`task/**` CI tetikler; aynı adı yeniden göndermek force push ister, yasak → `task/batch-tNb`) → CI yeşil → `node scripts/lock.mjs take db "koordinator/tN-main, …"` + `take main …` (kimlik "rol/oturum" biçiminde) → `npx supabase migration up --local` (damga eskiyse önce fonksiyon/tablo kesişimini ölç, sonra `--include-all`) → `git push origin HEAD:main` → kilitleri bırak → main CI izle. Docs-only gönderim CI tetiklemez. Birleşen dalları `git cherry` (+ gerekirse içerik karşılaştırması) ile doğrulayıp yerelden sil; GateGuard silmede "üç bilgi" ister.

## 5. Kullanıcıya dönüşte (tek listede; nf-planlama "Kullanıcıya dönüşte" bölümünü de tutuyor)
1. CLAUDE.md'deki koordinatör kimliği (§8) + kural önerisi: "ekran davranışı değişen işte push'tan önce o paketin bütün vitest'i" (bugün iki kez odaklı test App.test'i kaçırdı; OBSERVATIONS'ta).
2. Kararların raporu: KK-21 (takasta izni kısaltan yetki), KK-22 (G9b görsel QA main sonrası), KK-23 (taslak sayacı; BL-309 düzeltmesi), KK-24 (admin ↔ admin), KK-25 (BL-248, BL-094). Önceki: KK-1…KK-20.
3. Ultrareview önerileri: G7/FB-6.2 (yetki çekirdeği), G9b (izin kaydı + yeni `*_service`), G11 (77 dosya, yetki cevapları, migration); önceki G4, G5, G6.
4. Hosted bekleyen: saatlik cron/Vercel planı (BL-101), `RESEND_API_KEY` (U63), hosted en kısa parola (BL-161), hosted log ayarları (BL-361).
5. Kullanıcı kararı: BL-073 görsel varyant; BL-355 (3) ↔ Account K-15; BL-105 pgTAP'ı yerel DB'ye kalıcı kurmak (kalıcı kurulum); sürüm atlamaları vitest/vite/react-router/TS (yeni bağımlılık); `/v1/me/onboarding/ssn` rotası (ROADMAP "SSN yok").
6. Uzak dal silme izni yok → liste (nf-planlama `git cherry` ile doğruluyor): bütün `task/batch-*`, `batch/t1` ve main'e giren `task/*` dalları.
7. Ana klasör (`newfork-clean`) `7fcf31e0`'de geride; güncellemesi izin kuralıyla reddediliyor — kullanıcı PowerShell'de: `git restore .claude/agent-memory/nf-guvenlik/MEMORY.md`, `Remove-Item .claude/agent-memory/nf-guvenlik/checklist-role-button-row-borrowed-name.md`, `git merge --ff-only origin/main`, `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`.

## 6. Dersler (bu devir)
- **Yük kaynaklı kırmızılar** (3 kez): paralel işçiler + CI aynı PC'de. Duvar saati ölçen test yük sensörüdür: ilk titremede sahte saate ya da best-of-N'e çevrildi (ikisi yapıldı). Karar vermeden önce: statik kanıt (çağrı zinciri) + yalnız düşen işin yeniden koşusu. Ağır yerel testi aynı anda en çok iki işçi koşsun.
- **Odaklı test yetmedi** (2 kez; önceki devirde de): görev mesajında "push'tan önce paketin bütün vitest'i" yaz.
- **Kuyrukta kalan mesaj:** meşgul oturuma giden cevap sırada bekliyor; işçi aynı soruyu yeniden sorabilir — ikinci kez cevapla.
- **Kilit takılması:** bir işçinin psql beslemesi takıldı, db.lock 36 dk tutuldu. Kilit 15 dk'yı geçerse sahibine sor.
- **Ad çakışması:** "FB-6.2.1" iki anlamda kullanılmıştı (dilim ↔ alt adım); KK-5/KK-12'ye not düşüldü, G7 = FB-6.2 dilimi.
