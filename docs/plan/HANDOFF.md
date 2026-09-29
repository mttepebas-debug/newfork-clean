# Koordinatör devri — 2026-09-30 gece yarısı

Devreden: "Koordinatör — devir 2026-09-29 gece" (`local_d6769157-30b6-4346-9d29-7b8eaa14a711`); bağlamı yarıyı geçti.
Devralan: bu dosyayı okuyan yeni koordinatör oturumu (havuzdan, "Bekle: … (22)" ya da en küçük numaralı boş).
Ölçüm anı: `origin/main` = bu devir commit'i (altı `f478b348`). Kilitler boş. Main CI'ın son koşusu 36609840368 (`f478b348`) yeşil; bu devirdeki bütün main koşuları yeşil (tablo §1).
**Kullanıcı PC başında değil, yönetim koordinatörde.** Kurallar: `docs/plan/KOORDINATOR-KARARLARI.md` başı (karar ver, KK-n olarak logla; geri alınamaz / hosted / ücretli park) ve kullanıcı hafızası `user-away-mode`, `single-track-and-computed-plan`, `coordinator-session-address`. Paralel işçilere izin var (KK-15/16/18); dosya kümeleri ayrık olmalı.

## 0. İlk işler (sırayla)
1. Kendi `local_` kimliğini al (`get_session self`). Yürüyen oturumlara (§2) yeni adresi `mcp__ccd_session_mgmt__send_message` ile bildir. Hafıza `coordinator-session-address`'e yeni kimliği ekle.
2. Eski koordinatörü (`local_d6769157…`) arşivle: telefon bağlantısını kapat, sabitlemeyi kaldır, `archive_session`. "Canlı iş var" derse birkaç dakika sonra yeniden dene (bir önceki devirde üçüncü denemede geçti). Worktree'si (`.claude/worktrees/competent-grothendieck-9cfd5c`) yalnız okuma yaptı, temiz. Senin worktree'lerin: `newfork-wt/coord` (docs/karar; detached, `git checkout --detach origin/main` ile başla; node_modules YOK) ve `newfork-wt/merge-account` (toplu dallar ve tek test koşusu; node_modules kurulu; şu an detached).
3. nf-planlama'ya G9b QA main CI numarasını ver: 36609840368 (G9 satırındaki yer tutucu).

## 1. Bu devirde main'e girenler
| İş | main commit | CI |
|---|---|---|
| T4 doğrulama (önceki devirden) | `2211d09c` | main 36593473537 yeşil |
| G11 hata sözleşmesi (T5) | `470fb948` | main 36595546139 2. deneme yeşil (1. deneme ScheduleExportPanel yarış kırmızısı) |
| Titreyen test düzeltmesi | `14d7fbdd` | main 36597149885 yeşil |
| G7 / FB-6.2 Dal A T5a (`.0b`–`.3`; 2 migration uygulandı) | `b6c8d766` | dal 36598079849 + main 36599208215 yeşil |
| G3 bayat ekranlar | `c63b0c45` | dal 36600803081 + main 36601566652 yeşil |
| G1 hata durumları (BL-193, BL-324, onError, BL-394) | `f349a877` | dal 36605379737 + main 36606218492 yeşil |
| G9b görsel QA düzeltmesi (D1, D2) | `f478b348` | dal 36608826022 + main 36609840368 yeşil |
| docs | `db52049f` … `1f98904b` | KK-26…KK-31, kapanışlar, BL-386…BL-400 |

Yerel DB onarımı (KK-28): Main Dining saat dilimi seed değerine döndü; BL-209 kapandı. Açık madde (nf-planlama sayımı, son paket): 220.

## 2. Yürüyen işler
| Oturum | İş | Durum / sıradaki adım |
|---|---|---|
| İşçi: G7 / FB-6.2 Dal A T5b `.6` kalanı (`local_01ce8ca3…`, nf-db) | dal `task/fb62-core-a-t5b-3` (tabanı `origin/task/fb62-core-a-t5b-2` @5b2fb0d7) | ÖNCE nf-guvenlik O-2'yi düzeltiyor (davet hazırlama bekleyen daveti rolüne bakmadan iptal ediyor; `20260930140000` içinde, aynı dosya), D-a (ad talebi çekirdeğe), D-c; sonra `.6` kalanı (P1, üç yardımcı, BL-155, BL-354, BL-133; `review_employee_onboarding…` iki satırı `onboarding.review`'a — koordinatör cevabı (a)). Gelince: nf-guvenlik yalnız O-2 farkını yeniden inceler → ONAY → T5b toplu tur (aşağıda). |
| İşçi: G7 / FB-6.2 Dal B `.7a` (`local_fea0d55a…`, nf-backend) | dal `task/fb62-core-b-7a` | KK-31 kararlarıyla sürüyor (PermissionRoute FB-6.8'e; eşdeğersiz 5 izin `.7b`/FB-6.6'ya; API rota kapıları kalkar). R3 → nf-guvenlik + görsel QA (ekran değişiyor: Employees çekmecesi). **Şart: `.7a` main'e T5b `.4` ile aynı turda ya da sonra girer.** |
| Rol: nf-guvenlik (`local_2a1c91fd…`) | T5a, T5b `.4`, T5b-2 incelemeleri | O-2 düzeltmesini bekliyor; `.7a` incelemesi de ona. Raporu kendi worktree'sine dosya (`.claude/worktrees/busy-ishizaka-ecfaf0/artifacts/nf-guvenlik/<iş>/RAPOR.md`) + tek satır mesaj. |
| Rol: nf-planlama (`local_7938960c…`, ~%46) | backlog kayıtları | son paket `1f98904b` main'de; bekleyen: G9b QA main CI yer tutucusu, T5b düşük notları D-b/D-d. Yarıyı geçince devir önerecek. |
| Rol: nf-gorsel-qa (`local_13e7e4de…`, ~%55) | boşta | `.7a` görsel QA'sı sırası gelince; bağlamı dolu → gerekirse havuzdan yeni oturum. |
| Boştaki roller | nf-test (`local_50c331df…`), nf-db (`local_3dc69041…`), nf-backend (`local_7a9cd29c…`), nf-arayuz (`local_6a90e9ce…`), İnceleme G4/G5/G11 (`local_a7a832aa…`) | Havuz: "Bekle: … (22)"…"(30)". |

**T5b toplu tur planı:** Dal A (`task/fb62-core-a-t5b-3`'ün ucu: `.4` + Y1/O1 düzeltmesi + `.5` + ad onayı + O-2 + `.6` kalanı) ve Dal B `.7a` birlikte ya da Dal A önce. Migration'lar: `20260930130000`, `140000`, `150000` + `.6`'nınkiler (≥ `160000`); hiçbiri ortak DB'ye uygulanmadı. Kapı: nf-guvenlik ONAY (Dal A son farkı + `.7a`), dal CI yeşil, görsel QA (`.7a` Employees çekmecesi), sonra §4 kalıbıyla main. `.7b` (API davet kapısı → `employee.invite`, yeni `employee.remove_from_location` route'u, `set_managed_locations` API'si) T5b main'e girince yeni nf-backend işçisine; `.8` görsel varyantlar kullanıcıya; `.9` nf-test; `.10` e2e.

**Sıradaki program işleri (T5b'den sonra):** `BACKLOG-PROGRAM.md` sırası: G8 (G7'den sonra; `scope_set`; G11'in hint'li gövdesinden başlar), G10, G12 kalanı (BL-248 testini sil — KK-25), G14/G15 (BL-392, BL-397…BL-400), BL-395 (SchedulePage ham metin, `.7a`'dan sonra), BL-386 (SchedulePage bölme, G23).

## 3. Oturum kalıbı
Devir (hafıza `user-away-mode`): en küçük numaralı havuz oturumuna `send_message` ile rol dosyası + görev + rapor adresi + worktree kurulumu; başlık "İşçi: …" / "Rol: …", sabitle (telefon bağlantısı havuzda zaten açık). Bağlamı dolan oturum iş sınırında devir notu yazar; worktree'si temiz ve işi origin'de/main'de olduğu doğrulanınca (RC kapat, sabitlemeyi kaldır) arşivlenir. Aynı dal iki worktree'de açılamaz: eskiyi önce arşivle, ya da yeni işçiyi `git switch -c <yeni-dal> origin/<eski-dal>` ile aç. Görev mesajında: Skills satırı, dokunulmayacak dosyalar (başka işçilerin), migration damgası aralığı, "push'tan önce paketin bütün vitest'i; çıktıda 'Unhandled' olmasın", **"raporu kendi worktree'nde RAPOR.md'ye yaz, bana tek satır gönder"**.

## 4. Toplu tur kalıbı
`newfork-wt/merge-account`'ta: `git switch -c task/batch-tN origin/main` → dalları `git cherry-pick $(git rev-list --reverse origin/main..<dal>)` → `ci-green.txt` çakışması: iki taraf da kalır (işaret satırlarını sil; `git diff origin/main -- supabase/tests/ci-green.txt` yalnız `+` satır) → `bash scripts/ci-green-guard.sh origin/main` = 0 → push (`task/**` CI tetikler; aynı adı yeniden göndermek force push ister, yasak → `task/batch-tNb`) → CI yeşil → `node scripts/lock.mjs take db "koordinator/tN-main, …"` + `take main …` → `npx supabase migration up --local` → `git push origin HEAD:main` → kilitleri bırak → main CI izle (`gh run watch` arka planda).
**Kısa yol (bu devirde 4 kez):** dal CI'dan geçmişse ve main o dalın tabanından beri yalnız `docs/` aldıysa (`git diff --name-only <taban> origin/main | grep -v '^docs/'` boş) toplu dala gerek yok: fast-forward mümkünse `git push origin <sha>:refs/heads/main`, değilse main üstüne cherry-pick + `git diff <dal-sha> HEAD -- . ':!docs'` boş olduğunu gör + push. Docs-only gönderim CI tetiklemez ve koşan main CI'ı iptal etmez; kod gönderimi eder.

## 5. Kullanıcıya dönüşte (tek listede; nf-planlama `BACKLOG-PROGRAM.md` "Kullanıcıya dönüşte" bölümünü de tutuyor)
1. CLAUDE.md'deki koordinatör kimliği (§3/§12 hâlâ `local_243f826b…`) + kural önerisi: "ekran davranışı değişen işte push'tan önce o paketin bütün vitest'i; çıktıda Unhandled olmasın" (bu devirde bir kez daha: G1 dalı unhandled rejection'la kırmızı).
2. Kararların raporu: KK-26 (G1 kalanı G3'ü bekler), KK-27 (FB-6.2 parçalama), KK-28 (yerel DB saat dilimi onarımı), KK-29 ("yalnız yönetir" kişi eylemleri — **soru: yalnız görmek mi kastedildi?**), KK-30 (G1 önce, `.7a` sonra), KK-31 (`.7a` kapsamı). Önceki: KK-1…KK-25.
3. Ultrareview önerileri: **G7/FB-6.2 T5b** (üyelik bekçisi, rol verme, davet — dal `task/fb62-core-a-t5b-3`, o işçinin oturumunda `/code-review ultra`), T5a (`b6c8d766`, main'de), G9b, G11; önceki G4, G5, G6.
4. Hosted bekleyen (2026-09-30 güncel): Vercel projesi eski repoya bağlı, main canlıya çıkmıyor (BL-426; kullanıcı kararı: şimdilik dokunulmuyor, ayrı planlanacak); saatlik cron/Vercel planı (BL-101) ve e-posta denemesi (U63; `RESEND_API_KEY` Vercel'de zaten var) BL-426'ya bağlı. Kapandı 2026-09-30: BL-405 (canlı DB = main, 397 migration), BL-161 (canlıda en kısa parola 8), BL-361 (bayat: canlı log ayarları parolayı yazmıyor).
5. Kullanıcı kararı: BL-073 görsel varyant; BL-355 (3) ↔ Account K-15; BL-105 pgTAP kalıcı kurulum; sürüm atlamaları; BL-382 SSN kalıntıları; BL-370 boş yayın; FB-6.2 `.8` görsel varyantları.
6. Uzak dal silme listesi (22 dal, `BACKLOG-PROGRAM` "Kullanıcıya dönüşte"; `+0` doğrulandı) + bu devirde birleşenler: `task/batch-t5`, `task/fb62-core-a`, `task/g3-stale-screens`, `task/g1-error-states`, `task/g9b-qa-fixes`, `task/g11-error-contract`.
7. Ana klasör (`newfork-clean`) geride; güncellemesi izin kuralıyla reddediliyor — kullanıcı PowerShell'de: `git restore .claude/agent-memory/nf-guvenlik/MEMORY.md`, `Remove-Item .claude/agent-memory/nf-guvenlik/checklist-role-button-row-borrowed-name.md`, `git merge --ff-only origin/main`, `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`.

## 6. Dersler (bu devir)
- **Uzun mesaj koordinatöre ulaşmıyor:** koordinatör sürekli meşgulken `send_message` 20 sn içinde tur başlatamıyor; nf-gorsel-qa'nın G9b raporu üç kez düştü. Kalıp: rol oturumu raporu kendi worktree'sinde `artifacts/<rol>/<iş>/RAPOR.md`'ye yazar (ana klasöre yazması hook'la engelli), koordinatöre tek satır gönderir; koordinatör dosyayı okur. `list_events` mesaj gövdesini göstermez.
- **Kuyrukta kalan görev:** meşgul işçiye giden "önce şunu düzelt" mesajı kuyrukta bekledi; işçi `.5`'e geçti, Y1/O1 sonraya kaldı. İşçi raporu gelince iddia ettiği sırayı dalda ölç (`git log`, `git diff <eski> <yeni> -- <dosya>`).
- **Unhandled rejection yerelde görünmedi, CI'da kırmızı yaptı:** bütün vitest'in çıktısında "Unhandled" aranmalı; görev mesajına yazıldı.
- **İşçinin taban iddiası:** G3 "taban cb523186, arası yalnız docs" dedi, dal aslında güncel main üstüne rebase'liydi — `git merge-base` ile ölç, rapora güvenme.
- **Yetki işini küçük parçalarla incelemek işe yaradı:** T5b `.4` ayrı incelendi → Y1 (yüksek) main'e girmeden yakalandı; `.5` → O-2.
