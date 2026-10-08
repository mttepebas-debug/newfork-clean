# nf-planlama devri — 2026-09-29 (dördüncü, gece)

Devreden: `Rol: nf-planlama` (worktree `.claude/worktrees/zen-carson-cbf41a`), bağlam ~%57. Koordinatör: **`local_d6769157-30b6-4346-9d29-7b8eaa14a711`** ("Koordinatör — devir 2026-09-29 gece"; bu gün adres üç kez değişti — her zaman son mesajdaki adrese yaz). Kanal: `mcp__ccd_session_mgmt__send_message`. Kullanıcı PC başında değil; soru koordinatöre. Yeri bilerek `docs/plan/handoffs/` (önceki üç devir burada; koordinatörün "tasks/ altında" dediği yer yerine tek klasör kuralı).

## 1. Dal ve git
- Her iş: `git fetch` → güncel `origin/main`'den yeni dal (`git checkout -b task/backlog-program-N origin/main`) ya da mevcut dalda `git rebase origin/main`. Commit at, **push yok**; koordinatör cherry-pick ile main'e alır (sha'lar değişir, `git cherry origin/main HEAD` "-" gösterir). Son dal `task/backlog-program-9` (bu devrin commit'i).
- `task/backlog-program-6/-7/-8` yerel, içerikleri main'de ("+" 0); uzakta yoklar. Silmeyi koordinatör yapar.
- GateGuard: oturumun ilk Bash'inde ve her yeni dosya `Write`'ında "facts" ister (istek cümlesi + komutun ne ürettiği; Write'ta çağıran, eş dosya yok, veri biçimi, talimat alıntısı). Bilgiyi ver, aynı çağrıyı bir kez yeniden dene. Bash'te `cat > f <<'X'` içine uzun Python yazmak bir kez tırnak hatası verdi → uzun betiği scratchpad'e `Write` ile yaz, `PYTHONIOENCODING=utf-8 python <yol>`. Kısa düzenleme `python - <<'EOF'` ile sorunsuz.

## 2. Program durumu (`docs/plan/tasks/BACKLOG-PROGRAM.md`, main `db52049f` + bu commit)
- Açık madde **226** (numaralı 194 + numarasız 32); en yüksek **BL-385**.
- Main'de: GA (BL-335), G2, G6, G19, G22, G9a (T1 `209dbf8c`); G4, G5, G13 (T2 `4490f8e3`); G9b (T3 `8d2f112a`); G1, G12 (T4 `2211d09c`); **G11 (T5 `470fb948`)**. Kapanan grupların satırında kalan açıklar yazılı (ör. G4 BL-101/U63 hosted kısmı, G13 BL-281 (2)(4), BL-195 e2e yarısı).
- Yürüyen / bekleyen: **G3** (dal `task/g3-…`, `SchedulePage.tsx` + `schedule-data.ts`); **KK-26:** G1'in kalan üç web kalemi (BL-193, BL-324, `followUpAfterUnpublish` onError) G3 main'e girince G1 işçisinde. **G7 = FB-6.2 dilimi** (`docs/plan/tasks/FB-6.2.md`; ayrı dosya yok): parçalama önerisi (Dal A `nf-db` sıralı `.0b`–`.6`, Dal B `nf-backend` `.7a` paralel; T5a/T5b/T5c) **koordinatör kararı bekliyor**. KK-24 (admin başka admin'in kaydını düzenlemez) KARARLAR'da, FB-6.2 Dal A'da uygulanacak.
- **"Kullanıcıya dönüşte" listesi:** `BACKLOG-PROGRAM.md` → `## Kullanıcıya dönüşte (kullanıcı kararı gereken sorular)` (BL-355 (3) ↔ K-15, BL-073, ultrareview önerileri G7/G9b/G11, uzak dal silme listesi, CLAUDE.md kural önerisi, BL-105, sürüm atlamaları, BL-382 SSN, BL-370 boş yayın). **Hosted bekleyen** ayrı liste, hemen üstünde (BL-101 cron, U63, BL-161, BL-361).

## 3. Bekleyen işler (sırasıyla)
1. **T5 main CI run numarası** → yer tutucu `main CI: <run>` iki yerde: G11 grup satırı ve T5 tur satırı (`BACKLOG-PROGRAM.md`). Başka canlı yer tutucu yok (`<run>` geçen diğer satırlar eski Notes anlatımı).
2. **G11 kapanışı (main `470fb948`):** G11 satırındaki maddeler BL-134 BL-223 BL-172 BL-145 BL-156 BL-193 BL-213 BL-331 BL-324 BL-076 U37 U51 U42 + BL-356'nın G11'de uygulanan kalemleri (commit'lerde `BL-145, BL-156, BL-356`, `U51` görünüyor). Kaynak: `git log --oneline 2211d09c..470fb948`, `docs/plan/tasks/G11-kararlar.md` (main'de; dalda `23710521`). **Dikkat:** BL-193 ve BL-324 KK-26 ile G1'in kalanına verildi — G11'de kapanmadıysa açık kalır, satırı G1'e taşı. BL-223'ün kapı yarısı BL-374'e ayrıldı. DONE.md satırı.
3. **G9b görsel QA (KK-22)** sonucu gelince bulgular yeni madde.
4. **FB-6.2 parçalama kararı** gelince `FB-6.2.md` → "Parçalama önerisi"ni karara çevir, `BACKLOG-PROGRAM` G7 satırına durum.
5. **Uzak dal silme listesi** (`BACKLOG-PROGRAM` "Kullanıcıya dönüşte"): 18 dal "+0" doğrulandı (ölçüm main `42e7378e`). Listeden çıkarılan dördün bu devirde ölçülen hâli (`git diff --shortstat <dal-commit> <main-eşi> -- <dal commit'inin dosyaları>`):
   - `task/g4-scheduled-export` `e3ab2eda` ↔ main `8ee5307f`: main'de 3 satır fazla, dalda main'de olmayan satır yok.
   - `task/g5-account-security` `e3ab2eda` (aynı) + `f890a997` ↔ main `d330b24d`: main'de 3 satır fazla, dalda eksik yok.
   - `task/g9b-shorten-time-off` `469c5612` ↔ main `d0d3d32f`: main'de 7 satır fazla (2 dosya), dalda eksik yok.
   - `task/g12-pgtap-resilience` `81ebc4b8` ("every not-green file runs in CI once, BL-368 measurement"): main'de eşi yok; **bilerek alınmamış ölçüm commit'i mi, doğrulanmadı** — G12 kararlarına/koordinatöre sor.
   Yani ilk üçü içerik olarak main'de (çatışma çözümünde main'e birkaç satır eklenmiş); listeye alınabilir. Dördüncüsü açık soru.

## 4. Sayım betiği (her değişiklikten sonra)
Açık bölüm = `BACKLOG.md`'de `## Kapanan maddeler` üstü; `- ` ile başlayan satırlar: numaralı `^- (\*\*|~~)?\[?(BL-\d{3})`, gerisi numarasız. Program: `^\| [^|]+ \| \*\*(G\w+)\*\* \| [^|]+ \| ([^|]+) \|` (G0 hariç) 4. hücresi, parantez içi silinerek, `BL-\d{3}|U\d{2}` + `- **GF —`/`GY`/`GS` satırları (`:**` sonrası, parantez içi silinerek) + BL-073. Beklenen: açık = program, kopya 0, fark 0, açık ∩ kapalı (`^- \*\*(BL-\d{3}) \(kapandı` kapalı bölümde) boş. Betiğin kendisi `nf-planlama-devir-2026-09-29-b.md` §5'teki tarif; bu oturumda Python ile yazıldı (≈25 satır).

## 5. Kalıplar ve dersler (bu oturum)
- **Kapanış kalıbı:** başlık `(leave: X / do: Y)` → `(kapandı; açıkken işaretleri X / Y)`; blok sonuna `  - **Kapandı <tarih> (`<main sha>`):** <commit> — <etki>. <tur, dal CI, main CI>.`; blok `## Kapanan maddeler` sonuna taşınır. Numarasız: satır sonuna ` Kapandı … :` + taşı. Kısmen: `  - **Kısmen kapandı …** … **Açık:** …`, açıkta kalır. Program 4. hücreden silinir, `(… kapandı)` notu. Durum parçası ` — **…**` tek olmalı (eskisini sil; satır sonu ` |` olduğu için `[^|]*$` regex'i işe yaramaz — `find(' — **')` ile kes).
- **Büyük kapanış işini alt ajana vermek iyi gitti** (T4: 21 kapanış + 13 yeni madde, ~12 dk; kurallar prompta yazıldı, sayım betiği yolu verildi). Alt ajanın kaynağını doğrula: koordinatörün andığı "G11-kararlar 5. SIRADA" bölümü yoktu; alt ajan söyledi.
- **Benim iki hatam:** (1) BL-355 (3) Account kararı K-15 ile çelişiyordu — ekran notunu madde yapmadan önce o ekranın karar dosyasına (`*-kararlar.md`, KARARLAR "Ekran kararları") bak. (2) BL-354'te `:189/:190`'ı yanlış fonksiyona yazdım — satır numarası verirken fonksiyonun sınırlarını (`create … function` satırları) kontrol et.
- Ad çakışması: KK'lerde "FB-6.2.1" dilimin bütünü demekti, `FB-6.2.md`'de ilk alt adımın adıydı. Bir görev dosyası adı gelince önce var olan dosyada o adın ne olduğuna bak; belirsizse sor (bu seferki soru bir tur maliyetle ikiz planı önledi).
- Koordinatörün sayıları da ölçülür (T2'de "12 kapanan" dedi, 13 + 2 kısmi çıktı).
