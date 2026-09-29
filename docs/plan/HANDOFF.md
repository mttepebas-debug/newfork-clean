# Koordinatör devri — 2026-09-29 akşam

Devreden: "Koordinatör el değiştirmesi" (`local_243f826b-1906-491b-b1fc-1a1bdbb4316d`); bağlamı %76.
Devralan: bu dosyayı okuyan yeni koordinatör oturumu (havuzdan).
Ölçüm anı: `origin/main` = bu devir commit'i (üstü `12d74178`); main CI son kod koşusu yeşil (4c205f9b); kilitler boş; yerel Supabase açık (9 container); Docker açık.
**Kullanıcı PC başında değil, yönetim koordinatörde.** Kurallar: `docs/plan/KOORDINATOR-KARARLARI.md` başı (karar ver, KK-n olarak logla, kullanıcı dönünce raporla; geri alınamaz/hosted/ücretli olan park) ve kullanıcı hafızası `user-away-mode`, `single-track-and-computed-plan`.

## 0. İlk işler (sırayla)
1. Kendi `local_` kimliğini al (`get_session self`). Bütün rol ve işçi oturumlarına yeni adresi `mcp__ccd_session_mgmt__send_message` ile bildir (liste §4). **CLAUDE.md §3/§12'deki koordinatör kimliği güncellenmedi** — CLAUDE.md değişikliği kullanıcı onayı ister (§8); kullanıcı dönünce sor, o zamana kadar rollere adresi mesajla ver.
2. Eski koordinatörü (`local_243f826b…`) arşivle: telefon bağlantısını kapat, sabitlemeyi kaldır, `archive_session`. Worktree'si yok (ana klasörde çalıştı); `newfork-wt/coord` ve `newfork-wt/merge-account` senin kullanacağın worktree'ler.
3. **Rapor kanalı:** rollerin `SendMessage` raporları koordinatörde onay bekleyip düşüyor. Her görev mesajına "raporu `mcp__ccd_session_mgmt__send_message` (session_id: <senin id>) ile gönder" satırı yaz. Rapor gecikirse `list_events` ile oturum kaydından oku (hafıza `coordinator-session-address`).

## 1. Toplu tur T1 — main'e girmek üzere (en önemli açık iş)
- Dal: `task/batch-t1` @`2f2c4eb0` (origin'de), worktree `newfork-wt/merge-account` (node_modules kurulu). İçerik origin/main `9cc8281e` üstüne cherry-pick: Account yeniden tasarımı (11 commit, `…3b2a4b00`), BL-335 telefon tetikleyicisi (`4acf7166`), BL-332 Settings menüsü, G2 (`3367b0ed`,`a0ac7ea9`), G22 (`a1cb41c3`,`9d3791e5`), G19 (`342b6548`,`b0488ea9`,`62ffbf1d`), G6 (`6b681623`,`62782c12`,`bd77d44e`), G9a (`933d01d2`,`1306a77e`), App testi düzeltmesi (`2f2c4eb0`).
- Onaylar: Account güvenlik ONAY @a3a7b3e9 + görsel QA ONAY @a3a7b3e9; BL-335 ONAY (DB @4acf7166 + web @3b2a4b00); G6 ONAY @62782c12 (+D1 hücresi); G9a ONAY @78fa6fc3; G2 R1 koordinatör onayı; G22 ONAY @9d3791e5, G19 ONAY @b0488ea9 (bağımsız alt ajan).
- CI (run 36569993744 @1306a77e): **db yeşil**; check 1 kırmızı (`App.test.tsx` BL-332 eski kural — `2f2c4eb0` ile düzeldi, yerelde yeşil); e2e 1 kırmızı: `owner-legal-name-setup.spec.ts:101` "Legal name" başlığı yeni Profile'da yok → **nf-arayuz düzeltiyor** (`merge/account` üstüne push edecek; sha'yı send_message ile verecek — gelmezse `list_events` ile oku). Sonraki koşu (2f2c4eb0) bilerek iptal edildi.
- **Yapılacak:** nf-arayuz'un e2e commit'ini `task/batch-t1`'e cherry-pick et → `git fetch && git rebase origin/main` (main'de yalnız docs ilerledi) → push (CI `task/**`'ta tetiklenir; `batch/**` tetiklemez) → CI yeşil → `node scripts/lock.mjs take main "<rol/oturum>, …"` + `take db …` → dört migration'ı ortak yerel DB'ye kalıcı uygula (`20260929120000_the_account_phone_is_the_only_phone`, `20260929160000_a_preferred_name_notice_reaches_its_deciders`, `20260929161000_an_approved_name_is_told_and_availability_has_its_producer`, `20260929180000_time_off_doors_close_with_the_workspace`; `npx supabase migration up --local`) → `git push origin HEAD:main` (fast-forward) → kilitleri bırak → main CI'ı izle (`account_notification_scope` ci-green'e girdi; ilk main CI asıl kanıt).
- Sonra: nf-planlama'ya "T1 main'de" de (kapanış satırları + DONE.md + devir §3'ün dört işi: G16/Account maddeleri tazeliği, BL-345, BL-277, BL-350). Birleşen dalları ve worktree'leri temizle (`task/account-redesign`, `merge/account`, `task/settings-view-passive`, `task/bl335-phone`, `task/g2-quick-editor`, `task/g22-tooltip-note-corner`, `task/g19-today-helper`, `task/g6-notification-delivery`; merge'i `git cherry` ile doğrula; uzak dal silme izni yok → kullanıcı listesine). Untitled session (`local_d6998ed6…`, Account'un eski sahibi) ve nf-arayuz'un Account işi kapanır.

## 2. Sıradaki toplu tur T2 (onaylı ya da incelemede)
- **G4** zamanlanmış dışa aktarma: ONAY @6013d5a7 ("İnceleme: G4, G5" oturumu). Dal `task/g4-scheduled-export`.
- **G5** parola/hesap güvenliği: dal `task/g5-account-security` @1590a7b2 (G4'ün üstünde); **inceleme kararı bekleniyor** ("İnceleme: G4, G5", `local_a7a832aa…`). Ultrareview önerisi kullanıcıya (G4, G5, G6 riskli yüzey).
- G4 K7: saatlik cron (Vercel planı) kullanıcı kararı — "Hosted bekleyen" listesinde (program dosyası).

## 3. Yürüyen işler (işçiler)
| Oturum | İş | Durum |
|---|---|---|
| İşçi: G9b (`local_f510f0b1…`) | BL-182 + BL-127 izni kısaltıp atamak (KK-19, KK-20) | yazıyor; dal `task/g9b-shorten-time-off` (G9a üstünde) |
| İşçi: G13 (`local_a7b847f2…`) | test ve CI kararlılığı | yazıyor; dal `task/g13-test-stability` |
| İşçi: G6→G9 (`local_288cb6cc…`) | boşta (bağlam ~%45) | düzeltme gelirse |
| İşçi: G2→G22→G19 (`local_9c375e52…`) | boşta (~%50) | düzeltme gelirse |
| İşçi: G4→G5 (`local_ba38fd87…`) | boşta (~%47) | G5 inceleme düzeltmesi gelirse |

Paralel iş kuralı: kullanıcı paralel işçilere izin verdi (KK-15/16/18); dosya kümeleri ayrık olmalı (program dosyasında ölçülü "dokunduğu dosyalar"). Sıradaki çakışmasız adaylar: G7 = FB-6.2.1 (T1 main'e girince; KK-5/12/17), G8 (G4 main'e girince), G10, G17, G18, G21, G11. G14/G15/G16/G20 Schedule/Account dosyaları T1'le serbest kalınca.

## 4. Oturumlar (newfork-clean)
Roller (hepsi sabitli, telefondan izlenebilir): nf-planlama `local_86b620a0…` (yeni; dal `task/backlog-program-6`), nf-guvenlik `local_2a1c91fd…` (yeni), nf-arayuz `local_6a90e9ce…` (~%47; e2e düzeltmesi), nf-db `local_3dc69041…`, nf-backend `local_7a9cd29c…`, nf-test `local_50c331df…`, nf-gorsel-qa `local_13e7e4de…` (bağlamı yüksek olabilir), "İnceleme: G4, G5" `local_a7a832aa…`. Boş havuz: "Bekle: handoff raporu gelene kadar idle (N)", kalan numaralar 11–30 (boşta; telefon bağlantıları açık). Devir kalıbı: en küçük numaraya `send_message` ile rol dosyası + devir notu + koordinatör adresi; başlık "Rol: …", sabitle, Remote Control; eskiyi (RC kapat, sabitlemeyi kaldır) arşivle.

## 5. Kayıtlar
- Kararlar: `docs/plan/KOORDINATOR-KARARLARI.md` KK-1…KK-20.
- Program: `docs/plan/tasks/BACKLOG-PROGRAM.md` (grup sırası, ölçülü dosyalar, toplu turlar, "Hosted bekleyen" listesi, GK — yalnız BL-073 kullanıcıya kaldı). Açık madde 261 (en yüksek BL-355).
- Tazelik: G1–G24 ölçüldü; G16 ve Account'a değen maddeler T1 main'e girince.

## 6. Kullanıcıya dönüşte sorulacaklar (tek listede)
1. CLAUDE.md'deki koordinatör kimliğinin güncellenmesi (§8).
2. Hosted bekleyen: saatlik cron/Vercel planı (BL-101), `RESEND_API_KEY` (U63), hosted en kısa parola 8 (BL-161).
3. BL-073 (hesap düğmesi ile workspace değiştirici) — görsel varyant.
4. Ultrareview önerisi: G4, G5, G6 (riskli yüzey).
5. Uzak dal silme izni yok: GitHub'daki `batch/t1` ve birleşen `task/*` dalları kullanıcıya liste.
6. Ana klasör (`newfork-clean`) `7fcf31e0`'de geride; güncellemesi izin kuralıyla reddediliyor (nf-guvenlik MEMORY.md yerel eski sürüm + izlenmeyen checklist; içerikleri main'de) — kullanıcı PowerShell'de: `git restore .claude/agent-memory/nf-guvenlik/MEMORY.md`, `Remove-Item .claude/agent-memory/nf-guvenlik/checklist-role-button-row-borrowed-name.md`, `git merge --ff-only origin/main`, `pnpm.cmd --filter @newfork/shared --filter @newfork/ui build`.

## 7. Dersler (bu devir)
- Rapor kanalı (§0.3) bir saat kaybettirdi: raporlar sessizce düştü.
- İşçi dallarına her push CI'ı tetikler (`task/**`) ve bu PC'nin runner'larını doldurur; gereksiz koşuları iptal et, toplu dalı `task/batch-*` adıyla gönder (CI orada tam kapı: check + db + e2e, seed'den temiz DB).
- Toplu tur öncesi etkilenen ekranın bütün testlerini (App.test gibi entegrasyon testleri dahil) ve etkilenen e2e'yi düşün; odaklı test yetmedi (BL-332 App.test, Account e2e).
- GateGuard kancası silme/reset komutlarında "üç bilgi" istiyor; `git reset --hard` ve `switch -C` işçilerde reddediliyor, `rebase` geçiyor. Uzak dal silme reddediliyor.
- Alt ajan incelemecilerin (feature-dev:code-reviewer) git aracı yok: diff'i scratchpad'e yazıp yolunu ver.
