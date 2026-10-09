---
name: haftalik-denetim
description: Newfork haftalık kural denetimi (CLAUDE.md §6); ayın ilkinde aylık tam denetim. Kural dosyalarında çelişki, eskimiş bilgi, yalnız hafızada kalmış kural, CLAUDE.md §4 ile KARARLAR §0 farkı ve dört sayı (öneri kabul oranı, haftalık Mert düzeltmesi, oturum başı sabit yük, hazır → main süresi). Koordinatörün verdiği oturum çalıştırır; çıktı docs/plan/research/denetim-<tarih>.md.
---

# Haftalık denetim

Koordinatörün verdiği bir oturum yapar, haftada bir. Ayın ilk denetimi **aylık**tır (aşağıdaki ek maddelerle). Denetim salt okurdur: tek yazdığı rapor dosyasıdır. Düzeltme yapmaz; eskimiş bilgiyi koordinatör düzeltir, kural eklemek, değiştirmek ya da silmek Mert onayıyla (§4).

Başlarken ilk iş `get_usage` (session `self`): `context.tokensUsed` 3. sayının bu haftaki ölçümüdür.

## Okunacaklar
- Kural: `CLAUDE.md`, klasör kuralları (`supabase/`, `apps/api/`, `apps/web/`, `e2e/` altındaki `CLAUDE.md`), `docs/plan/KARARLAR.md`, `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/settings.json` kancaları.
- Kayıt: `DURUM.md`, `docs/plan/EKRAN-PLANI.md`, `docs/plan/gunluk/` (son 7 gün), `docs/plan/KARARLAR.md` §4.
- Hafıza: `C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\` (`MEMORY.md` ve dosyalar).
- `docs/archive/` okunmaz (kural değil).

## Kontrol listesi
1. **Çelişki:** aynı konuda iki dosya farklı söylüyor (gönderim, kilit, rapor yeri, kayda kim yazar, port). Her bulgu iki `dosya:satır` ile.
2. **Eskimiş bilgi:** olmayan dosya, betik ya da komut; eski oturum kimliği; ölü bağlantı; eski port; yanlış bölüm atfı. Bölüm atıfları: `grep -rn "CLAUDE.md §" CLAUDE.md */CLAUDE.md apps/*/CLAUDE.md docs/plan/*.md .claude scripts --include=*.md --include=*.mjs` → her `§N` bugünkü başlıkla eşleşiyor mu (tarihli kayıtlar — BACKLOG, gunluk, tasks, research — olduğu gibi kalır, sayılmaz).
3. **Yalnız hafızada kalmış kural:** hafıza dosyasında olup `CLAUDE.md` / `KARARLAR.md`'de olmayan süreç kuralı (§6: hafıza yalnız kullanıcı ve ortam bilgisi tutar).
4. **CLAUDE.md §4 ↔ KARARLAR §0:** dayanak sırası ve "her zaman Mert'e" listesi iki yerde aynı mı.
5. **Dersler:** `KARARLAR.md` §4 (süreç) ve günlükteki "Ders" satırlarında üçüncü kez görülen ders → `CLAUDE.md`'ye kural önerisi (Mert'e, koordinatör üzerinden).
6. **Kancalar ve kaçışlar** (`C:/Users/TheWe/Documents/Codex/.newfork-inbox/audit.log`, son 7 gün): `push-main-override`, `push-main-blocked`, `record-by-worker-blocked`, `guard-error`, `train-override`, `train-ci-red`. Yanlış pozitif varsa örneğiyle yaz.

## Dört sayı
| # | Sayı | Komut / kaynak | Tanım |
|---|---|---|---|
| 1 | Önerinin kabul oranı | `node scripts/decision-log.mjs stats 4` | Son haftanın "kabul%" sütunu (önerili tek seçimli sorularda önerilenin seçilme oranı). Hedef ≥ %85. "geri dönen soru" da yazılır. |
| 2 | Haftalık Mert düzeltmesi | aynı çıktının "başka" + "serbest" sütunları; `docs/plan/KARARLAR.md`'de "ters çevrildi" (o haftanın tarihleri) + `DURUM.md` "Sağlık" ters çevirme sayısı | Toplam ve kırılım. |
| 3 | Oturum başı sabit yük | denetim oturumunun ilk `get_usage`'ı | `tokensUsed` ve en büyük üç kategori. Önceki ölçümler: ~102 bin (2026-10-06), 95,8 bin (2026-10-07). |
| 4 | Hazır → main | docs/plan/gunluk/ (HAZIR satırı) ve "train-push" olayları (.newfork-inbox/audit.log) | Her işin HAZIR anından main'e girişine süre: medyan ve en uzun. |

Her sayı geçen haftanın denetimiyle yan yana yazılır (önceki `docs/plan/research/denetim-*.md`).

## Aylık ek
- Alt ajan hafızaları `.claude/agent-memory/<ajan>/`: süreç kuralı içeren, eskimiş ya da tekrar eden kayıt.
- `CLAUDE.md §6 kayıt tablosu` gerçek dosyalarla eşleşiyor mu (her satırdaki dosya var mı, yazan doğru mu).
- Klasör `CLAUDE.md`'leri kökteki §7 ile çelişiyor mu.

## Çıktı
`docs/plan/research/denetim-<YYYY-MM-DD>.md`:
```
# Denetim <tarih> (haftalık | aylık)

## Dört sayı              (tablo: sayı · bu hafta · geçen hafta · hedef · komut)
## Bulgular               (önem sırasıyla: tür · dosya:satır · ne · öneri · kim düzeltir: koordinatör / Mert onayı)
## Kancalar ve kaçışlar   (audit.log özeti)
## Bakılmayanlar ve neden
```
Son mesajın raporun yoludur; koordinatör günlükten okur. Raporu yazınca koordinatörden cevap gelene kadar boşta bekle.
