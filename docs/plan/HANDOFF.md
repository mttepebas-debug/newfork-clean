# Koordinatör devri — 2026-09-28 akşam

Devreden: "Koordinatör — devir 2026-09-28" (`local_41428574-b1a9-44cb-9a7c-cd34afc9456a`), bağlamı doldu.
Devralan: bu dosyayı okuyan yeni koordinatör oturumu.
Ölçüm anı (`nf-planlama`, 2026-09-28 akşam): `origin/main` `76704d9c`; kilitler boş (`node scripts/lock.mjs status`); rol oturumları `list_sessions` ile; worktree'ler `git worktree list` ile.
Kullanıcı telefondan (Remote Control) izliyor. Dil sade Türkçe. **Aynı anda tek iş** (CLAUDE.md §11.4); parçalı paralel yürütme serbest.
Durumun tamamı: `docs/plan/ILERLEME-PLANI.md`. Kayıt tutan rol: `nf-planlama` (`local_c67b8d60-e3f5-49aa-aba8-bb7860234876`).

## 0. İlk işler (sırayla)
1. Kendi oturum kimliğini al. `CLAUDE.md` §3 ve §12'deki koordinatör kimliğini güncellemek için kullanıcıdan onay iste. Onay **senin penceren**e yazılır; aktarılan onay geçmez.
2. Remote Control'ün açık ve oturumun kenar çubuğunda sabitli olduğunu doğrula (kullanıcı kararı 2026-09-27).
3. Yeni adresi rol oturumlarına bildir (§5 tablosu).
4. Eski koordinatörü arşivlemeden önce kullanıcıya sor. Remote Control açıkken arşiv reddedilir.
5. Ana klasör (`newfork-clean`) `e15544a9`'da, `origin/main`'in gerisinde. `git fetch` + fast-forward yap.

## 1. Durum
- SEC-003 (hesap güvenliği) ve BL-199 (müdür Schedule'da vardiyaya not yazıyor) bitti. BL-199: `de80eda6`, main CI yeşil (run 36501225426), kapanış kaydı `76704d9c`.
- FOUNDATION-B Aşama 6–7: **%33,5 (77/230)**, değişmedi.
- BL-199'un bütün worktree ve dalları silindi. Reddedilen tasarım dallarının yedekleri §8'de.
- Yerel DB = main (son migration `20260928060000`). Hosted bir adım geride (§3a).

## 2. Sıradaki iş (kullanıcı onaylı: "Önce devir, sonra BL-218.3 ∥ FB-6.2.0")
- **BL-218.3** → `nf-backend`, 5 puan. Dosyalar: `packages/shared`, `apps/api/src/schedule`, web `*-data`. Arkasında 120 puan / 29 satır var, doğrudan 4 satırı açıyor.
- **FB-6.2.0** → `nf-planlama` ölçümü + bir `nf-test` koşusu (`roles_permissions_rls`, `employee_hub`), 1 puan. Arkasında 114 puan.
- İkisi dosya paylaşmıyor, aynı anda gider. Tek ağır iş FB-6.2.0'ın `test:db` koşusu (`db.lock`).
- Başlamadan önce tazelik ölçümü yapılır (CLAUDE.md §5 adım 0).

## 3. Kullanıcıda bekleyenler
**a) Hosted gönderim `20260928060000`** (BL-199 parça 2: iş arkadaşının notu çalışana gitmez).
- Koordinatörün Bash/PowerShell'i proje `.claude/settings.json` deny kuralıyla engelli.
- MCP `apply_migration` sürüm kaymasına yol açar, kullanılmaz.
- Kullanıcı PC başında PowerShell'de sırayla çalıştırır:
  1. `cd ..\newfork-wt\coord`
  2. İki `db dump --linked` (şema ve veri) → `artifacts\koordinator\hosted-before-bl199*.sql`. **`coord`'da `artifacts\koordinator` klasörü yok** (`nf-planlama` ölçtü); dump'tan önce oluşturulmalı ya da yol ana klasöre verilmeli.
  3. `db push --dry-run`: yalnız `20260928060000` görünmeli.
  4. `db push`.
- Sonra koordinatör MCP ile `list_migrations` ve `get_advisors` (security) çalıştırır.
- `coord/supabase/.temp`'teki link dosyaları push'tan sonra silinir (bugün ikisi duruyor: `linked-project.json`, `pooler-url`).

**b) CLAUDE.md kural önerisi — cevap "tbd".** Dev sunucusu kapatılırken:
- Bütün süreç ağacı kapatılır (`tsx watch` ve onu çalıştıran `cmd`).
- Sahiplik, başlatma saatiyle kanıtlanır.
- Sonunda worktree yolunda node/cmd kalmadığı doğrulanır.
- Aynı hata 2026-09-28'de üç rolde tekrarladı. İlgili hafıza: `dev-server-stop-leaves-tsx-watcher`.

**c) Güvenlik.**
- `C:\Users\TheWe\.claude\settings.json` satır 183'te bir allowlist girdisinde düz metin DB parolası vardı.
- Kullanıcıya parolayı döndürmesi ve satırı silmesi önerildi. Yapıldığı **doğrulanmadı**.
- Değeri hiçbir yere yazma, okuyup aktarma.

## 4. Aday işler (backlog'dan; sıradaki iş plandan gelir, bunlar öneri)
- **BL-293** (leave: high / do: safe): Schedule hızlı düzenleyicisinde klavye odağı hover'dan ayırt edilemiyor; WCAG 2.4.7, doğrulandı.
  - BL-290, BL-294 ve BL-295 aynı penceredeki alan stili; dördü tek tutarlılık işi olabilir.
- **BL-296 + BL-288:** testler ortak yerel DB'nin genel durumunu sayıyor ve yerel kırmızıyı büyütüyor. Tek bir "yerel DB'ye dayanıklı test" işi olabilir.
- **BL-283:** API parola doğrulamasına hesap başına deneme sınırı. Yayın öncesi şart (ILERLEME §8).
- **Açık kararlar** (ILERLEME §5):
  - K10: FB-6.3 S4, 47 puanı durduruyor; FB-6.3.1'e kadar gerekmez.
  - K7: FB-6.1 ekran turu, 15 puan.

## 5. Rol oturumları (hepsi Remote Control açık ve sabitli; `list_sessions` 2026-09-28 akşam)
| Oturum | Kimlik | Worktree |
|---|---|---|
| Rol: nf-db — BL-218 | `local_0af84e96-6363-4f81-abc3-df35d326218b` | `.claude/worktrees/reverent-lovelace-d9960f` |
| Rol: nf-backend | `local_cb173b54-84bd-4c7a-b3ca-782a326b4718` | `.claude/worktrees/eloquent-moser-2c64fc` |
| Rol: nf-test | `local_0efbf957-db60-4531-916a-29d8d91d457d` | `.claude/worktrees/brave-moser-5b8232` |
| Rol: nf-arayuz | `local_6a90e9ce-d597-4eeb-abe3-2c7fe7da8fec` | `.claude/worktrees/goofy-wescoff-7931db` |
| Rol: nf-guvenlik | `local_8127d370-67c8-48a2-aaad-2723be2a5516` | `.claude/worktrees/optimistic-antonelli-f98d23` |
| Rol: nf-gorsel-qa | `local_13e7e4de-946d-4dd3-b33c-6395b3e6e0be` | `.claude/worktrees/competent-rubin-877752` |
| Rol: nf-planlama | `local_c67b8d60-e3f5-49aa-aba8-bb7860234876` | `.claude/worktrees/infallible-poincare-15d4f4` |

## 6. Temizlik (genel temizlikte bakılır; ölçüm, dokunulmadı)
- **Eski worktree'ler:** `../newfork-wt/merge-0927c` (`[merge-0927c]`) ve `../newfork-wt/settings-merge` (`[settings-merge]`).
- **`nf-planlama`'nın ölçümünde ayrıca görülenler** (koordinatörün "yalnız coord ve rollerin kalıcıları kaldı" sayımına girmiyor):
  - Üç alt ajan worktree'si: `agent-a3704c99…`, `agent-ae216987…`, `agent-afa8bb7b…` (`[bl234]`).
  - `interesting-elgamal-bff91f` ve `zen-cori-6c77ae` (ikisi de detached).
  - `epic-albattani-e0c9f6`: kullanıcının `/code-review` oturumu.
  - Silmeden önce içerikleri ve birleşme durumları doğrulanır.
- **Arşiv adayı oturumlar** (kullanıcıya sor):
  - "BL-199 vardiya notu kod incelemesi" (`local_1929f647…`, Remote Control açık)
  - "Shift badge "not manager" indicator design" (`local_67b16d08…`)
  - "Dev sunucusu kurulumu" (`local_e71c16e6…`)
  - Önceki devirden: eski `nf-db` "BL-198" ve "Settings okumaları", "Code review", "ultrareview: bl252", "bl252-f6".
- **Eski `C:\Users\TheWe\newfork` oturumlarına dokunulmaz** (kullanıcı kararı).

## 7. Dersler (ayrıntı `~/.claude/OBSERVATIONS.md`)
- Görsel kararda varyant üretmeden önce kullanıcıya ne istediğini sor. BL-199'da iki tur (13 tasarım) reddedildi, üçüncü tur kullanıcının kendi oturumunda seçildi.
- Parçalı işte son main'den önce bütün aralığa tek inceleme koştur. `/code-review` ayrı oturumda, iki rol incelemesinin kaçırdığı 3 davranış hatasını buldu.
- Parçalı paralel yürütme (DB ∥ UI ∥ test) iyi gitti. BL-199 aynı gün 12 puan kapandı.
- Başka oturumda reddedilen bir işlem, kullanıcıya sorulmadan başka yoldan yapılmaz.
- Karar satırına yalnız kullanıcının kendi cümlesi yazılır. Aktarımın özeti ayrı satırda "koordinatörün özeti" diye durur (önceki devirden, bu gün de uygulandı).

## 8. Artifacts (ana klasör `artifacts/koordinator/`, gitignore'da)
- `bl-199-ui-rejected-designs.patch` ve `bl-199-ui-artifacts/`: reddedilen A/B/C tasarımları ve 10 fikir; `task/bl-199-ui`'nin yedeği.
- `note-mark-r3-designs.patch` ve `bl-199-mark-artifacts/`: kullanıcının tasarım oturumunun 3. turu; `task/note-mark-r3`'ün yedeği.
- `hosted-before-sec003.sql` ve `hosted-before-sec003-data.sql`: SEC-003 öncesi hosted yedeği.
