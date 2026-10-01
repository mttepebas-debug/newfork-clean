# Koordinatör devri — 2026-10-02 ~00:05Z (kullanıcı PC başında, devri kendisi onayladı)

Devreden: "Koordinatör" `local_b355d250-87e7-4503-b04c-16a7ebc581d1` (worktree `busy-kowalevski-4eedf7`); bağlam yarıya geldi, iki iş kapandıktan sonra temiz sınırda devrediyor.
Devralan: havuzdan "(54)" `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` (worktree `optimistic-dewdney-c78421`) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.**
Kullanıcı (Mert) PC başında; son kararı ~00:00Z ("Şimdi devret"). Sorular çoktan seçmeli, tek turda, CLAUDE.md §13 şablonuyla.

## 0. Temel gerçekler
1. **Önce kendi worktree'ni tazele:** (54) `e013c442` tabanlı (bir gün eski). İlk komut kendi worktree'nde: `git fetch origin && git checkout --detach origin/main`; sonra `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` yeniden oku.
2. Main her gönderimde CANLIYA çıkar (Vercel). OPS-03: alan EKLEYEN migration önce canlı (kullanıcı onayı, senin pencerende) → ortak yerel DB → main; kod/veri SİLEN iş önce main, sonra canlı.
3. Canlı gönderim: Supabase MCP'li `general-purpose` alt ajan (`model: opus`) — yedek (`pg_get_functiondef` → `newfork-wt/coord/artifacts/coord/<iş>/hosted-push/`) → `apply_migration` → `schema_migrations.version` dosya adına eşle (araç bugünün damgasını yazar, adla bul) → md5 dosya gövdesi = canlı `prosrc` → `get_advisors security` (bugün 98: 96 rls_enabled_no_policy INFO + pg_net + leaked password, muaf). Sonra kendin bağımsız SELECT ile doğrula. CLI `supabase db push` yasak (işçi raporları bazen öneriyor; düzelt).
4. Kilitler ayrı Bash çağrısında, kimlik "rol/oturum" biçiminde: `node scripts/lock.mjs take main "koordinator/<kimlik>, <amaç>"` → işlem → `release`.
5. Yeni pgTAP dosyası taşıyan push'tan önce `bash scripts/ci-green-guard.sh origin/main` (sessiz çıkış = 0 = tamam).
6. e2e kapısı uyarı modunda (OPS-06): commit'ten SONRA etkilenen e2e `db.lock` ile; `<inbox>/e2e-pass.jsonl`'a damga düşer.
7. **YENİ ders (bu devir, benim hatam):** main CI koşarken aynı makinede tam kapı + e2e koşturdum → `schedule_grid_read_budget` 74 ms > 50 ile kırmızı; boşta yeniden koşunca yeşil. Kod gönderdikten sonra CI bitene kadar makinede ağır iş koşturma; sıradaki işin kapısını CI bittikten sonra koş.
8. **YENİ ders (benim hatam):** `for … && git branch -D` döngüsüyle silinen dallar guard'dan YEDEKSİZ geçti (guard yalnız düz `git branch -D <ad>` görüyor). Yedekler sonradan elle yazıldı (`refs/nf-backup/branch/<ad>/20261002T000000Z`). Dalı tek tek, düz komutla sil; guard düzeltmesi backlog'da.
9. Posta kutusu: `node scripts/inbox.mjs claim` ÇIPLAK komut (önüne `cd …&&` koyarsan hook saymaz, eski koordinatör kalır); arka planda `node scripts/inbox.mjs wait 3600`; her uyanışta oku → bağımsız doğrula → `ack <ad>` → yeniden başlat. İşçi raporu bazen iki kez gelir (v2); sonuncusu geçerli.
10. İnceleme: R3 → `nf-guvenlik` alt ajanı (`opus`), R2 → tek bağımsız göz (`nf-guvenlik` alt ajanı yeterli). Ekran değiştiyse `nf-gorsel-qa` alt ajanı, telefonda gerçek dokunma (`hasTouch` + `touchscreen.tap`); veri gerekiyorsa `page.route` ile DB'ye dokunmadan. Haiku alt ajanı başlamıyor (skill şişmesi): her zaman `model: opus`.
11. Bütün ilerleme kayıtlarını kayıt oturumu yazar; sen BESLEME gönderirsin (son: **#90**, main `bb604214`; ardından guard maddesi ve yedek-ref düzeltmesi için kısa ek gönderildi). Aynı işi iki kayıt oturumuna verme (bu devirde #88'de oldu; durdurup düzeldi).
12. coord worktree (`../newfork-wt/coord`) `node_modules` taşıyor; birleştirme ve tam kapı orada: `git checkout -q -B <ad> <dal>` → `rebase origin/main` → kapı → push → `git checkout --detach origin/main`.
13. Oturum arşivi: önce `set_pinned false` + `set_remote_control false` (ikisi açıkken arşiv reddedilir), sonra `archive_session`. Arşiv worktree'yi bırakabilir: temizse `git worktree remove`; "Directory not empty" ise PowerShell `Remove-Item -LiteralPath '\\?\C:\…' -Recurse -Force` + `git worktree prune`.

## 1. İlk işler (sırayla)
1. §0.1 tazeleme. `get_session self`: başlığı "Koordinatör" yap, sabitle, RC aç (RC için oturumun en az bir turu gerekir).
2. `node scripts/inbox.mjs claim` (çıplak), sonra arka planda `node scripts/inbox.mjs wait 3600`.
3. BESLEME #91 kayıt oturumuna (`local_43ff0725-b572-4ac9-9d12-8505df3e7816`): yeni koordinatör kimliği + bu HANDOFF'un sha'sı.
4. Kullanıcıya: devreden oturumu (`local_b355d250`) arşivlemeyi sor (dalı main'de, worktree temiz; bilgisi bu dosyada).
5. Sıradaki onaylı adım: **FB-6.7 Duyurular / önemli tarihler / bildirimler** (FOUNDATION-B, kayıt oturumunun §4 hesabı: hazır FB-6.4 (11), FB-6.6 (8), FB-6.7 (5); küçük puan → FB-6.7). Görev dosyası yok → önce `nf-planlama` alt ajanıyla salt okuma tazelik ölçümü (FB-6.5'te yapıldığı gibi: hüküm, ölçümler dosya:satır, önerilen In/Out, Done when, risk, Mert'e soru), sonra kullanıcıya hükümle sun, onayla kayıt oturumu görev dosyasını yazar, işçi oturumu açılır.

## 2. Bu devirde kapananlar (hepsi main'de ve canlıda)
- **FB-6.3 İzin oylaması** kapandı (`.9`): kayıt `98fa0613`; Done-when kanıtları görev dosyasında.
- **G14 müdür notu metni** (BL-204 kapandı): main `db28e732`, CI 36940420077 yeşil; canlı `20261003050000`, md5 `ea28ba7c…`. Schedule balonunda "Manager note: <metin>", en çok 4 satır.
- **FB-6.5 Availability** (BL-086 kapandı): main `ffb533ce`, CI 36941492032 yeşil; canlı `20261003060000`, md5 `371a22ef…`. İki pgTAP dosyası CI listesinde; eski mod geçişinin ölü yolları silindi.
- Kayıtlar: KK-80…85, BL-526…528 (+ guard maddesi bekleniyor), ilerleme Aşama 6–7 %69,1, program %76,9 (kayıt `bb604214`).
- İnceleme kayıtları: `newfork-wt/coord/artifacts/coord/g14/nf-guvenlik-reviews.md`, `…/fb-6.5/reviews.md`.

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt ve ilerleme) | `local_43ff0725-b572-4ac9-9d12-8505df3e7816` (havuz 52) | aktif, sabit, RC açık; on dördüncü kayıt oturumu |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta; incelemeler alt ajanla |
| (eski) Koordinatör — öğlen | `local_2464b099…` | **"Bilgisayarı uyanık tut" açık; yalnız kullanıcı kapatabilir**, sonra arşiv |
| Devreden koordinatör | `local_b355d250…` | arşiv kullanıcıya sorulacak |
| Havuz boş | (55) `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` | `e013c442` tabanlı; tek boş oturum — gerekirse kullanıcıdan yeni havuz istenir |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

Bu devirde arşivlenenler (hepsi main'de doğrulandı): devreden koordinatör `local_353d5a30`, eski kayıt `local_dfa3c062`, G14 nf-db `local_4ba671c6`, FB-6.5 işçisi `local_3dd6f9d4`.

## 4. Temizlik artıkları
- Önceki devirden kalan, ölçülmedi: kilitli üç boş klasör (`.claude/worktrees/elastic-austin-a0eb0f`, `modest-nightingale-f80f25`, `strange-vaughan-f53be3`), `task/g14-a`, `task/g14-plan` (+1 docs commit; sahibini ölç), `refs/nf-backup/fb637-pre-reword`. Önce `git worktree list` + `git cherry` ile tazele.
- Ortak yerel DB'de G14 test verisi (Meyhouse: Alex Kim, Jordan Lee notları, 5–11 Ekim taslağı) zararsız.

## 5. Dersler
- §0.7 (CI koşarken ağır iş yok) ve §0.8 (dal silmede döngü yok) bu devrin dersleri.
- Alt ajanın "sayılar şöyle çıkar" çıkarımı kayda geçmeden doğrulanır; kayıt oturumu FB-6.5'te KARARLAR:67 çıkarımını yakaladı.
- Önceki devirlerin dersleri: `git show 6aee8426:docs/plan/HANDOFF.md`, `git show 66ff28aa:docs/plan/HANDOFF.md`.
