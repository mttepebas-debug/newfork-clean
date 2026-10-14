# PC tren thread'ine istek: hesap devri için yerel yedek (2026-10-14)

Gönderen: "Hesap devri raporu" thread'i, koordinatör üzerinden.
Dayanak: Mert'in 2026-10-14 09:40 (California) isteği: "local depoya kaydedilip ve/veya githuba güvenli bir şekilde commit edilip … hiçbir şekilde hafıza/code/ilerleme kaybı olmadan".

## Sınırlar (hepsi zorunlu)
- Yalnız EKLEME yapan push: yeni ref adı `yedek/2026-10-14/...`. Force yok, silme yok, var olan hiçbir dal ya da worktree değişmez, `git stash` / `reset` / `checkout` yok.
- Hedef ref zaten varsa üzerine yazma, atla ve raporda yaz.
- main'e, train/*'e, coord/kayit2'ye dokunma. Tren yok.
- Push'tan önce her yedeğin dosya listesine gizli değer taraması: `.env*`, `*.session.json`, `*.pem`, `*.key`, `settings.local.json`, `.vercel/` girmez. Değerleri okuma, yazma. `artifacts/note-mark-r3/.session.json` açılmaz.
- "Devir testi" oturumları (569-2577cf3c, 576-5f3f2c33) okunmaz, kopyalanmaz.
- `artifacts/` (765 MB) ve `newfork-wt\coord\artifacts\canli-*` (canlı veritabanı yedekleri) GitHub'a GİTMEZ; yeni hesap aynı diski kullanacağı için yerinde kalır.

## 1. Yalnız bu diskte duran 11 dal grubu → GitHub yedeği
Raporundaki tablo (bölüm 3): backup/ekran-01-40001-* (5 dal), bl210, coord/kayit, keep/fb62-8-save-pattern, no-access-variants, task/bl-987, task/bl-990-w2, task/ekran-01-38, task/ekran-01-templates, task/otomasyon-4, task/tel.
Her biri için: `git push origin <dal>:refs/heads/yedek/2026-10-14/<dal>` (dal adındaki `/` kalabilir).

## 2. Commit'lenmemiş değişiklikler → dalı değiştirmeden yedek commit
Worktree'nin dalını ve dosyalarını değiştirmeden, geçici index ile (eski "backup/uncommitted" yöntemi):
```
set GIT_INDEX_FILE=<geçici yol>\idx
git -C <worktree> read-tree HEAD
git -C <worktree> add -A -- <yollar>
git -C <worktree> write-tree        -> <tree>
git -C <worktree> commit-tree <tree> -p HEAD -m "wip(backup): uncommitted <worktree> 2026-10-14"   -> <sha>
git -C <worktree> push origin <sha>:refs/heads/yedek/2026-10-14/uncommitted/<worktree-adı>
```
Kapsam:
- agent-a2539fabf0e3a2190 (task/bl-990-w2): 24 e2e dosyası.
- Şu worktree'lerdeki `.claude/agent-memory/` notları: admiring-volhard, agent-a3704c99, agent-ae216987, agent-a8993d35, agent-a9c2fed8, agent-aedfefc1, busy-kowalevski, friendly-blackwell, gallant-feistel, handoff-koordinatorlugu (yalnız `.claude/agent-memory/` yolu).
- sad-saha-6bb2d0 ve zen-kare-9dd93a: `tsconfig.base.json`, `turbo.json`, `vercel.json` (önce diff'e bak; içinde gizli değer varsa yedekleme, raporda söyle).
- bl-435: `artifacts-bl435-e2e.log` yalnız log; atla.

## 3. İki eski stash
`git push origin <stash commit sha>:refs/heads/yedek/2026-10-14/stash/<ad>` (db2-src-red, db2api-wip). Stash listesi değişmez.

## 4. Bilgisayardaki Claude hafızası → devir klasörüne kopya (GitHub'a ben alacağım)
Kaynak: `C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\` (34 dosya).
Hedef: `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\pc-hafiza\` (klasörü aç, yalnız kopyala, kaynağa dokunma).
Kopyalamadan önce tarama: şifre, token, API anahtarı değeri içeren satır varsa o dosyayı kopyalama ve adını yaz. "Devir testi" oturumlarına ait not kopyalanmaz.
Ayrıca aynı klasöre `pc-envanter.md` yaz: bölüm 6'daki "yalnız bu bilgisayarda duranlar" listesinin tam yolları ve boyutları (içerik değil).

## 5. Hesap devri dalını yerel depoya al
"Hesap devri raporu" thread'i `claude/hesap-devri-bqus46` dalını push ettiğinde (koordinatör sha'yı iletecek):
`git fetch origin claude/hesap-devri-bqus46` (yalnız fetch; checkout yok, ana klasörde dal değişmez).
Ardından `git -C C:\Users\TheWe\Documents\Codex\newfork-clean log -1 origin/claude/hesap-devri-bqus46` çıktısını raporla.

## 6. Rapor (koordinatöre, tek tablo)
| Ne | ref / yol | sha | durum (gönderildi / atlandı + neden) |
Ve en sonda: `git ls-remote origin "refs/heads/yedek/2026-10-14/*"` çıktısının satır sayısı.
