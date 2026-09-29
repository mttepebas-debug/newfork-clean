# Koordinatör devri — 2026-09-29 sabah

Devreden: "Koordinatör — devir 2026-09-28 akşam" (`local_4ccace1a-f969-4d2b-8451-ef6b0738d10a`); bağlamı bir kez sıkıştırıldı, sıradaki iş yeni oturumda başlasın (kullanıcı kararı 2026-09-29: "Plan sırası").
Devralan: bu dosyayı okuyan yeni koordinatör oturumu.
Ölçüm anı (koordinatör, 2026-09-29): `origin/main` `b16ffc87` + bu devir commit'i; kilitler boş; main CI yeşil (run 36524238322 @ `228ff3b7`; sonrası yalnız docs/.claude).
Kullanıcı telefondan (Remote Control) izliyor. Dil sade Türkçe. **Aynı anda tek iş** (CLAUDE.md §11.4); parçalı paralel yürütme serbest.
Durumun tamamı: `docs/plan/ILERLEME-PLANI.md` (sürüm 6). Kayıt tutan rol: `nf-planlama`.

## 0. İlk işler (sırayla)
1. Kendi oturum kimliğini al. `CLAUDE.md` §3 ve §12'deki koordinatör kimliğini güncellemek için kullanıcıdan onay iste (onay **senin penceren**e yazılır). Değişiklik `../newfork-wt/coord`'da: fetch → `checkout --detach origin/main` → düzenle → commit → `push HEAD:main`.
2. Remote Control açık ve kenar çubuğunda sabitli mi, doğrula.
3. Yeni adresi rol oturumlarına bildir (§5).
4. Eski koordinatörü (`local_4ccace1a…`) arşivlemeden önce kullanıcıya sor.
5. Ana klasör (`newfork-clean`) `228ff3b7`'de kaldı: içinde commit'lenmemiş bayat bir `nf-gorsel-qa` hafıza notu fast-forward'u engelliyor (§3a). Kullanıcı temizlemediyse hatırlat; worktree oturumu ana klasörün `.claude/`'una yazamıyor.

## 1. Durum
- **BL-218.3 bitti** (`be46cd22`): Management/Owner `system_key` ile tanınıyor; yalnız Management işli kişi Primary'siz kaydoluyor; Schedule yeni vardiya varsayılanı Owner değil. Hosted'a 5 migration (`20260928060000`–`100000`) kullanıcı gönderdi (OPS-03 sırası), advisors temiz. Kanıt: `tasks/BL-218.md` Notes / Result.
- **Schedule sağ üst pencereler (stil B) main'de** (`5a92d2f2` + `228ff3b7`): kullanıcının "Schedule modals UI design mockups" oturumunun işi; PR mttepebas-debug/newfork-clean#1 açıklamayla kapatıldı.
- Aşama 6–7: **%37,4 (86/230)**, program %53,2.
- Main CI bir kez yük yüzünden kırmızıya düştü (vardiya notu e2e 60 sn sınırı); yalnız düşen iş yeniden koşunca yeşil. Kök neden koordinatörün CI koşarken yerel e2e koşturması → CLAUDE.md §3'e kural eklendi (koşan CI iki ağır işten biri sayılır).
- Yerel DB = main (son migration `20260928100000`). Hosted = main.

## 2. Sıradaki iş (kullanıcı onaylı: "Plan sırası")
- **FB-6.2.1** (`nf-db`): Çalışanlar → İzin → Ayarlar zincirinin önündeki tek hazır adım; arkasında 26 satır / 111 puan.
- Aynı anda **BL-218.4** ya da **BL-218.5b** (`nf-arayuz`) yürüyebilir; dosya paylaşmıyorlar (ILERLEME §sıradaki iş).
- Başlamadan önce tazelik ölçümü (CLAUDE.md §5 adım 0). `nf-db` ve `nf-backend` rol oturumlarının bağlamı dolu (%50 / %63): yeni iş için **yeni rol oturumu** aç (§12: Remote Control açık + sabitli, başlık "Rol: <rol> (<uzmanlık>)").
- Ağır iş öncesi `gh run list --limit 3` (yeni kural).

## 3. Kullanıcıda bekleyenler
**a) Ana klasördeki bayat not.** Kullanıcı "sil" dedi; worktree oturumundan yazılamadı. Kullanıcıya verilen komutlar (ana klasörde): `git restore .claude/agent-memory/nf-gorsel-qa/MEMORY.md`, `rm .claude/agent-memory/nf-gorsel-qa/schedule-draft-menu-mobile-overflow.md`, `git merge --ff-only origin/main`. Yedek: eski koordinatörün scratchpad'i `gorsel-qa-memory-backup/`.

**b) GitHub'daki `task/schedule-top-windows-b` dalı.** Kullanıcı "sil" dedi; yerel dal silindi, `git push origin --delete` izin almadı. İçerik main'de. Kullanıcı PR #1 sayfasından "Delete branch" ile silebilir.

**c) Kalan kararlar.**
- `task/schedule-dialog-mockups` (`0b2f998c`, yalnız yerel DEV mockup, main'de yok): kullanıcı silmeyi seçmedi, **kalıyor**.
- `coord/supabase/.temp` canlı bağlantı dosyaları: kullanıcı silmeyi seçmedi, **kalıyor** (bir sonraki hosted gönderim için hazır).
- "Schedule modals UI design mockups" oturumu arşivlenebilir durumda; kullanıcı "Kalsın" dedi.
- CLAUDE.md dev-sunucusu süreç ağacı kural önerisi hâlâ "tbd" (önceki devirden).
- `C:\Users\TheWe\.claude\settings.json` düz metin DB parolası: döndürüldüğü **doğrulanmadı**; değeri hiçbir yere yazma.

## 4. Aday işler (backlog'dan; sıradaki iş plandan gelir)
- **BL-316** (leave: high / do: safe): Schedule → Export taslak önizlemesi 500 — `schedule_availability_read_projection` anahtar listesinde `conflict_severity` yok, paylaşılan şema zorunlu tutuyor. Tek satırlık DB düzeltmesi; kullanıcıya bir sonraki boşlukta önerilebilir.
- **BL-317**: workspace sahibi Employees listesinde görünmüyor — önce tazelik (SELECT), sonra ürün sorusu.
- BL-318..BL-321: pencere tutarlılığı, telefonda iki olası taşma, vardiya notu e2e'sinin süre payı.
- Önceki devirden: BL-293 (klavye odağı), BL-296+BL-288 (yerel DB'ye dayanıklı testler), BL-283 (parola deneme sınırı, yayın öncesi şart); kararlar K10, K7.

## 5. Rol oturumları (2026-09-29)
| Oturum | Kimlik | Not |
|---|---|---|
| Rol: nf-db — BL-218 | `local_0af84e96-6363-4f81-abc3-df35d326218b` | worktree silindi, boş klasör `reverent-lovelace-d9960f` oturum kapanınca silinir; bağlam ~%50 → yenisi açılmalı |
| Rol: nf-backend | `local_cb173b54-84bd-4c7a-b3ca-782a326b4718` | worktree silindi, boş klasör `eloquent-moser-2c64fc` + `claude/eloquent-moser-2c64fc` dalı (main'in atası); bağlam ~%63 → yenisi açılmalı |
| Rol: nf-test | `local_0efbf957-db60-4531-916a-29d8d91d457d` | `brave-moser-5b8232` |
| Rol: nf-arayuz | `local_6a90e9ce-d597-4eeb-abe3-2c7fe7da8fec` | `goofy-wescoff-7931db` |
| Rol: nf-guvenlik | `local_8127d370-67c8-48a2-aaad-2723be2a5516` | `optimistic-antonelli-f98d23` |
| Rol: nf-gorsel-qa | `local_13e7e4de-946d-4dd3-b33c-6395b3e6e0be` | `competent-rubin-877752` |
| Rol: nf-planlama | `local_c67b8d60-e3f5-49aa-aba8-bb7860234876` | `infallible-poincare-15d4f4` |

## 6. Temizlik (ölçüm 2026-09-29, dokunulmadı)
- Sahibi bu devirde bilinmeyen yeni worktree'ler: `../newfork-wt/schedule-empty-grid` (`task/schedule-empty-grid`, `6d490452`) ve `.claude/worktrees/dreamy-sinoussi-7c5a4a` (detached `2a8a672a`). Silmeden önce sahibini ve birleşme durumunu sor/ölç.
- Önceki devirden duran: `../newfork-wt/merge-0927c`, `../newfork-wt/settings-merge`, alt ajan worktree'leri `agent-a3704c99…`, `agent-ae216987…`, `zen-cori-6c77ae`; 28 `worktree-agent-*` dalı.
- Eski koordinatör worktree'si `interesting-elgamal-bff91f` (detached `be46cd22`) içinde commit'lenmemiş `nf-gorsel-qa` notu var; içeriği main'de (`b16ffc87`), oturum kapanınca worktree silinebilir.
- **Eski `C:\Users\TheWe\newfork` oturumlarına dokunulmaz** (kullanıcı kararı).

## 7. Dersler (ayrıntı `~/.claude/OBSERVATIONS.md`)
- CI bu PC'de koşuyor: main'e push'tan sonra CI bitene kadar yerel ağır iş (e2e, tam kapı, görsel QA sunucuları) başlatma. Yük altında alınan süre ölçümü karşılaştırma değildir; boşta tekrar ölç. Bu devirde yanlış suçlama kullanıcıya söylendi, düzeltildi.
- OPS-03 (hosted önce, main sonra) sorunsuz işledi: kullanıcı 5 komutu çalıştırdı, koordinatör MCP ile doğruladı.
- Bir yol (restore/rm/remote delete) izin almadıysa aynı komutu tekrar deneme; silmesiz yol bul ya da kullanıcıya komutu ver.
- Birleştirmeyi rol/kullanıcı worktree'sinde değil, ayrı geçici worktree'de yap (`newfork-wt/merge-*`); başkasının klasörüne dokunmadan temiz kalır.

## 8. Artifacts
- `newfork-wt/coord/artifacts/koordinator/hosted-before-bl218-schema.sql` ve `-data.sql`: BL-218.3 hosted gönderimi öncesi yedek (2026-09-28 21:30).
- Ana klasör `artifacts/koordinator/`: önceki devirlerin yedekleri (BL-199 tasarımları, SEC-003 hosted yedeği).
