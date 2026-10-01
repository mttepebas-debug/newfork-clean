# Koordinatör devri — 2026-10-01 ~14:05Z (kullanıcı PC başında DEĞİL)

Devreden: "Koordinatör" (`local_199f5c39-3dc3-442a-9870-aa3b80d35890`, havuz (59), worktree `intelligent-bartik-b0e305`); bağlam %58, iş sınırında devrediyor.
Devralan: havuzdan "(71)" `local_353d5a30-43c0-42ad-a441-672bec294a0d` (worktree `sharp-wescoff-6267c7`) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir**; ilk iş onu kayıt oturumuna BESLEME ile bildirmek.
**Kullanıcı yok (2026-10-01 ~10:30'dan beri):** "sen yönet ilerlemeyi, geldiğimde raporu alırım." → hafıza `user-away-mode`; CLAUDE.md §13: ürün kararı yalnız KARARLAR/ILKELER birebir kapsıyorsa (KK'ya yaz); P04 görsel seçim, P18 temel model, canlı (hosted) DDL, geri alınamaz, ücretli, arşiv → PARK. **Yeni canlı gönderim için onay YOK.**

## 0. Temel gerçekler (önceki devirden geçerli; kısaltıldı)
1. Main her gönderimde CANLIYA çıkar (Vercel). Canlı yayın sha'sı: `gh api repos/mttepebas-debug/newfork-clean/deployments?per_page=5`.
2. OPS-03: alan EKLEYEN migration önce canlı → ortak yerel DB → main; alan SİLEN iş önce main, sonra canlı. Canlı her gönderim kullanıcı onayı.
3. Canlı gönderim yolu (onay varsa): yedek (md5 + ACL) → `apply_migration` (büyük dosyada dar talimatlı alt ajan) → `schema_migrations.version` dosya adına eşle → md5 canlı = yerel → `get_advisors security`. Hafıza `hosted-migration-push-via-mcp`.
4. Main'e almada ortak yerel DB'ye uygula (`lock.mjs take db` ayrı adım → `npx supabase migration up --local`).
5. Kilitler ayrı adımda: `node scripts/lock.mjs take main "<kim>, <amaç>"` → işlem → `release`. Zincirleme yok.
6. **Yeni pgTAP dosyası içeren her main gönderiminden önce** `bash scripts/ci-green-guard.sh <origin/main sha>` (bugün main bu yüzden bir kez kırıldı, `b9c665f2` düzeltti).
7. Posta kutusu: `node scripts/inbox.mjs claim` **çıplak komut** (boru/zincir varsa kanca tanımaz); `node scripts/inbox.mjs wait 600` arka planda (`run_in_background`), her uyanışta okunan `ack`, yeniden başlat.
8. Havuz: "Bekle: handoff raporu gelene kadar idle (NN)" = boş oturum. Kurulum: `set_session_model claude-opus-5-5` + `set_session_effort high` + başlık "Rol: <rol> (<uzmanlık>)" + `set_pinned` + rol ataması mesajı ("DEVRALDIM" ile başla) + `set_remote_control` (ilk mesajdan sonra). Kullanılanlar: (56)–(71). **Boş kalanlar: (72)–(80).** (51)–(55) eski yol taşır, kullanma.
9. İnceleme: R3 → `nf-guvenlik` alt ajanı (`subagent_type: nf-guvenlik`, `model: opus` — Haiku başlamıyor). Kayıt: `C:/Users/TheWe/Documents/Codex/newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` (§1–§7).
10. Bütün ilerleme kayıtlarını kayıt oturumu yazar; sen BESLEME gönderirsin (son: #61).

## 1. İlk işler (sırayla)
1. `get_session self`: başlık "Koordinatör" (ben koydum), sabit ve RC'yi doğrula.
2. `node scripts/inbox.mjs claim` (çıplak), sonra arka planda `wait 600`.
3. BESLEME #62 kayıt oturumuna: yeni koordinatör kimliği + bu HANDOFF'un sha'sı.
4. Rollere yeni adres (tek satır; §3'teki aktif/boşta satırları).
5. Eski koordinatörü (`local_199f5c39…`) kullanıcı dönünce arşivlemeyi sor (rapora yaz).

## 2. Aktif iş: FB-6.3 (izin oylaması) — `docs/plan/tasks/FB-6.3.md`
| Adım | Durum | Nerede |
|---|---|---|
| `.0`–`.4` | canlıda + main'de | (önceki devir) |
| `.5` API+shared+web veri | **canlıda + main'de** `13b7c8cd` (nf-guvenlik ONAY @c1f9ea87; CI yeşil; Vercel success 11:33Z) | — |
| `.5b` hub opsiyonel alanlar | **main'de** `bdd7b859` (R1, koordinatör okuması; CI yeşil) | — |
| DB park paketi (KK-72 D1/D2 `033000`, KK-75 yayın notu `034000`, KK-76 hub alanları `035000`) | dalda, üçü ONAY (§4 @a54d9ee9, §6 @edafa6ec koşullu, §7 @56c1910e); **kullanıcı canlı onayını bekliyor** | `task/fb-6.3-pubnote` @`85745a04` (nf-db `local_a0051ad4…`, worktree `happy-mahavira-b02a84`). Sıra/md5: 033 `bbf83394…` → 034 `799443d4…` → 035 `9bec7851…`. Koşul: canlı md5 `ddd1b0f7…` (preflight), `ed23a481…` (decisions) = yerel; sonra advisors; sonra main'e rebase + tam kapı + yerel DB; sonra `.6`'daki geçici yol (`EmployeeHubPage.tsx` `ponytail:`) silinir |
| `.6` ekranlar + `.6b` QA düzeltmeleri | dalda; görsel QA ONAY @`8d6cae82`; **kullanıcının panel varyant seçimini bekliyor** (`?progressVariant=a|b|c`; ilk görüntüler `newfork-clean/artifacts/nf-arayuz/fb-6.3.6/02-panel-*`, düzeltilmiş hâli `newfork-clean/.claude/worktrees/objective-shamir-b06952/artifacts/nf-arayuz/fb-6.3.6b/02-panel-*`) | `task/fb-6.3.6` @`33949914` → `task/fb-6.3.6b` @`8d6cae82`. Seçim sonrası tur (nf-arayuz `local_d16ba31f…`): seçilmeyen iki varyant silinir + 409 satırı uyarı tonu + son QA bakışı (nf-gorsel-qa `local_66ae0bcc…`) + tam kapı |
| `.8` e2e | dalda bitti, 4 senaryo (yerel 32/32) | `task/fb-6.3.8` @`73c1ec7c` (= 6 + 6b + 8 tek çizgi) |
| `.7` DB silmeleri | **sürüyor** — nf-db `local_055397b2…` (havuz 69), dal `task/fb-6.3.7-db2` (`9e03f22a`'dan); kalan A–E (devir raporu `.newfork-inbox/done/20261001T135432-nf-db-local-72a35150-fb-6-3-7-db.md`) | migration `20261003040000_time_off_forgets_location_and_parts.sql` |
| `.7` kod silmeleri | **sürüyor** — nf-backend `local_19f398bb…` (havuz 70), dal `task/fb-6.3.7-code` (`73c1ec7c`'den) | R3 → bitince nf-guvenlik (alt ajan) — DB + kod birlikte incelensin |
| `.7` e2e | sırada — nf-test: `e2e/flows/shift-hub-time-off.spec.ts:32-33` → `tests.leave(` + `decide_time_off_service(…)` (DB raporu §5.3) | DB dalı bitince |
| `.9` kapanış | sırada | — |

**Main'e alma sırası (kullanıcı dönünce):** (1) DB park paketi canlı onayı → canlı → main; (2) varyant seçimi → `.6b` üstüne seçim turu → QA → `.6`+`.6b`+`.8` main; (3) `.7` DB + kod + e2e tek gönderim main'e (alan silen: önce main), sonra canlı DROP (onay). `.7` için ultrareview önerilir (veri silme + şema; CLAUDE.md §5) — yalnız kullanıcı başlatır.

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt) | `local_793b68ab-4f8b-4ce6-ac97-a947cf47e996` (66) | aktif, bağlam ~%33; #61'e kadar yazdı |
| Rol: nf-db — FB-6.3.7 devam | `local_055397b2-034d-4630-a747-0d57af9027eb` (69) | **çalışıyor** |
| Rol: nf-backend | `local_19f398bb-72f0-4438-b6ce-2db9d3452e4e` (70) | **çalışıyor** |
| Rol: nf-db (park paketi sahibi) | `local_a0051ad4-a061-45d4-9626-99a551dafafe` (62) | boşta; paketi ve dalı tutar, canlı gönderim günü çağrılır |
| Rol: nf-arayuz | `local_d16ba31f-57a1-4ae7-ba0f-1b338015ede8` (67) | boşta; seçim sonrası turu yapar |
| Rol: nf-gorsel-qa | `local_66ae0bcc-7e85-48a4-8e48-4a84970b1bd0` (65) | boşta (~%37); betikleri scratchpad'inde; seçim sonrası son bakış |
| Rol: nf-test | `local_17d5b65d-25bc-435f-9d86-677996a391f2` | boşta (~%35); `.7` e2e onun |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta (incelemeler alt ajanla) |
| "(eski)" başlıklı oturumlar | koordinatör `local_2464b099…`; kayıt `local_b0d3be14…`, `local_09f7902d…`; nf-db `local_6b0b5907…`, `local_72a35150…`; nf-backend `local_44c01eca…`, `local_ea5837d3…`; nf-arayuz `local_0038c687…`, `local_a142f44f…`; nf-gorsel-qa `local_2a24338f…` | hepsi durdu; **arşiv kullanıcı dönünce** (kayıtta §0c). Dal tutanlar: `task/fb-6.3` (6b0b5907; main'de, silinebilir), `task/fb-6.3.5`/`.5b` (ea5837d3; main'de), `task/fb-6.3.6` (a142f44f; `.6b`'nin tabanı — main'e girene kadar tut), `task/fb-6.3.7-db` (72a35150; `db2`'nin tabanı — tut) |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

## 4. Kullanıcı dönünce verilecek rapor (CLAUDE.md §10) — bu devirde bitenler (2026-10-01 10:47–14:05Z)
- **Canlıya çıkan:** FB-6.3.5 (izin gönderme/iptal/oy/geri alma uçları, Requests kuyruğunda ilerleme ve son karar anı, Employee Hub'da durum; BL-496 kod kısmı — departman/iş sırası okunmuyor). Görünür değişiklik yok (ekranlar `.6`'da). FB-6.3.5b (hub opsiyonel alanlar).
- **Main kırıldı ve düzeldi:** `8d84f278` CI `db` kırmızı (iki yeni pgTAP yeşil listede yoktu) → eski koordinatör `b9c665f2`; ders §0.6.
- **Kullanıcıdan istenecekler (kayıtta ILERLEME §0c):** (39) DB park paketi canlı onayı; (49) panel varyant seçimi; (45) aynı turda admin'e iki bildirim (öneri: tek bildirim); (46) ilerlemeyi kim görür (BL-508; öneri: yalnız karar verenler); (47) yayın notunu izin okuma izni olmayan yayıncı görsün mü (öneri: evet); (53) "Decide by" saat dilimi gösterimi (P18 — sohbette); eski oturum arşivleri.
- **Koordinatör kararları (Mert onaysız):** KK-73 (eski izin uçları `.7`'ye kadar kalır), KK-74 (`.5` ayrı dal), KK-75 (bekleyen izin notu DB'den), KK-76 (hub'a dilim + süre), KK-77 (lokasyonsuz talepte yalnız "Takes effect now."). Her birinin "Uygulamada etkisi" KOORDINATOR-KARARLARI'nda.
- **Yeni backlog:** BL-508…BL-515 (kayıt oturumunun yazdığı; ayrıntı BACKLOG). BL-505 açık (QA turu), kanıtları arşivde.
- **Hatam:** BL-505'i "kapandı" diye besledim; kayıt oturumu yakaladı, kapatılmadı.

## 5. Dersler (bu devir)
- `inbox.mjs claim` boru/zincirle koşulursa kanca kaydetmez; çıplak koş.
- BL kapatmadan önce maddenin işini oku (BL-505).
- Karşılaştırmayı bozan varyant kusuru seçimden ÖNCE düzeltilir (a varyantı gri görünüyordu).
- Rol oturumları ~%45–55'te devrediyor: büyük işi (`.7`) baştan iki oturuma (DB/kod) bölmek bekleme süresini kısalttı.
- Önceki devirlerin dersleri: `git show 47bb6c17:docs/plan/HANDOFF.md`.
