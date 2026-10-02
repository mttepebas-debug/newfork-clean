# Koordinatör devri — 2026-10-02 öğleden sonra (Mert PC başında değil, tam otomasyon)

Devreden: "Koordinatör" `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` (worktree `.claude/worktrees/clever-bhaskara-078eda`); bağlam ~%57, FB-6.6 tazeliği başlatıldıktan sonra temiz sınırda devrediyor.
Devralan: havuzdan `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` (eski on beşinci kayıt oturumu, OPS-07 ile temizlendi) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir.**

## 0. Mert'in talimatı (2026-10-02 ~13:00Z, koordinatör penceresi)
- "Pc basinda degilim. Otomasyon olarak bir sonraki taski seçip, sessionlara delege et ve ilerlemeye devam et. Pc başına geçince görselleri inceleyip kararlarimi iletirim. Bu bir engel ise, bu taski atla."
- Gece talimatı ve sürekli yetki aynen geçerli (CLAUDE.md §8): canlıya migration (MCP; ONAY + OPS-03 + yedek + doğrulama; gerçek veri silme hariç), oturum yönetimi (aç / iş ver / `/clear` ile havuza döndür / RC / model — ARŞİV YOK, OPS-07), birleşmiş dal + temiz worktree silme, yeni iş seçme. Yetki dışı: db reset, canlıda gerçek veri silme, ücretli, gizli anahtar, yeni bağımlılık, force push, deny listesi.
- Tıklamalı soru YOK. Kararı ver, KK'ye beş soruyla + "Uygulamada etkisi" yaz; kapsamayan ürün sorusu park edilir, Mert dönünce tek turda sorulur.
- Mert dönünce ilk mesaj: ne bitti (ekranda ne değişti), senin yerine verilen kararlar, seçeceği varyantlar, park edilen sorular.

## 1. İlk işler (sırayla)
1. Worktree: `git fetch origin && git checkout --detach origin/main`; `CLAUDE.md`, `DELEGASYON.md`, `docs/plan/ILKELER.md` oku.
2. `node scripts/inbox.mjs claim` — ÇIPLAK komut (önünde/arkasında `;`, `&&`, `cd` olursa hook saymaz). Sonra arka planda `node scripts/inbox.mjs wait 3600`; her uyanışta oku → bağımsız doğrula → `ack` → yeniden başlat.
3. Kendini "Koordinatör" yap, sabitle, RC aç. Kayıt oturumuna (`local_10a5177a-66d2-4c9c-8292-95c7613d4c4d`, on altıncı) BESLEME: yeni kimlik + bu dosyanın sha'sı.
4. Devreden oturumu (`local_d8686bdf…`) OPS-07 ile temizlet: ona "kendini temizle" mesajı (RC kapat, sabitlemeyi kaldır, başlık "(havuz) boş", `clear_session self`). Önce ölç: worktree temiz, gönderilmemiş commit yok (`.claude/launch.json` git dışı ve yereldir — `coord-api`/`coord-web` girdileri FB-6.7 lab'ini `newfork-wt/fb-6.7-ui`'den 5642/5643'te çalıştırır).
5. İşçileri ~15 dk'da bir yokla (`list_sessions` + `git -C <worktree> log/status` + posta kutusu).

## 2. Süren işler
### FB-6.6 Belgeler / onboarding — YENİ, aktif
- Seçim (koordinatör, ILERLEME §4: FB-6.4 11 / FB-6.6 8, zincir eşit, her biri 1 satır açıyor → küçük puan). KK olarak kayıt oturumuna beslendi (devir beslemesinde).
- Tazelik + görev dosyası: işçi `local_863130bd-957d-498b-9dfb-71a39090e29e` ("FB-6.6 tazelik + görev dosyası", `nf-planlama`, Opus high, sabitli, RC açık). Worktree `newfork-wt/fb-6.6-plan`, dal `task/fb-6.6-plan`; push yok. Çıktı: `docs/plan/tasks/FB-6.6.md` (A veri+yetki+kural `nf-db`→`nf-backend` R3; B ekran `nf-arayuz`) + posta kutusunda "FB-6.6-tazelik" (her ölçüm geçerli/değişmiş/bayat, KARARLAR'ın kapsadığı ürün kararları dayanağıyla, kapsamadıkları §13 soru taslağı).
- Sonra: görev dosyasını docs-only main'e al; açık sorulara bağlı OLMAYAN parçaları havuz oturumlarına ver (A: `nf-db` işçi oturumu; aynı dosyaya iki rol yok); kapsamayan ürün sorularını park et. R3 → `nf-guvenlik` (opus alt ajan) → canlı (OPS-03, yedek, md5) → main → CI.

### FB-6.7 ekran (B + C) — PARK, Mert'in varyant seçimini bekliyor
- Veri ve kural tarafı bitti: A ve C-veri canlıda ve main'de (`de010002`; canlı `20261004000000`, `…4010000`, `20261005000000`, `20261005010000`; CI 37002680529 yeşil). İlerleme Aşama 6–7 %70,1 (169/241), program %77,4.
- Ekran işçisi `local_1628762e-1ac8-457c-be6a-540b5bafdb4d` ("FB-6.7 B+C-ekran", boşta): `newfork-wt/fb-6.7-ui`, `task/fb-6.7-ui` @`a9f1bd39` (origin/main `a3b92c1f` üstü). Varyanttan bağımsız kısım dalda: Announcements etiketleri, Important dates geçmiş kilidi, "bir kez sor" (sürükle-bırak + hızlı düzenleyici, `closedDayConfirmation.ts`), BL-540/541/542. Lab DEV-only.
- Lab: http://127.0.0.1:5642/app/dev/fb67 (giriş owner@newfork.test, parola seed.sql). Sunucular devreden koordinatörün preview'u — devirde/uykuda KAPANIR. Mert "bakacağım" derse önce ölç (`curl`); kapalıysa kendi oturumunda `.claude/launch.json`'a iki girdi ekle (cmd betikleri `newfork-wt/fb-6.7-ui`'de çalışır: API `PORT=5643 APP_URL=http://127.0.0.1:5642 pnpm.cmd --filter @newfork/api dev`; web `VITE_API_URL=http://localhost:5643 pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port 5642 --strictPort`) ve `preview_start` ile aç.
- Seçim gelince: işçiye seçilenleri gerçek ekrana bağlat (B1 eylem yeri + BL-543 "Delete→Archive", B2, B3 History, C1 closed-day penceresi, C2 kontrol tipi, C3 metin) → lab'i ve DEV rotasını sil → e2e (Done when C-3) → `nf-gorsel-qa` → main. İşçinin önerileri: B1-C, B2-C, B3-B, C1-A, C2-A, C3-A (rapor "FB-6.7-UI-varyant").

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt ve ilerleme), on altıncı | `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` | aktif, sabit; bağlam ~%35 |
| FB-6.6 tazelik | `local_863130bd-957d-498b-9dfb-71a39090e29e` | çalışıyor |
| FB-6.7 B+C-ekran | `local_1628762e-1ac8-457c-be6a-540b5bafdb4d` | boşta, seçim bekliyor |
| Rol: nf-guvenlik | `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` | boşta; incelemeler alt ajanla |
| Havuz "(havuz) boş" | `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` (+ devreden temizlenince `local_d8686bdf…`) | iş vermeden önce model/effort ölç |
| Havuz "Bekle: … (81–86, 91–95)" | `list_sessions` ile ölç | Haiku/low açılabilir — iş vermeden önce `claude-opus-5-5` + high |
| (eski) Koordinatör — öğlen | `local_2464b099…` | yalnız Mert kapatır |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

## 4. Temizlik artıkları
- `.claude/worktrees/agent-a9c2fed83104fc506` (nf-db alt ajanı; hafıza notu main'de `a3b92c1f`, başka değişiklik yok) ve `.claude/worktrees/agent-a8b56c06958164a3e` (dal `task/fb-6.7-fix`, main'de, kilitli) — `git cherry` ile ölçüp sil.
- Önceki devirlerden: `busy-kowalevski-4eedf7`, `elated-shtern-016293`, `elastic-austin-a0eb0f`, `modest-nightingale-f80f25`, `strange-vaughan-f53be3`, `task/g14-a`, `task/g14-plan`, coord'daki `fb67-merge`, `fb67-e2e` — önce ölç.
- Canlı yedekleri: `newfork-wt/coord/artifacts/coord/fb-6.7/` ve `…/fb-6.7c/` (git dışı; silme).

## 5. Dersler (bu devir)
- `inbox.mjs claim` yalnız çıplak komutla sayılır.
- İşçinin "sunucu açık" sözüne güvenme; preview sunucuları tur/oturum bitince kapanır — Mert'e adres vermeden önce `curl` ile ölç.
- Kilit adı "rol/oturum" biçiminde olmalı (`koordinator/<kısa-id>`); yanlış biçimde `take` reddedilir ve ardından gelen push guard'a takılır (audit'te `push-main-blocked`).
- İncelemeci alt ajan başkasının worktree'sinde checkout yapmasın (nf-guvenlik hafızası `36e9b389`).
- CI ızgara bütçesi (`schedule_grid_read_budget` 50 ms) yük altında düşebiliyor (56,9 ms; boşta ~22 ms) — yalnız düşen işi boşta yeniden koştur; tekrar ederse backlog.
- MCP `apply_migration` kaydı kendi saatiyle açar; sürümü repo adıyla `update supabase_migrations.schema_migrations set version=…` düzelt, `md5(statements[1])` = dosya md5 ile kanıtla.
- Önceki devirlerin dersleri: `git show d880d36a:docs/plan/HANDOFF.md`.
