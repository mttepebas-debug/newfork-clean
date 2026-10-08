# nf-planlama devri — 2026-09-29 (üçüncü)

Devreden: `Rol: nf-planlama` (worktree `.claude/worktrees/brave-hodgkin-c906e3`), bağlam ~%56. Koordinatör: `local_243f826b-1906-491b-b1fc-1a1bdbb4316d`; kullanıcı PC başında değil, soru koordinatöre. Rapor kanalı: `mcp__ccd_session_mgmt__send_message` (koordinatörün isteği; `SendMessage` onda bazen takılıyor).

## 1. Dal
- `task/backlog-program-5`, her iş sonunda `git rebase origin/main` ile main'in üstüne alınır; üstünde yalnız o işin commit'i durur. Push yok; main'e koordinatör alır (sha'ları yeniden yazar, `git cherry origin/main HEAD` "-" gösterir).
- GateGuard kancası `git reset --hard` ve `git switch -C`'yi her denemede reddediyor; `git rebase origin/main` geçiyor (main'de olan commit'i atlar). Eski `task/backlog-program-4` dalının içeriği main'de; silinmesi koordinatöre bırakıldı.

## 2. Program durumu (`docs/plan/tasks/BACKLOG-PROGRAM.md`)
- Açık madde **259** (219 numaralı + 40 numarasız), her biri tek grupta; betik §5.
- Tazelik: G1–G15 ve G17–G24 ölçüldü; "dokunduğu dosyalar" yalnız GA ve G16 için tahmin.
- En yüksek numara BL-353 (yeni numaradan önce `git show origin/main:docs/plan/BACKLOG.md | grep -o "BL-3[0-9][0-9]" | sort -u | tail -1`).
- Paralel işçiler (KK-15…19; grup satırlarının son sütununda durum): G2, G19, G22 bitti ve onaylı (toplu turu bekliyor); G4, G5, G6, G9a bitti (inceleme); G9b ve G13 başladı. "Hosted bekleyen (kullanıcı kararı)" listesi programda (BL-101 cron, U63, BL-161).

## 3. Bekleyen işler
1. **Account yeniden tasarımı main'e girince** (`merge/account` @`007325ce`): G16'nın ve Account'a değen maddelerin tazeliği — BL-258, BL-287, U30, BL-147 (G15), BL-280 (1) (G23), BL-339, BL-348, BL-351 (G16) + G16'nın kendi maddeleri; GA'nın dosyaları ölçülür.
2. **G2 main'e girince:** BL-345'in satırı ve kontrast oranı ölçülür.
3. **G19 main'e girince:** BL-277 kapanır (kalan kısım BL-353).
4. **G22 main'e girince:** BL-350'nin satırları yeniden ölçülür.

## 4. Dersler (bu oturum)
- **Kayıt işi kalıbı:** koordinatör işçi bulgusunu yollar → `git fetch` + `git cherry` + `git rebase origin/main` → en yüksek BL'ye bak → iddiayı kodda bir kez doğrula (dosya:satır; çoğu zaman kayıt büyür ya da incelir: BL-343 "üretici yok" değil "kaydı silinmiş", BL-346 bir kural değil 20) → madde + program satırı + Notes → sayım → commit → rapor.
- **Grup durumu** son sütuna " — **bitti** (…)" diye eklenir; yeni durum yazılırken eski " — **başladı/bitti** …" parçası silinir (regex `r' — \*\*(başladı|bitti)[^|]*$'`). Parantez içi BL numaraları yalnız 4. hücrede sayımdan düşer; son sütun sayılmaz.
- **KK kararı programa işlenmeli:** KK-17 BL-343'ü G6'ya taşımıştı, programda G21'de kalmıştı; yeni KK gelince grup satırlarını ona karşı oku.
- GateGuard: komut içinde "delete from" metni geçerse "yıkıcı" sayıp bilgi istiyor; yeni dosyada her `Write` bilgi istiyor (bilgi aynı mesajda verildiyse bir kez yeniden dene).

## 5. Sayım betiği
Önceki devrin (`nf-planlama-devir-2026-09-29-b.md`) §5'i aynen geçerli. Program satırı regex'i `^\| [^|]+ \| \*\*(G\w+)\*\* \| [^|]+ \| ([^|]+) \|` (G0 hariç) + `- **GF —`/`GY`/`GS` satırları + BL-073; iki küme eşit, kopya 0.
