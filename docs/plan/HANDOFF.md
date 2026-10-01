# Koordinatör devri — 2026-10-01 öğlen (kullanıcı PC başında DEĞİL)

Devreden: "Koordinatör" (`local_2464b099-317e-437f-ac12-5a506804d03d`); bağlam ~%63, iş sınırında (FB-6.3.3–.4 canlıda ve main'de) devrediyor; kullanıcı "bu gönderimden sonra devret" dedi.
Devralan: havuzdan "(59)" `local_199f5c39-3dc3-442a-9870-aa3b80d35890` (worktree `intelligent-bartik-b0e305`) — **güncel koordinatör kimliği, devralan oturumun kendi `local_` kimliğidir**; ilk iş onu kayıt oturumuna BESLEME ile bildirmek.
**Kullanıcı yok (2026-10-01 ~10:30 yerel saat):** "ben burda pc başında olmayacam. sen yönet ilerlemeyi. geldiğimde neler yapıldığının raporunu alırım." → hafıza `user-away-mode`: ürün kararlarını KARARLAR/ILKELER birebir kapsıyorsa sen verirsin (CLAUDE.md §13), her kararı KOORDINATOR-KARARLARI'na yazarsın (Mert: onaysız); kapsamıyorsa PARK. Geri alınamaz, canlı (hosted) DDL, ücretli iş, silme PARK — yeni canlı gönderim için onay YOK (FB-6.3.2 ve .3–.4 onayları kullanıldı, bitti).

## 0. Temel gerçekler (oku)
1. **Main her gönderimde CANLIYA çıkıyor** (Vercel `mert-2a14/newfork-clean-api`; `www.tepebash.com`). Web/API kodu main'e girince canlıdadır.
2. **OPS-03:** alan EKLEYEN migration önce canlı → ortak yerel DB → main; alan SİLEN iş tersine (önce main, sonra canlı). Canlı her gönderim kullanıcı onayı ister (yokken park).
3. **Canlı gönderim yolu (onay varsa):** yedek (değişen fonksiyonların md5 + ACL, canlı = yerel mi) → `apply_migration` (büyük dosyayı alt ajana dar talimatla verdim; bağlam korunur) → `schema_migrations.version`'ı dosya adına eşle → 34 fonksiyonluk md5 özeti canlı = yerel (bkz. `newfork-wt/coord/artifacts/coord/fb-6.3/`) → `get_advisors security`. Hafıza: `hosted-migration-push-via-mcp`.
4. **Main'e almada ortak yerel DB'ye uygula** (`lock.mjs take db` ayrı adım → `npx supabase migration up --local`). Kilitler ayrı adımda alınır (BL-500 düzeldi, ama tarif yine ayrı adım).
5. **Worktree silmeden önce `git status --porcelain --ignored`** (git dışı rapor varsa `newfork-wt/coord/artifacts/archive-<tarih>/<worktree>/`'a kopyala). Arşiv worktree'yi her zaman silmiyor: sonra `git worktree list`; uzun yolda `Remove-Item -LiteralPath '\\?\…'` + `git worktree prune`.
6. **Havuz:** "Bekle: handoff raporu gelene kadar idle (NN)" oturumları boş rol oturumudur (kullanıcı açtı). Kullanıcıdan oturum isteme, `list_sessions` ile bak. Haiku/low gelirler → rol için Opus 5.5 + high/xhigh'a al, başlık "Rol: <rol> (<uzmanlık>)", sabitle, ilk mesajdan sonra RC aç. (55) ve (51)–(54) eski worktree yollarını taşıyor; (60)–(70) kullan. Kullanılanlar: (56) arşiv, (57) nf-db, (58) kayıt, (59) sen, (63) eski kayıt arşiv.
7. **Posta kutusu:** `node scripts/inbox.mjs claim` (ilk iş), arka planda `inbox.mjs wait` (her uyanışta yeniden başlat; `&` ile değil `run_in_background`). Okunan rapor `ack`; incelemeci `new/` yolundan okuyacaksa incelemeden sonra ack.
8. **Haftalık kullanım limiti iş erteleme gerekçesi değil.**

## 1. İlk işler (sırayla)
1. `get_session self`: başlık "Koordinatör", sabitle, RC aç.
2. `inbox.mjs claim` + `wait` (arka plan).
3. BESLEME kayıt oturumuna: yeni koordinatör kimliği, bu HANDOFF'un sha'sı. Kayıt oturumu `local_b0d3be14-ac1f-4e67-9866-25f4f38c37cb` (bağlam ~%45 → #44'ü işleyince devredecek; yenisini havuzdan sen kurarsın, bkz. §0.6; rol ataması metni için eski koordinatör mesajını örnek al: rol dosyası, CLAUDE.md, ILERLEME §0d, "DEVRALDIM" ile başla).
4. Rollere yeni adres (tek satır): nf-db `local_6b0b5907-1f99-40ca-86c8-78124bb75ce4`, nf-backend `local_44c01eca-fa54-4179-8629-1d99a49b013d` (bağlam %40 → `.5` YENİ nf-backend oturumunda), nf-arayuz `local_0038c687-1790-4cc8-9238-7d12778fa31f`, nf-test `local_17d5b65d-25bc-435f-9d86-677996a391f2`, nf-guvenlik `local_7dfbe7d3-cdef-4231-afd7-2fa7d53fcd75` (incelemeleri alt ajanla yaptım; bu oturum boşta), nf-gorsel-qa `local_2a24338f-ba49-4311-acbe-4f916b5ae06d`.
5. Eski koordinatör `local_2464b099…`'yu kullanıcı dönünce arşivlemeyi sor (kullanıcı yok: sorma, rapora yaz).

## 2. Aktif iş: FB-6.3 (izin oylaması) — `docs/plan/tasks/FB-6.3.md`
- `.0`–`.4` BİTTİ: `.2` (`20261003030000`) ve `.3`+`.4` (`20261003031000`, `20261003032000`) CANLIDA ve MAIN'de; 34 fonksiyon md5 canlı = yerel (özet `555e7dbb…`); `authz_actions` 77; cron `time-off-deadlines` `*/5`; 4 bildirim tipi; advisors değişmedi. nf-guvenlik: ONAY @d26807ed (.2), ONAY @4babd255 (.3–.4, iki düzeltme turundan sonra). İnceleme kayıtları: `newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` (3. incelemenin bulguları aşağıda), yedekler aynı klasörde.
- **İlk kontrol (devralınca):** canlıda `select status, start_time, return_message from cron.job_run_details d join cron.job j using (jobid) where j.jobname='time-off-deadlines' order by start_time desc limit 3` → `succeeded` olmalı. Hata varsa nf-db'ye (sweep alt-transaction'lı; uyarı satırı Postgres günlüğünde).
- **Sıradaki:**
  1. **Küçük ek migration (nf-db, `local_6b0b5907…`, bağlam ~%57):** 3. incelemenin iki düşük bulgusu — (D1, koordinatör kararı, dayanak: kullanıcının 2026-10-01 "geçici kısıtta admin/owner'a düşsün" kuralı + "hatırlatma karar vermemiş lokasyonun karar verenlerine"): `unattended` lokasyonda 12 saat hatırlatması admin/owner'a gitsin (`…032000…sql:311-321`); (D2) admin/owner bildirim metni "No manager … is left" belge gecikmesinde yanlış (`:319`) → "No manager can decide this now". Yeni migration (`20261003033000_…`, yalnız yeniden tanım). Canlıya gönderimi KULLANICI ONAYI ister → main'e de giremez (OPS-03: canlı önce). Kullanıcı yokken: dalda hazırla, incelet, PARK et. Alternatif: `.5` main'e girmeden önce bu ek gerekmez (`.5` bu iki davranışa bağlı değil).
  2. **`.5` — API + shared + web veri katmanı (YENİ nf-backend oturumu, havuzdan):** sözleşme nf-db raporunda: `.newfork-inbox/done/20261001T091038-nf-db-fb-6-3-fb-6-3-3-4.md` §"Sözleşme" (+ düzeltme raporları `done/…fix2.md`, `…fix3.md`). Kapsam: yeni servislere uçlar (`submit`, `cancellation`, `decide`/verdict, `revoke`), okumalarda `progress`, `decide_by`, `display_status`; eski uçlar `.7`'ye kadar kalır; BL-496'nın KOD kısmı (shared `departmentSchema`/`jobSchema`/`scheduleReferenceSchema` bölünmesi, web `organization-data.ts:352,359`, fikstürler — KK-69); yayın notunun veri kısmı (KK-71); TS ikizi hazır (nf-backend `429f6d00`); `service_role` yeni tabloları okuyamaz → yalnız SECURITY DEFINER servisleri. R3 (yetki) → nf-guvenlik zorunlu. Kod main'e girince CANLIDA (Vercel) — DB zaten canlıda, onay gerekmez (kod gönderimi, hosted DDL değil).
  3. `.6` ekranlar (nf-arayuz → nf-gorsel-qa): ilerleme paneli için DEV'de 2–3 varyant → KULLANICI SEÇER (P04; yokken park, varyantları hazırla).
  4. `.7` silmeler (önce main, sonra canlı — canlı kısmı onay ister), `.8` e2e, `.9` kapanış.
- Kullanıcıya bildirilecek görünür değişiklik (rapora): eski izin ekranında, lokasyonda manager varsa admin/owner artık "New time-off request" almıyor; kapanınca manager'lara `requests.time_off.decided` gidiyor.

## 3. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt) | `local_b0d3be14-ac1f-4e67-9866-25f4f38c37cb` | #43'e kadar yazdı; #44 (bu devir + FB-6.3.3–.4 canlı/main) senden; ~%45 → sonra devir |
| Rol: nf-db | `local_6b0b5907-1f99-40ca-86c8-78124bb75ce4` | FB-6.3.1–.4 bitti; boşta; ~%57 → bir tur küçük iş, sonra yeni oturum |
| Rol: nf-backend | `local_44c01eca-…` | matris işi bitti (`429f6d00`, main'de kopyası); ~%40 → `.5` yeni oturumda |
| Rol: nf-arayuz / nf-test / nf-guvenlik / nf-gorsel-qa | `local_0038c687-…` / `local_17d5b65d-…` / `local_7dfbe7d3-…` / `local_2a24338f-…` | boşta. nf-gorsel-qa'nın git dışı kanıtları `musing-swartz-912e20/artifacts/nf-gorsel-qa/` — arşivden önce kopyala (BL-505) |
| Eski koordinatör | `local_2464b099-…` | devretti; arşiv kullanıcı dönünce |
| Kullanıcının oturumları | "Opus 5.5 karar verme…", "Slash komutları…", "Dev sunucusu başlat", "Bana Newfork-Clean E Bagli 30 Tane Boş Session Aç" | dokunma |

## 4. Bu devirde biten (2026-10-01)
- BL-498 (Schedule çakışma uyarısı arşivli tip adı), BL-500 (gönderim koruması `&&` ile alınan kilit) — main `9444a0d5`.
- KARAR-001 (ILKELER, CLAUDE.md §13, karar günlüğü) main `32dbbd05`; OPS-04 ve KK başlığı §13'e uyduruldu. Açık (kullanıcıda): `decision-log.mjs` kancasının `.claude/settings.json`'a eklenmesi.
- FB-6.3 `.0`–`.4` (yukarıda). Kullanıcı kararları: owner belge kısıtlarından her zaman muaf; geçici belge kısıtındaki manager'ın lokasyonu düşmez → admin/owner. Koordinatör kararları KK-69 (BL-496 kod `.5`/DB `.7`), KK-70 (kalan lokasyonların hepsi onaylıysa sistem onaylar; kullanıcı senaryoyu sordu, itiraz yok), KK-71 (yayın notu `.5`/`.6`).
- Oturum temizliği: eski koordinatörler (2), eski kayıt (2), eski nf-db (2) arşivlendi; worktree ve dalları silindi (yedek ref'ler `refs/nf-backup/`).

## 5. Dersler (bu devir)
- Kullanıcıdan bir şey istemeden önce var mı diye ölç (havuz doluydu, iki kez boşuna oturum istedim).
- Worktree silmeden önce `--ignored` (eski nf-db'nin git dışı raporları — varsa — kayboldu).
- İlk dokunuşta GateGuard reddi: aynı dosyaya iki düzenleme paralel gitmez; ilki tek başına.
- İnceleme turları gerçek bulgu getirdi (3 tur, 1 yüksek + 3 orta + bir yeni yüksek): R3 işte düzeltme sonrası yeniden inceleme ATLANMAZ.
- Büyük migration'ı MCP'ye kendin yapıştırma: dar talimatlı alt ajan + md5 özeti ile doğrula.
- Önceki devirlerin dersleri: `git show b25ee449:docs/plan/HANDOFF.md`, `git show f8c1d5fe:docs/plan/HANDOFF.md`.
