# Koordinatör devri — 2026-10-01 gece (kullanıcı uyanık)

Devreden: "Koordinatör" (`local_0ee21aaa-9f24-4054-9a31-f2b30ed80270`); bağlamı %56, iş sınırında (G8b canlıda) devrediyor; kullanıcı "Şimdi devret" dedi.
Devralan: `local_2464b099-317e-437f-ac12-5a506804d03d` ("Koordinatör"; sabitli, Remote Control açık — ölçüldü). Eski `nf-backend` oturumuydu; kullanıcı /clear ile temizleyip koordinatör yaptı (besleme #27). Çalışma klasörü `optimistic-blackburn-f4a88f`. Posta kutusu 2026-10-01T06:40Z'de sahiplenildi (`.newfork-inbox/coordinator.json`, ölçüldü), `wait` arka planda.
Ölçüm anı: `origin/main` = bu commit; altındaki son kod `b8613af0` (G8b); main CI 36816535884 check + db + e2e yeşil. **Canlı veritabanı = main** (son migration `20261003020000`, MCP ile ölçüldü). Ortak yerel DB = main (`20261003020000`). Kilitler boş.

## 0. Temel gerçekler (oku)
1. **Main her gönderimde CANLIYA çıkıyor** (Vercel `mert-2a14/newfork-clean-api`; `https://www.tepebash.com` ve `newfork-clean-api.vercel.app`). `vercel` CLI proje yasak listesinde (`.claude/settings.json`); gerekirse kullanıcıdan bu iş için kaldırmasını iste, iş bitince geri koydur.
2. **OPS-03:** alan EKLEYEN işte önce canlı migration, sonra ortak yerel DB, sonra main. Alan SİLEN işte (BL-496 gibi) sıra ters: önce main (kod alanı okumayı bırakır), sonra canlı DB (§0c satır 5 hâlâ karar bekliyor; KK-43 bu yolu izledi).
3. **Canlı gönderim:** `supabase db push` ve `--linked` ajanlara kapalı (deny). Kullanıcı PC başında değilse ve tek seferlik "Sen gönder, MCP ile" derse: yedek (`execute_sql` ile değişen fonksiyonların tanımı + grant) → `apply_migration` → `schema_migrations.version`'ı repo sürümüne düzelt → her fonksiyonun `md5(prosrc)`'ı ile dosyadaki gövdenin md5'i aynı mı → `get_advisors security`. Onay her gönderim için ayrı alınır. Hafıza: `hosted-migration-push-via-mcp`.
4. **Main'e alma adımında ortak yerel DB'ye uygulamayı UNUTMA** (`node scripts/lock.mjs take db …` → `npx supabase migration up --local`). BL-475'te unutuldu, G8b'den önce düzeltildi.
5. **Gönderim koruması (COORD-CTRL, main `940b6be0`) çalışıyor:** `main.lock` yoksa push'u kanca reddeder. Kilidi push'la AYNI komutta alma; ayrı adımda al (BL-500). Belge gönderimi (yalnız `docs/`, `.claude/agent-memory/`) main CI'ı tetiklemiyor, koşanı iptal etmiyor.
6. **Haftalık kullanım limiti iş erteleme gerekçesi değil** (kullanıcı kararı 2026-10-01; hafıza `weekly-limit-not-a-brake`). Hız ve kalite önce.

## 1. İlk işler (sırayla)
1. `get_session self`: başlığı "Koordinatör" yap, sabitle, Remote Control aç (kullanıcı istedi; açılmazsa söyle).
2. **Posta kutusunu sahiplen:** `node scripts/inbox.mjs claim`, sonra arka planda `node scripts/inbox.mjs wait` (CLAUDE.md §3 el kitabı). Bu oturum kancaları baştan yüklediği için çalışmalı; "hook çalışmadı" derse oturumun `.claude/settings.json`'ı main'deki hâliyle mi bak.
3. **BESLEME #26** kayıt oturumuna (`local_2c32c047-dab0-497c-8e5b-91d51a22e6a3`): yeni koordinatör kimliği; bu HANDOFF'un sha'sı. Kayıt oturumu şu an kullanıcıyla **K10 (onaylı iznin iptalini kim onaylar) için ayrıntılı plan** yapıyor — FB-6.3'ü o plan bitmeden başlatma; plan gelince FB-6.3'ü o planla yürüt.
4. **Rollere yeni adresini bildir** (tek satır): nf-db `local_e9aa34f5-79fc-4de7-a3b5-499d3c4ad843`, nf-backend `local_44c01eca-fa54-4179-8629-1d99a49b013d`, nf-arayuz `local_0038c687-1790-4cc8-9238-7d12778fa31f`, nf-test `local_17d5b65d-25bc-435f-9d86-677996a391f2`, nf-guvenlik `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75`, nf-gorsel-qa `local_2a24338f-ba49-4311-acbe-4f916b5ae06d`, kayıt `local_2c32c047…`.
5. **Sıradaki iş (kullanıcıya sor, tek tık):** FB-6.3 K10 planına bağlı. Bekleyen hızlı işler: BL-498 (örtüşme uyarısında arşivli tip adı boş, `apps/web/src/schedule/schedule-conflicts.ts:389`, tek satır), BL-500 (gönderim koruması aynı komuttaki kilidi görmüyor), BL-496 (kullanılmayan `sort_order` kolonunun silinmesi; ALAN SİLEN iş → önce main sonra canlı; dokunulacak yerler `nf-db` BL-475 raporunda ve BL-496 maddesinde). Önerim: K10 planı gelene kadar bu üçü, sonra FB-6.3.

## 2. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt) | `local_2c32c047-dab0-497c-8e5b-91d51a22e6a3` | kullanıcıyla K10 planı yapıyor; son besleme #25 main'de (`c345ed83`); bağlam ~%52 → devir önermiş, yenisini koordinatör açar (havuz boş: kullanıcı oturum açar) |
| Rol: nf-db | `local_e9aa34f5-…` | BL-475 ve G8b'yi bitirdi; boşta; bağlam ~%47 |
| Rol: nf-backend | `local_44c01eca-…` | G8b web'i bitirdi; boşta; yeni (havuzdan 2026-09-30) |
| Rol: nf-arayuz | `local_0038c687-…` | boşta; bağlam ~%53 → bir sonraki işte yenile |
| Rol: nf-test | `local_17d5b65d-…` | boşta |
| Rol: nf-guvenlik | `local_7dfbe7d3-…` | boşta; bağlam ~%55, açık işi yok → bir sonraki incelemede yeni oturum |
| Rol: nf-gorsel-qa | `local_2a24338f-…` | boşta |
| (eski) Rol: nf-backend — devredildi | `local_2464b099-…` | arşivlenebilir (kullanıcıya sor; sabit ve Remote Control açık — önce ikisini kapat) |
| (eski) Koordinatör — devir 2026-09-30 öğleden sonra | `local_c575161a-…` | arşivlenebilir (kullanıcıya sor) |
| Devreden koordinatör | `local_0ee21aaa-…` | devirden sonra arşivlenebilir |
| "Opus 5.5 karar verme ve sistem tasarımı" | `local_ba5d9903-…` | kullanıcının oturumu, ana klasörde; dokunma |
| Kullanıcının oturumları | "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma; ikincisi rol oturumlarının üst oturumu (arşivlenirse alt oturumları da arşivler) |

Arşivleme: sabitli ya da Remote Control açık oturum arşivlenmez; önce ikisi kapatılır. Git'e girmeyen raporlar arşivden önce `newfork-wt/coord/artifacts/archive-<tarih>/<worktree>/`'a kopyalanır.

## 3. Bu devirde biten (2026-09-30 öğleden sonra → 2026-10-01 gece)
- BL-475: departmanlar ve işler her yerde A→Z, elle taşıma kalktı; Management iki çalışma ekranında (çekmece iş seçicisi, Schedule Job/Position) sonda kalıyor (kullanıcı kararı). Main `1a608c01`, `31d4c67b` ("1 jobs" düzeltmesi).
- `www.tepebash.com` yeni projeye taşındı; `APP_URL` canlıda. **AÇIK (kullanıcıda):** Supabase → Authentication → URL Configuration → Redirect URLs'e `https://www.tepebash.com/**`.
- COORD-CTRL main'de (`940b6be0`).
- G8b (BL-254): arşivli iş/tip adı eski vardiyalarda her yerde. Main `b8613af0`; G8 programı bitti.
- Arşivlendi: eski nf-db `local_8918dfd6…`, eski kayıt `local_021d990c…`.

## 4. Dersler (bu devir)
- **Kanca ve GateGuard:** GateGuard ilk Bash'i, yeni dosya yazımını ve git'i değiştiren komutları önce reddeder; istenen gerçekleri yazıp aynı çağrıyı yinele. COORD-CTRL kancası kilidi komut BAŞLAMADAN arar.
- **Git Bash:** `git show origin/main:.claude/…` yanlış sonuç verir; `export MSYS_NO_PATHCONV=1` ve Windows yolu.
- **Rol "rapor dosyası şurada" derse** dosyanın diskte olduğunu kontrol et (nf-guvenlik iki kez erken bildirdi; hafızasına not eklendi `f8da5ce7`).
- **Eski dala yeni commit:** rol, main'e alınmış dala commit eklerse (BL-475 "1 jobs") cherry-pick ile al; role "dal bitti, yeni işi main'den aç" de.
- Önceki devirlerin dersleri: `git show f8c1d5fe:docs/plan/HANDOFF.md`, `git show a98b0671:docs/plan/HANDOFF.md`.
