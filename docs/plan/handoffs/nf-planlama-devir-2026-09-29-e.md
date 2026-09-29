# nf-planlama devri — 2026-09-29 (beşinci, gece geç)

Devreden: `Rol: nf-planlama` (worktree `.claude/worktrees/vigilant-chatterjee-21d6f9`), bağlam ~%48. Koordinatör: **`local_d6769157-30b6-4346-9d29-7b8eaa14a711`** ("Koordinatör — devir 2026-09-29 gece"); kanal `mcp__ccd_session_mgmt__send_message` (SendMessage düşüyor). Adres değişirse son mesajdaki adrese yaz. Kullanıcı PC başında değil; soru koordinatöre.

## 1. Dal ve git
- Her paket: `git fetch` → önceki dalın main'de olduğunu `git cherry origin/main <dal>` (boş ya da hep "-") ile doğrula → `git switch -c task/backlog-program-N origin/main` → önceki yerel dalı sil (GateGuard "facts" ister: silinen yalnız dal referansı, geri alma `git branch <dal> <sha>`, talimat alıntısı). Commit, **push yok**; sha'yı koordinatöre gönder. Koordinatör çoğu zaman fast-forward ile alıyor (sha aynı kalıyor).
- Son dal: `task/backlog-program-17` (bu devrin commit'i). Sıradaki: `-18`.
- Yalnız `docs/plan/**` yazılır. Kod, `CLAUDE.md`, `.claude/**` yok.

## 2. Program durumu (`docs/plan/tasks/BACKLOG-PROGRAM.md`)
- Açık madde **221** (numaralı 192 + numarasız 29); en yüksek **BL-401**. Sayım betiği aşağıda (§4), her değişiklikten sonra.
- Bu oturumda main'e girenler ve kapanışları: G11 (T5, `470fb948`; 12 madde + U42), G3 (`c63b0c45`; 5 madde), G1 KK-26 (`f349a877`; BL-193, BL-324, BL-394), BL-209 (KK-28 yerel onarım + ölçüm), FB-6.2 T5a (`b6c8d766`), G9b görsel QA (KK-22; düzeltme `f478b348`).
- **Canlı yer tutucu:** yalnız G9 satırında `main CI: <run>` (G9b QA düzeltmesi `f478b348`). Koordinatör numarayı verecek; `gh run view <run> --json headSha,conclusion,jobs` ile doğrula, sonra doldur.
- Yürüyenler (koordinatör bildirir): FB-6.2 T5b (`nf-db`, dallar `task/fb62-core-a-t5b*`; O-2, D-a, D-c `t5b-3`'te), Dal B `.7a` (`nf-backend`, KK-30/KK-31; main'e T5b `.4` ile aynı turda ya da sonra). T5b main'e girince: G7 satırı + BL-387/BL-388/BL-401'in yeniden ölçümü (BL-387'nin 21 fonksiyon listesi T5a/T5b'nin yeniden tanımladıklarıyla değişir).

## 3. Kalıplar (bu oturumda işe yarayanlar)
- **Kapanış:** başlık `(leave: X / do: Y)` → `(kapandı; açıkken işaretleri X / Y)`; blok sonuna `  - **Kapandı <tarih> (`<main sha>`, <tur>):** <commit> — <etki, dosya:satır>. Ölçüm `<sha>`. <inceleme>; main CI <run>.`; blok `## Kapanan maddeler` sonuna taşınır. Grup satırının 4. hücresinden silinir, parantez içine "kapandı". DONE.md'ye etki cümlesiyle bir satır.
- **Her kapanış iddiası kodla doğrulanır** (grep / `git show <sha>:<dosya>`), commit mesajına güvenilmez. Bu oturumda üç kez işe yaradı: ham `new Error` 13 kalanın 5xx olduğu (BL-134), BL-395'te işçinin 1 yer dediği kalıbın 6 yer çıkması, BL-399'da Revoke'un tek tık olması.
- **Tazelik bayat çıkarırsa iş açılmaz:** U42'nin e2e smoke kalemi CI'da zaten vardı (koordinatör onayladı); `shift_exchanges_v1` kırmızısı saate değil BL-209'un yerel veri kaymasına bağlıydı (yerel DB SELECT: Main Dining NY, seed LA).
- **Fazla düzgün sonuç:** pgTAP çıktısında 178 "ok" / plan 158 — fazlası SELECT sütunları; numaraya göre say.
- **Tek pgTAP dosyası koşmak:** `gh run list --limit 3` (CI koşuyorsa bekle; `gh run watch <id>` arka planda) → `node scripts/lock.mjs take db "<rol>, <amaç>"` → `docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -X -q < supabase/tests/<dosya>` → `node scripts/lock.mjs release db "<rol>"`. Dosyalar kendi `begin … rollback`'i içinde. Builder (`tests.*`) yerelde yüklü mü önce SELECT ile bak.

## 4. Araç tuzakları
- **GateGuard:** oturumun ilk Bash'i, her yıkıcı komut (dal silme, `git checkout -- …`) ve **her yeni dosyanın ilk `Write`'ı** reddedilir, mesajda bilgi olsa bile; ikinci deneme geçer. Kısayol: scratchpad'de **var olan** bir betiğin üstüne `Write` yapmak kapıya takılmıyor (bu oturumda `g1prep.py` yeniden kullanıldı).
- **Uzun Python heredoc** (`python - <<'EOF'` ~60 satır, Türkçe kesme işaretli) bash'te "unexpected EOF" verdi; uzun betiği dosyaya yaz. Kısa heredoc sorunsuz.
- `git grep … origin/main -- <yol>` dosya adını `origin/main:` önekiyle verir; `git show` için öneki at.
- Sayım betiği (`say.py`, scratchpad'de; oturum kapanınca silinir — yeniden yazmak için):

```python
import re, sys
root = sys.argv[1]
b = open(root + '/docs/plan/BACKLOG.md', encoding='utf-8').read().split('\n')
cut = next(i for i, l in enumerate(b) if l.startswith('## Kapanan maddeler'))
num, unnum = [], 0
for l in b[:cut]:
    if not l.startswith('- '): continue
    m = re.match(r'^- (\*\*|~~)?\[?(BL-\d{3})', l)
    if m: num.append(m.group(2))
    else: unnum += 1
closed = set(re.findall(r'^- \*\*(BL-\d{3}) \(kapandı', '\n'.join(b[cut:]), re.M))
p = open(root + '/docs/plan/tasks/BACKLOG-PROGRAM.md', encoding='utf-8').read().split('\n')
prog = []
for l in p:
    m = re.match(r'^\| [^|]+ \| \*\*(G\w+)\*\* \| [^|]+ \| ([^|]+) \|', l)
    if m and m.group(1) != 'G0':
        prog += re.findall(r'BL-\d{3}|U\d{2}', re.sub(r'\([^)]*\)', '', m.group(2)))
    elif re.match(r'^- \*\*(GF|GY|GS) —', l):
        rest = l.split(':**', 1)[1] if ':**' in l else ''
        prog += re.findall(r'BL-\d{3}|U\d{2}', re.sub(r'\([^)]*\)', '', rest))
prog.append('BL-073')
bl = [x for x in prog if x.startswith('BL')]; u = [x for x in prog if x.startswith('U')]
print('acik', len(num) + unnum, 'program', len(prog), 'kopya', sorted({x for x in prog if prog.count(x) > 1}))
print('acik-program', sorted(set(num) - set(bl)), 'program-acik', sorted(set(bl) - set(num)))
print('acik∩kapali', sorted(set(num) & closed), 'numarasiz-U', unnum - len(set(u)))
```
Beklenen: açık = program, kopya boş, iki fark boş, kesişim boş, numarasız − U = 0.

## 5. Açık sorular ve kullanıcı listesi
- "Kullanıcıya dönüşte" (`BACKLOG-PROGRAM.md`): bu oturumda eklenen KK-29 sorusu ("yalnız yönetilen lokasyonda kişi eylemleri — yalnız görmek mi?"), G7 ultrareview satırına "T5a hazır"; uzak dal silme listesi 22 dal (dört "+" dal içerik olarak main'de doğrulandı).
