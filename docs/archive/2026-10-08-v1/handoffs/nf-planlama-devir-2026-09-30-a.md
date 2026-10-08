# nf-planlama devri — 2026-09-30 (a)

Devreden: `Rol: nf-planlama` (worktree `.claude/worktrees/gracious-shtern-2970cc`), bağlam ~%50. Koordinatör: **`local_d6d4a08d-2501-451d-a79d-c66d80185709`** ("Koordinatör — devir 2026-09-30"); kanal `mcp__ccd_session_mgmt__send_message`. Adres değişirse son mesajdaki adrese yaz. Kullanıcı PC başında değil; soru koordinatöre. Koordinatör kararı: bu nottan sonra iş `nf-planlama` **alt ajanıyla** yürür (havuzda yeni oturum yok).

## 1. Dal ve git
- Her paket: `git fetch` → önceki dalın main'de olduğunu `git cherry origin/main <dal>` ile doğrula (boş ya da hep "-"; koordinatör çoğu zaman cherry-pick ediyor, sha değişiyor) → `git switch -c task/backlog-program-N origin/main` → eski yerel dalı sil (`-d`; cherry-pick'lenmişse `-D` gerekir, GateGuard "facts" ister: silinen yalnız dal adı, geri alma `git branch <dal> <sha>`, talimat alıntısı). Commit, **push yok**; tek satır sha koordinatöre.
- Son dal: `task/backlog-program-27` (bu not). Sıradaki: `-28`.
- Koordinatör bazen aynı yer tutucuyu kendisi doldurur (`42e84565` ↔ `7dcc60c9`): pakete başlamadan main'in son 3–5 commit'ine bak.
- Yalnız `docs/plan/**`. Rapor worktree'de `artifacts/nf-planlama/<iş>/RAPOR.md` (gitignore'da).

## 2. Program durumu (`docs/plan/tasks/BACKLOG-PROGRAM.md`, main `e4b5be3f`)
- Açık madde **227** (numaralı 198 + numarasız 29); en yüksek **BL-418**. Sayım betiği `nf-planlama-devir-2026-09-29-e.md` §4'te (aynı betik; Windows'ta `PYTHONIOENCODING=utf-8`).
- **Canlı yer tutucu yok.** Main CI'lar: T5a 36599208215, T5b 36618282202, FB-6.2.9 36620542304 (hepsi yeşil).
- **FB-6.2 (G7) durumu:** T5a + T5b + `.9` main'de. Kapananlar (bu devirde): BL-129, BL-130, BL-270, BL-317, BL-242, BL-155, BL-354, BL-099, BL-243, BL-365, BL-187; kısmen BL-133, BL-176, BL-276. Done when 1 tamam.
- **Yürüyen:** `.7b` (`nf-backend`, `task/fb62-core-b-7b`), `.7b-db` (`nf-db`, `task/fb62-7b-db`, ONAY @`02162f94`; D1/D2/D4 yardımcı/D5 dalda düzeltiliyor). Kararlar KK-35, KK-36.
- **`.7b` / `.7b-db` main'e girince yapılacaklar:** G7 satırı + FB-6.2 Notes; BL-413 (pano/to-do rota kapıları) ve BL-414 (davet rotaları `employee_access.manage`) `.7b` kapsamındaysa kapanış (kodla doğrula: `communication-routes.ts:256/:282/:314/:345`, `app.ts:549/598/644/699`); BL-416 (2) (`authorization_coverage.test.sql:110`) dalın D1'inde düzeldiyse kapanış; BL-176 kalanı FB-6.8'de (kapanmaz).
- **Sonra:** `.8` (`nf-arayuz`: BL-402, BL-403, BL-418; BL-409, BL-410 adayı), `.10` (e2e: BL-195, BL-404), `.11` kapanış.

## 3. Kullanıcıya dönüşte (bu devirde eklenenler)
- **BL-405 canlı gönderim:** canlı DB 20 migration geride (son `20260929110000`; main son `20260930172000`). `.7a` main'de → canlıda Employees çekmecesi 500 olabilir; Vercel'in main'i kendiliğinden yayına alıp almadığı ölçülmedi. Canlı kullanıcı yok, park. `HANDOFF.md` §5.4'te.
- **BL-417 lokasyon adı görünürlüğü** (öneri (a) gizli değil).
- BL-406'da Invite'a basılınca sunucunun ne yaptığı ölçülmedi (yazma gerekir).

## 4. Kalıplar (bu devirde işe yarayanlar)
- **Toplu kapanış betiği:** blok = başlık satırı + altındaki `  - ` satırları; başlık `(leave: X / do: Y)` → `(kapandı; açıkken işaretleri X / Y)`, sona `  - **Kapandı <tarih> (\`<main sha>\`, <tur>):** <commit> — <etki, dosya:satır>. Ölçüm … ; main CI …`, blok dosya sonuna ("Kapanan maddeler") taşınır; kısmi kapanışta blok yerinde kalır, `**Kısmen kapandı …** … **Açık:** …` satırı eklenir. Program satırında kapanan numara parantez içine "kapandı" ile; GF/GY/GS satırlarında da. DONE.md **CRLF** (sona `printf '%s\r\n'`), en yeni satır en altta.
- **Kapanış kanıtı:** migration'ın son tanımı (`grep -ln "function public.X" supabase/migrations/*.sql | tail -1`) ya da ortak yerel DB `prosrc` SELECT (`docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -X -At -c "…"`); CI iddiası `gh run view <id> --json headSha,conclusion,jobs`.
- **Arşivlenecek işçinin raporu:** koordinatör "kayda geçmemiş bulgu varsa yaz" dediğinde raporun "yolda bulunan / Öneri / Temiz bulunanlar / API" notlarını da tara — bu devirde iki kez kayıtsız not çıktı (BL-414, BL-418).
- **Bağlam:** her paket ~%1–2; %55'te dur, bu nota ek yaz.

## 5. Araç tuzakları
- GateGuard: ilk Bash, her yıkıcı komut (dal `-D`) ve her dosyanın ilk Write/Edit'i bir kez reddedilir; bilgileri yaz, aynı çağrıyı tekrarla.
- `git ls-tree origin/main supabase/migrations/` ile migration sayımı (yerel dosya listesi de olur).
- Python çıktısında `∩` Windows konsolunda hata verir: `PYTHONIOENCODING=utf-8`.

## 6. Güncelleme (2026-09-30, `task/backlog-program-29`, son paket)
- `.7b` + `.7b-db` main'de (T5c, `0806cc62`); BL-413, BL-414 kapandı; Done when 6 → 0. **Main CI 36625278415 yeşil**: BL-413/BL-414 kapanış satırları (BACKLOG), G7 satırı ve Notes (BACKLOG-PROGRAM), FB-6.2 Notes — numara gelince `gh run view 36625278415 --json headSha,conclusion,jobs` ile doğrula, 36625278415'ı değiştir (yalnız bu paketin satırları; eski Notes metinlerindeki 36625278415 sözleri geçmiş kaydı).
- Açık madde **229**, en yüksek **BL-422** (BL-419…BL-422 `.7b` incelemesinden: B2 karar gerekli, B3 BL-401 ile birlikte, B4 rol adı, Hub owner metni `.8`). Ultrareview (`.7b`) "Kullanıcıya dönüşte"de.
- Sırada: `.7b` görsel QA (KK-37, main sonrası), `.8`, `.10`, `.11`. Sıradaki dal `task/backlog-program-30`.
