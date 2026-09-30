# Koordinatör devri — 2026-09-30 sabah

Devreden: "Koordinatör — devir 2026-09-30" (`local_d6d4a08d-2501-451d-a79d-c66d80185709`); bağlamı yarıyı geçti, kullanıcı devri onayladı.
Devralan: "Bekle … (30)" (`local_460271c1-c51e-4537-bb02-a601c501bbbf`); yeni başlık "Koordinatör — devir 2026-09-30 sabah".
Ölçüm anı: `origin/main` = bu devir commit'i (altındaki son kod commit'i `3f034462`). Kilitler boş. Main CI'ın son kod koşusu 36651024728 (`3f034462`) check + db + e2e yeşil.
**Kullanıcı PC başında (2026-09-30'da döndü).** Ürün ve görsel kararlar yeniden kullanıcıya sorulur (tek tıkla, önerilen ilk sırada); `KOORDINATOR-KARARLARI.md` (KK-1…KK-37) kullanıcı yokken alınan kararların kaydıdır, yeni KK yalnız kullanıcı yine "yokum" derse açılır. Kullanıcı kod okumaz: her teknik adın yanında ekran adı, kişiye etkisi, somut örnek (CLAUDE.md §11.2).

## 0. İlk işler (sırayla)
1. `get_session self` ile kimliğini doğrula, başlığını "Koordinatör — devir 2026-09-30 sabah" yap, sabitle. Rol oturumlarına yeni adres bu devirde bildirildi (§2); hafıza `coordinator-session-address` güncellendi.
2. **Save dalı (§2, ilk satır):** eski koordinatörün alt ajanı bitirince dal `task/fb62-8-save` olarak origin'e `[skip ci]` ile park edilir ve sana tek satır gelir. **Main'e alma, CI koşturma** (kullanıcı 2026-09-30: "CI'da koşturma, Employment sekmesinde epey değişiklik planlıyorum"). Kullanıcıya Employment sekmesi için ne planladığını sor; Save değişikliği o işle birlikte tek turda girer.
3. **G7 `.10`'u başlat** (kullanıcı onayladı: yeni koordinatör başlatır): nf-test oturumu (`local_50c331df…`), `docs/plan/tasks/FB-6.2.md` `.10` satırı — e2e akış 2 (davet) ve akış 10'un kapsam yarısı + "Çalışan görünümüne geç". Seçici artık kenar çubuğundaki **"Employee view"** linki (telefonda yönetimin More menüsü; dönüş "Management view"). Employment sekmesi değişecekse o sekmeye dayanan seçicileri kullanıcının planı netleşince yaz. Sonra `.11` (kapanış), sonra G8.
4. Eski koordinatörü (`local_d6d4a08d…`) arşivle: Save alt ajanı bitince telefon bağlantısını kapat, sabitlemeyi kaldır, `archive_session`. Worktree'si `.claude/worktrees/optimistic-saha-c36b1f` (yalnız bir hafıza dosyasında CRLF farkı, iş yok). Senin worktree'lerin: `newfork-wt/coord` (docs; detached, `git checkout --detach origin/main` ile başla; node_modules yok; `artifacts/nf-arayuz/fb62-8-final/` altında `.8` ekran görüntüleri) ve `newfork-wt/merge-account` (toplu dallar; node_modules kurulu).

## 1. Bu devirde main'e girenler
| İş | main commit | CI |
|---|---|---|
| G7 / FB-6.2 T5b (`.4`–`.6` + `.7a`; 10 migration) | `da8e3dc0` | dal 36617252746 + main 36618282202 yeşil |
| `.9` kırmızı dosyalar | `af2ef900` | dal 36619637450 + main 36620542304 yeşil |
| T5c (`.7b` + `.7b-db`; migration `20260930180000`) | `0806cc62` | dal 36624620235 + main 36625278415 yeşil |
| `.7b` görsel QA düzeltmesi (Profile gerilemesi; migration `20260930190000`) | `809592bc` | dal 36641483937 + main 36642067162 yeşil |
| `.8` DEV varyantları | `b6da55b9` | main 36646208872 yeşil |
| `.8` kapanış (seçilenler kalıcı, varyantlar silindi) | `48a9d139`, `3f034462` | dal 36650308450 check kırmızı (App.test eski menüyü bekliyordu) → düzeltildi; main 36651024728 yeşil |
| docs | `1d20e721` … bu commit | G8 görev dosyası, KK-32…KK-37, BL-401…BL-430, hosted tazeliği, `.8` kapanış kaydı (`8ad616c7`) |

**Canlı (hosted):** kullanıcı 2026-09-30'da 22 migration'ı gönderdi; canlı DB = main (397 migration, son `20260930190000`); yedekler `C:/Users/TheWe/Documents/Codex/hosted-backup-2026-09-30.sql` ve `hosted-data-2026-09-30.sql`. Canlıda en kısa parola 8. BL-405, BL-161, BL-361 kapandı. **Vercel projesi eski repoya bağlı (BL-426): main canlıya çıkmıyor**, son canlı yayın 2026-08-05; kullanıcı kararı: şimdilik dokunulmuyor. Bundan sonra main'e giren her migration canlıyı yeniden geride bırakır; BL-426 çözülene kadar acil değil, ama o gün yeni bir "canlı geride" maddesi açılmalı (OPS-03).

**`.8` kullanıcı seçimleri (KARARLAR → Ekran kararları → Employees / Employee Hub):** lokasyondan çıkarma A (satırda kırmızı Remove, iki tık; yöneticide kilitli Terminate + açıklama), çalışan görünümüne geçiş A (kenar çubuğunda "Employee view", çalışanın kendi çerçevesi), "Manages without working there" C (kutucuk listesi), liste etiketi A ("No location" / "Manages <lokasyon>" çipleri). Ek karar: alanın kendi Save'i kalkar, çekmecenin "Save changes"i kaydeder (§2).

## 2. Yürüyen işler ve oturumlar
| Oturum | İş | Durum / sıradaki adım |
|---|---|---|
| Eski koordinatörün alt ajanı (nf-backend) | FB-6.2.8 son dokunuş: "Manages without working there" alanının Save düğmesi kalkar, "Save changes" kaydeder | Sürüyor. Bitince `task/fb62-8-save` olarak park (CI yok, main yok); §0.2. Kısmi hata davranışı ve ekran görüntüleri raporunda. |
| Rol: nf-test (`local_50c331df-d410-4f84-8521-486025aa57c1`) | boşta | `.10` buraya (§0.3). |
| Rol: nf-db (`local_3dc69041-ac51-4271-a880-e0189d739b77`) | boşta | G8a (BL-132) buraya, **G7 kapanınca** (kullanıcı kararı 2026-09-30). R3, nf-guvenlik zorunlu; kullanıcıya ultrareview önerisi. Görev dosyası `docs/plan/tasks/G8.md`. |
| Rol: nf-backend (`local_7a9cd29c-c02c-407d-91c3-00b3179b8112`) | boşta | G8b (BL-254) G8a'dan sonra. |
| Rol: nf-arayuz (`local_6a90e9ce-d597-4eeb-abe3-2c7fe7da8fec`) | boşta | Employment sekmesi değişikliği (kullanıcı anlatacak). |
| Rol: nf-guvenlik (`local_7753c716-a240-468b-bf54-cefdaf951d66`) | boşta | G8a incelemesi. Raporlar kendi worktree'sinde `artifacts/nf-guvenlik/<iş>/RAPOR.md`. |
| Rol: nf-gorsel-qa (`local_9ff804a0-8e33-477b-a569-6e95cab8ccee`) | boşta | `.8` kapanışına QA yapılmadı (koordinatör ekran görüntülerine baktı, R1 sayıldı); Employment sekmesi değişince birlikte. |
| İnceleme: G4, G5, G11 (`local_a7a832aa-bc26-4643-9a3e-e31be398e25f`) | boşta | İşi main'de; arşivlenebilirliği doğrula. |
| Havuz | "Bekle … (31)"…"(50)" (20 boş oturum) | nf-planlama rol oturumu yok: kayıt işleri alt ajanla (`isolation: worktree`) yürüyor, iyi çalışıyor. |
| "Dev sunucusu başlat" (`local_fe7f8f47…`), "…30 Tane Boş Session Aç" (`local_5834dbdf…`) | kullanıcının kendi oturumları | dokunma. |

**Sıra (kullanıcı onaylı):** G7 `.10` → `.11` → G8a → G8b. Employment sekmesi değişikliği kullanıcının yeni isteği; kapsamı sorulacak, G7 içinde mi ayrı iş mi kullanıcı söyler (tek hat kuralı). Sonrası `BACKLOG-PROGRAM.md` sırası.

## 3. Oturum kalıbı
Devir (hafıza `user-away-mode`): en küçük numaralı havuz oturumuna `send_message` ile rol dosyası + görev + rapor adresi + worktree kurulumu; başlık "İşçi: …" / "Rol: …", sabitle (telefon bağlantısı havuzda zaten açık). Bağlamı dolan oturum iş sınırında devir notu yazar; worktree'si temiz ve işi origin'de/main'de olduğu doğrulanınca (RC kapat, sabitlemeyi kaldır) arşivlenir. Aynı dal iki worktree'de açılamaz: eskiyi önce arşivle, ya da yeni işçiyi `git switch -c <yeni-dal> origin/<eski-dal>` ile aç. Görev mesajında: Skills satırı, dokunulmayacak dosyalar (başka işçilerin), migration damgası aralığı, "push'tan önce paketin bütün vitest'i; çıktıda 'Unhandled' olmasın", **"raporu kendi worktree'nde RAPOR.md'ye yaz, bana tek satır gönder"**.

## 4. Toplu tur kalıbı
`newfork-wt/merge-account`'ta: `git switch -c task/batch-tN origin/main` → dalları `git cherry-pick $(git rev-list --reverse origin/main..<dal>)` → `ci-green.txt` çakışması: iki taraf da kalır (işaret satırlarını sil; `git diff origin/main -- supabase/tests/ci-green.txt` yalnız `+` satır) → `bash scripts/ci-green-guard.sh origin/main` = 0 → push (`task/**` CI tetikler; aynı adı yeniden göndermek force push ister, yasak → `task/batch-tNb`) → CI yeşil → `node scripts/lock.mjs take db "koordinator/tN-main, …"` + `take main …` → `npx supabase migration up --local` → `git push origin HEAD:main` → kilitleri bırak → main CI izle (`gh run watch` arka planda).
**Kısa yol (bu devirde 4 kez):** dal CI'dan geçmişse ve main o dalın tabanından beri yalnız `docs/` aldıysa (`git diff --name-only <taban> origin/main | grep -v '^docs/'` boş) toplu dala gerek yok: fast-forward mümkünse `git push origin <sha>:refs/heads/main`, değilse main üstüne cherry-pick + `git diff <dal-sha> HEAD -- . ':!docs'` boş olduğunu gör + push. Docs-only gönderim CI tetiklemez ve koşan main CI'ı iptal etmez; kod gönderimi eder.

## 5. Kullanıcıda bekleyenler
1. Employment sekmesinde planladığı değişiklik (anlatacak) + park edilen Save dalı.
2. CLAUDE.md §3/§12 koordinatör kimliği hâlâ `local_243f826b…` (kullanıcı onayı ister) + kural önerisi: "ekran davranışı değişen işte push'tan önce o paketin **bütün** vitest'i" (bu devirde bir kez daha: `.8` kapanışı App.test'i kaçırdı).
3. KK-29 sorusu: "yalnız yönetir" kişi o lokasyonda yalnız görür mü, eylem de yapar mı? KK-32…KK-37 kullanıcıya özetlendi; itiraz gelmedi. KK-35 S3 koordinatör hatasıydı (düzeltme notu altında).
4. Ultrareview önerileri (yalnız kullanıcı başlatır): T5b, `.7b`, T5a, G9b, G11, G4–G6; G8a başlarken yeniden öner.
5. BL-426 (Vercel'i bu repoya bağlamak; BL-101 saatlik cron ve U63 e-posta denemesi ona bağlı). KARARLAR OPS-03'teki "Vercel main'i yayına alır" cümlesi bugün doğru değil; BL-426'da yazılı, dokunulmadı.
6. Ürün kararları: BL-417 (çekmecede lokasyon adları), BL-419 (taslak workspace'te owner API'den davet edebiliyor), BL-073, BL-355 (3), BL-105, BL-382, BL-370.
7. Backlog sayımı uyuşmuyor (kapananlar toplamı ile açık sayısı); `nf-planlama`'ya mutabakat işi önerildi, başlatılmadı. Son sayım: 233 açık madde (`nf-planlama`, 2026-09-30, `8ad616c7`). `.11` kapanışında `.8` etiketli BL-402, BL-403, BL-418, BL-422, BL-425 tazelenmeli; BL-428 (owner satırı "Unassigned +1") yerel DB'de ölçülmeli; BL-404 (test owner'ı parolayla giremiyor) ikinci kez görüldü.
8. Uzak dal silme listesi (`BACKLOG-PROGRAM` "Kullanıcıya dönüşte"); bu devirde birleşenler: `task/batch-t5b`, `task/batch-t5c`, `task/fb62-7b-qa-fixes`, `task/fb62-7b-qa-db` ve T5b/T5c'nin kaynak dalları. `task/fb62-8-final` silindi.
9. Haftalık kullanım sınırı (son ölçüm %68).

## 6. Dersler (bu devir)
- **Oturum yeniden başlayınca arka plan alt ajanları ölür.** İşleri worktree'de commit'siz kalır; bildirim "failed" gelir. `git -C <worktree> status` ile bak, bitmiş kodu kontrol edip kurtar (`.8` varyantları böyle kurtarıldı), boş kalanı yeniden başlat.
- **"Klasör testleri yeşil" yetmez.** Alt ajan yalnız `src/employees src/shell` koştu; `App.test.tsx` CI'da düştü. Görev mesajına "tüm web vitest'i" yaz.
- **Başka worktree'ye Edit/Write yok.** Koordinatör oturumu alt ajanın worktree'sindeki dosyayı düzenleyemez; `SendMessage` ile ajanı sürdür ya da Bash ile `git` kullan. `git worktree remove --force` ve uzak dal silme izinle reddediliyor → kullanıcıya PowerShell komutu ver.
- **Kullanıcıya komut verirken ilk satır `Set-Location C:\Users\TheWe\Documents\Codex\newfork-clean`.** Eksik olunca komutlar koordinatörün worktree'sinde koştu (koordinatör hatası).
- **Boş değerin iki anlamı olabilir (KK-35 S3).** "null = izin yok" varsayımı Profile gerilemesini main'e soktu; sözleşmede "kayıt yok" ile "izin yok" ayrı taşınmalı. Görsel QA yakaladı.
- **Aktarılan bulguyu kaynakta doğrula.** Koordinatör bir güvenlik bulgusunu yanlış özetledi; `nf-planlama` raporu okuyup düzeltti (rol hafızasında kural).
- **Canlı tazeliği ölç:** "Vercel main'i yayına alıyor" varsayımı yanlıştı; MCP ile bir okuma (son yayın, bağlı repo) beş maddenin hükmünü değiştirdi.
- **GateGuard hook'u:** oturumun ilk Bash'inden ve her yıkıcı komuttan önce istek + komutun ne yaptığı + geri alma yolu yazılır, sonra aynı komut yeniden denenir. `scripts/lock.mjs` kimliği "rol/oturum" biçiminde olmalı (ör. `koordinator/fb62-8`).
