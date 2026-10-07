---
name: haftalik-denetim
description: Newfork haftalık kural denetimi (CLAUDE.md §4.6); ayın ilkinde aylık tam denetim. Kural dosyalarında çelişki, eskimiş bilgi, yalnız hafızada kalmış kural, §2.C özeti ile ILKELER.md farkı ve dört sayı (öneri kabul oranı, haftalık Mert düzeltmesi, oturum başı sabit yük, gönderimden CI yeşiline süre). Koordinatörün verdiği oturum çalıştırır; çıktı docs/plan/research/denetim-<tarih>.md.
---

# Haftalık denetim

Koordinatörün verdiği bir oturum yapar, haftada bir. Ayın ilk denetimi **aylık**tır (aşağıdaki ek maddelerle). Denetim salt okurdur: tek yazdığı rapor dosyasıdır. Düzeltme yapmaz; eskimiş bilgiyi koordinatör düzeltir, kural eklemek, değiştirmek ya da silmek Mert onayıyla (§4.6).

Başlarken ilk iş `get_usage` (session `self`): `context.tokensUsed` 3. sayının bu haftaki ölçümüdür.

## Okunacaklar
- Kural: `CLAUDE.md`, klasör kuralları (`supabase/`, `apps/api/`, `apps/web/`, `e2e/` altındaki `CLAUDE.md`), `docs/plan/ILKELER.md`, `docs/plan/KARARLAR.md`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/settings.json` kancaları.
- Kayıt: `docs/plan/HANDOFF.md`, `EKRAN-PLANI.md`, `KOORDINATOR-KARARLARI.md` (son hafta), `DERSLER.md`.
- Hafıza: `C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\` (`MEMORY.md` ve dosyalar).
- `docs/archive/` okunmaz (kural değil).

## Kontrol listesi
1. **Çelişki:** aynı konuda iki dosya farklı söylüyor (gönderim, kilit, rapor yeri, kayda kim yazar, port). Her bulgu iki `dosya:satır` ile.
2. **Eskimiş bilgi:** olmayan dosya, betik ya da komut; eski oturum kimliği; ölü bağlantı; eski port; yanlış bölüm atfı. Bölüm atıfları: `grep -rn "CLAUDE.md §" CLAUDE.md */CLAUDE.md apps/*/CLAUDE.md docs/plan/*.md .claude scripts --include=*.md --include=*.mjs` → her `§N` bugünkü başlıkla eşleşiyor mu (tarihli kayıtlar — BACKLOG, KOORDINATOR-KARARLARI, DERSLER, tasks, research — olduğu gibi kalır, sayılmaz).
3. **Yalnız hafızada kalmış kural:** hafıza dosyasında olup `CLAUDE.md` / `ILKELER.md` / `KARARLAR.md`'de olmayan süreç kuralı (§4.6: hafıza yalnız kullanıcı ve ortam bilgisi tutar).
4. **§2.C özeti ↔ `ILKELER.md`:** P01–P26 tablosundaki her satır tam metnin "Kural:" satırıyla aynı şeyi mi söylüyor; birinde olup ötekinde olmayan ilke.
5. **Dersler:** `DERSLER.md`'de üçüncü kez görülen ders → `CLAUDE.md`'ye kural önerisi (Mert'e, koordinatör üzerinden).
6. **Kancalar ve kaçışlar** (`C:/Users/TheWe/Documents/Codex/.newfork-inbox/audit.log`, son 7 gün): `push-main-override`, `heavy-override`, `records-allow` (kim, gerekçe); `heavy-warn` / `heavy-block`, `records-warn` / `records-block` sayıları; `guard-error`; `heavy-ci-unknown` ve `records-unknown` (çoğalıyorsa `gh` ya da oturum kaydı biçimi değişmiştir ve kanca sessizce kör kalır). Yanlış pozitif varsa örneğiyle yaz.

## Dört sayı
| # | Sayı | Komut / kaynak | Tanım |
|---|---|---|---|
| 1 | Önerinin kabul oranı | `node scripts/decision-log.mjs stats 4` | Son haftanın "kabul%" sütunu (önerili tek seçimli sorularda önerilenin seçilme oranı). Hedef ≥ %85 (§4.7). "geri dönen soru" da yazılır. |
| 2 | Haftalık Mert düzeltmesi | aynı çıktının "başka" + "serbest" sütunları; `grep -n "ters çevrildi" docs/plan/KARARLAR.md docs/plan/KOORDINATOR-KARARLARI.md` (o haftanın tarihleri); `DERSLER.md`'de o hafta "Mert düzeltti" girişleri | Toplam ve kırılım. |
| 3 | Oturum başı sabit yük | denetim oturumunun ilk `get_usage`'ı | `tokensUsed` ve en büyük üç kategori. Önceki ölçümler: ~102 bin (2026-10-06), 95,8 bin (2026-10-07). |
| 4 | Gönderimden CI yeşiline süre | `gh run list --branch main --event push --limit 50 --json headSha,createdAt,updatedAt,conclusion,displayTitle` | Haftanın `success` koşularında `updatedAt − createdAt` (kuyruk dahil): medyan ve en uzun. Kırmızı → yeşil: ilk kırmızıdan sonraki ilk yeşile süre. Yalnız `docs/**` / `*.md` push'u CI başlatmaz, sayılmaz. |

Her sayı geçen haftanın denetimiyle yan yana yazılır (önceki `docs/plan/research/denetim-*.md`).

## Aylık ek
- Alt ajan hafızaları `.claude/agent-memory/<ajan>/`: süreç kuralı içeren, eskimiş ya da tekrar eden kayıt.
- `CLAUDE.md` §4.8 dosya haritası gerçek dosyalarla eşleşiyor mu (her satırdaki dosya var mı, yazan doğru mu).
- Klasör `CLAUDE.md`'leri kökteki §6 ile çelişiyor mu.

## Çıktı
`docs/plan/research/denetim-<YYYY-MM-DD>.md`:
```
# Denetim <tarih> (haftalık | aylık)
Karar · İzin · Risk · Soru · Sonraki        (5 satır, CLAUDE.md §4.4)

## Dört sayı              (tablo: sayı · bu hafta · geçen hafta · hedef · komut)
## Bulgular               (önem sırasıyla: tür · dosya:satır · ne · öneri · kim düzeltir: koordinatör / Mert onayı)
## Kancalar ve kaçışlar   (audit.log özeti)
## Bakılmayanlar ve neden
```
Haber: `node scripts/inbox.mjs send "<oturum/iş>" "DENETIM-<tarih>" docs/plan/research/denetim-<tarih>.md`. Raporu yazınca koordinatörden cevap gelene kadar boşta bekle.
