# Koordinatör devri — 2026-10-02 gece (Mert uyuyor, tam otomasyon)

Devreden: "Koordinatör" `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` (worktree `optimistic-dewdney-c78421`); bağlam %67, FB-6.7 A kapandıktan sonra temiz sınırda devrediyor.
Devralan: havuzdan "(87)" `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.**

## 0. Mert'in gece talimatı (kalıcı kural CLAUDE.md §8 "Sürekli yetki")
- "İlerleme sende. Bu iş bitince planı kontrol et ve yeni bir task seç… taskleri sessionlara delege ederek ilerlemeyi devam ettir. Karar alman gereken yerlerde karar al ve kararlarını ne, nerede, nasıl, ne zaman, ne için sorularına açıkça yanıt verecek şekilde kaydet… Full otomasyon. Durma. Aynı anda tek task, ama küçük parçalara bölüp 1'den fazla işçi kullan."
- "Ben geri gelene kadar bana tıklayarak cevap vermem için soru sorma." → AskUserQuestion YOK; kararı ver, KK'ye yaz; yetki dışı olanı park et, dönüşte tek turda sor.
- Sürekli yetki (CLAUDE.md §8, main `636b76ee`): canlıya migration (MCP; ONAY + OPS-03 + yedek + doğrulama; gerçek veri silme hariç), oturum yönetimi (aç / iş ver / arşivle / `/clear` / RC / model), birleşmiş dal + temiz worktree silme, yeni iş seçme. Yetki dışı: db reset, canlıda gerçek veri silme, ücretli, gizli anahtar, yeni bağımlılık, force push, deny listesini gevşetme.
- KK biçimi: her karar ne / nerede (ekran + dosya) / nasıl / ne zaman / ne için + "Uygulamada etkisi" (ekran adı, kim ne yapınca önce → sonra, isimli örnek).
- Mert dönünce ilk mesaj: ne bitti (ekranda ne değişti), senin yerine verilen kararlar, onun seçeceği varyantlar, park edilenler.

## 1. İlk işler (sırayla)
1. Kendi worktree'ni tazele: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku.
2. `node scripts/inbox.mjs claim` (ÇIPLAK komut) + arka planda `node scripts/inbox.mjs wait 3600`; her uyanışta oku → bağımsız doğrula → `ack` → yeniden başlat.
3. Kendini "Koordinatör" yap, sabitle, RC aç. BESLEME #105 kayıt oturumuna: yeni kimlik + bu dosyanın sha'sı.
4. Devreden oturumu (`local_abc4d126`) arşivle. Worktree'sinde iz dosyaları kaldı (`.claude/agent-memory/nf-guvenlik/…`); içerikleri bu devir commit'iyle main'de — klasör kirli görünür ama kayıp yok.
5. İşçileri ~15 dk'da bir yokla (`list_sessions` + `git -C <worktree> log/status` + posta kutusu); `notify_when_idle` RC oturumlarında çalışmıyor.

## 2. Süren iş: FB-6.7 B + C (tek iş, iki işçi)
- **A kapandı:** main `56618b03` + e2e düzeltmesi `adda1e1c`; CI 36992387493 check/db/e2e yeşil; canlıda iki migration (`20261004000000`, `20261004010000`), yedekler `newfork-wt/coord/artifacts/coord/fb-6.7/hosted-push/`. BL-530/532/534 kapanıyor (besleme #104).
- **İşçi 1** `local_863130bd-957d-498b-9dfb-71a39090e29e` "FB-6.7 C-veri: kapalı gün, geçmiş kilidi, süre dolumu" — worktree `newfork-wt/fb-6.7c`, dal `task/fb-6.7c`, port 5630/5631. Kapsam: K11, KK-97, K12, KK-98, K13–K16 (önizleme ucu, seçimli kaydetme, K14 tek bildirim, K15 sonuç, K16 taslak), K17 (üç derece), K18 alanı. Sözleşmeyi posta kutusuna "FB-6.7C-sozlesme" diye bırakacak.
- **İşçi 2** `local_1628762e-1ac8-457c-be6a-540b5bafdb4d` "FB-6.7 B+C-ekran: varyantlar" — `newfork-wt/fb-6.7-ui`, `task/fb-6.7-ui`, port 5632/5633. Mert'in sabah seçeceği DEV varyantları: B1 duyuru eylemleri/etiketler, B2 yeniden onay isteği, B3 History (gizli satır, K11 salt okunur), C1 Closed day etkilenen vardiyalar penceresi, C2 üç dereceli ayar + hücre uyarısı, C3 K18 metni. Çıktı: seçim notu "FB-6.7-UI-varyant".
- Sırada: C-veri bitince R3 inceleme (`nf-guvenlik`, opus alt ajan) → düzeltme → canlı (ekleyen önce) → main → CI. Ekran: Mert seçince işçi 2 seçilen varyantı sözleşmeye bağlar → `nf-gorsel-qa` → main. FB-6.7 kapanınca sıradaki iş ILERLEME §4 hesabından (hazır: FB-6.4 takas (11), FB-6.6 belge (8)); tazelik ölçümü önce.

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt ve ilerleme) | `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` (havuz 90) | aktif, Opus high, sabit, RC; on beşinci kayıt oturumu |
| FB-6.7 A işçisi (durdu, %85) | `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` | dalı main'de → arşivlenebilir (worktree `agitated-bartik-839c9b` + `newfork-wt/fb-6.7` @fd2c9de1, dal `task/fb-6.7` main'de) |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta; incelemeler alt ajanla |
| (eski) Koordinatör — öğlen | `local_2464b099…` | "uyanık tut" açık; yalnız Mert kapatır |
| Havuz boş | 81–86 (`local_bd897796…`, `local_d7bbe7f8…`, `local_cb0f7afd…`, `local_66fc95b4…`, `local_fecde72f…`, `local_20f3dc45…`) | **Haiku/low açılıyorlar — iş vermeden önce `set_session_model claude-opus-5-5` + `set_session_effort high`** |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

## 4. Temizlik artıkları
- Diskte kalan klasörler (bu oturum silemedi, izin reddi): `.claude/worktrees/busy-kowalevski-4eedf7` (kirli, içerik main'de), `.claude/worktrees/elated-shtern-016293` (temiz). Ayrıca `.claude/worktrees/agent-a8b56c06958164a3e` (dal `task/fb-6.7-fix`, main'de, kilitli) ve coord'daki yerel dallar `fb67-merge`, `fb67-e2e` (main'de).
- Önceki devirlerden: `elastic-austin-a0eb0f`, `modest-nightingale-f80f25`, `strange-vaughan-f53be3`, `task/g14-a`, `task/g14-plan`, `refs/nf-backup/fb637-pre-reword` — önce `git worktree list` + `git cherry` ile ölç.

## 5. Dersler (bu devir)
- Devir notundaki havuz sayısına güvenme; `list_sessions` ile ölç. Havuz oturumlarının modeli Haiku/low olabilir.
- Mert'in fikrini sınamadan kurala çevirme (CLAUDE.md §5 adım 4, brainstorming).
- Yeni e2e testini main'e göndermeden yerelde koş (bu devirde CI kırmızısı: akış 7, `adda1e1c` ile düzeldi).
- Alt ajanın sonuçlarını yalnız sohbette bırakma; dosyaya yaz (FB-6.7 ölçümleri sonradan `docs/plan/research/`'e kondu).
- Kullanıcıya backlog numaralarını karıştırarak verme (BL-534/535 karışıklığı).
- Önceki devirlerin dersleri: `git show ea5ad298:docs/plan/HANDOFF.md`.
