# DEVIR — EKRAN-02 (Requests sahibi oturum)

Yazıldı: 2026-10-08, DUR sırasında. Kod, test, push, canlı işlem yapılmadı; yalnız okuma.

## 1. Kimlik
- Oturum: Requests (EKRAN-02) sahip oturumu. Claude Desktop başlangıç klasörü `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\serene-kowalevski-77ef8a` (burada iş yapılmadı). local_ kimliğimi kendim okuyamıyorum; koordinatörün oturum listesinde bu klasörle eşleşen oturum.
- Çalıştığım worktree'ler ve dallar (hiçbiri origin'de değil, push edilmedi; main = `9f287986`):

| Worktree (tam yol) | Dal | Son sha | Main'de mi (`git cherry -v origin/main <dal>`) |
|---|---|---|---|
| `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-pkg` | `task/ekran-02-data` | `81a9e776` | Evet, 23 commit'in 23'ü main'de (tren-2, `fc8ff021..9f287986`) |
| `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-c2r` | `task/ekran-02-c2r` | `8ef7b05a` | Hayır: 42 commit main'de yok (27 tek tablo + 14 C2 + 1 rapor) |
| `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02` | `task/ekran-02` | `10f702e4` | Hayır: 27 commit (tek tablonun eski hâli; c2r'nin içinde yeniden var) |
| (worktree'siz) | `task/ekran-02-c2` | `de435630` | Hayır: 43 commit (C2'nin paketin eski kopyası üstündeki hâli; c2r onun yerine geçti) |

## 2. Hedef
- Requests ekranı (EKRAN-02) uçtan uca. Ekran dosyası: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-c2r\docs\plan\ekranlar\02-requests\EKRAN.md`; uygulama raporları `...\docs\plan\ekranlar\02-requests\uygulama\` (`PAKET.md`, `C2.md`).
- Bu pencerede üç iş: (a) veri paketini canlıya uygulamak ve tren-2 ile main'e sokmak (bitti), (b) silen migration `20261008111800`'ü main CI yeşil olunca canlıya uygulamak (bekliyor), (c) EKRAN-02-CI: tren-2'den sonra main CI'ın kırmızı olmasının kökünü bulmak (yarım).

## 3. Biten
- **Main'de:** veri paketi, `task/ekran-02-data` @ `81a9e776` → tren-2 (`fc8ff021..9f287986`).
- **Canlıda (hvyvyisrqyathtliyyyv), ledger sürümü = dosya adı:** `20261008110559_one_eligibility_engine`, `20261008111049_shift_exchanges_ask_the_core`, `20261008111454_time_off_rules_and_reads`, `20261008111650_requests_closed_reads_one_list`, `20261008111751_rejection_reason_reaches_only_the_applicant`. Her biri için dosya md5 = ledger md5, fonksiyon md5 = beklenen, `get_advisors` yeni bulgu yok, bağımsız SELECT tamam (ayrıntı `PAKET.md` "Ek 2026-10-08 öğle").
- **Dalda hazır, inceleme ONAY'lı:** C2 (`task/ekran-02-c2r`), nf-guvenlik `ONAY @4903f87f` koşullu (bkz. 4).

## 4. Açık kalan
1. **EKRAN-02-CI (main kırmızısı) — kök bulunmadı.**
   - Belirti: tren-2 sonrası main CI (run 37777039059 ve yeniden koşusu) kırmızı. Testler arası karşılaştırma (tren-1 run 37763019506 ile): shift-hub-swap 14.8→24–31 sn, shift-hub-time-off 11→46–51 sn, sign-in-lands 1–3→4–7 sn, time-off-approval.spec.ts:91 13.8 sn→zaman aşımı, :124 bir koşuda 1.2 dk ile düştü; diğer 40 test aynı hız. Yorum: shift-hub-swap'ten başlayan 2–3 dakikalık bir "yavaş pencere"; ilgisiz sign-in testini de yavaşlatıyor → testin kendisinden çok veritabanında bir şeyin (kilit ya da arka plan işi) beklettiği izlenimi.
   - Koordinatörün ek kanıtı (BL-974 dal CI'ı 37780828448): `e2e\flows\shift-hub-time-off.spec.ts` ~74. satırda müdür "Confirm transfer to Ali"ya bastıktan sonra `schedule_published_shifts` satırı 30 sn boyunca "Emre" kalıyor → onay ya hiç vardiyayı yazmıyor ya da çok geç yazıyor.
   - Elenenler (yerelde ölçüldü): `app_private.time_off_sweep` (0.2–0.5 sn, mantığı değişmedi), `shift_exchange_notification_allowed` (93 çağrı 66 ms), Requests okumaları (5–72 ms).
   - Sıradaki somut adım: (i) `shift_exchanges_command_service` onay yolunu yerel DB'de geri alınan bir transaction'da adım adım zamanla (önizleme → `for update` satır kilitleri → `app_private.shorten_time_off` → `record_weekly_exchange_acceptance` → `schedule_published_shifts` update; bu update'in tetikleyicisi `guard_schedule_assignment_availability` `availability_lock_workspace` alır → `shift_exchange_reconcile_batch`). Hata mı veriyor, kilit mi bekliyor? `pg_locks` / `pg_stat_activity.wait_event` ile bak. Aday: `time_off_sweep` her bekleyen talebin workspace'i için `availability_lock_workspace`'i geçiş sonuna kadar tutuyor; outbox işçisi (`apps\api\src\notifications\notification-outbox-worker.ts`) `shift_exchanges_maintain_service` içinde advisory lock 921 alıyor; pg_cron her dakika ve 5 dakikada bir çalışıyor. (ii) Olmazsa tam e2e'yi `pg_stat_statements.track=all` ile koş: hazır betik `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-pkg\artifacts\ekran-02-ci\measure.sh` (CI boşalmasını, db+heavy kilidini bekler, sonuçları `top-total.txt` / `top-mean.txt`'ye yazar, kilitleri bırakır). Hiç koşmadı (DUR'da kapıda bekliyordu, durduruldu).
   - Bitti ölçütü (koordinatör): kod kusuruysa kırmızı test → düzeltme → tam kapı + `test:db` + 4 e2e (time-off-approval, shift-hub-swap, shift-hub-time-off, schedule-publish-approved-exchange) db+heavy kilidiyle → `inbox status "EKRAN-02-CI" "TREN-HAZIR <dal> @<sha>"`. Zaman aşımını uzatmak çözüm değil. Kök CI ortamındaysa kanıtıyla yazılır. Tahmin: kök bulmak 1–2 saat, düzeltme + kapı + e2e 1–2 saat.
2. **`20261008111800` (silen) canlıya** — main CI yeşil olunca. Adımlar: yedek hazır (aşağıda) → MCP `apply_migration` → ledger satırını önce yedekle, sonra sürümü dosya adına eşle (OPS-05 eki) → dosya md5 = ledger md5 (`62e92f77…`), `get_advisors`, bağımsız SELECT (altı fonksiyon yok, cron `time_off_sweep` başarılı). Tahmin: 30 dk.
3. **C2 (`task/ekran-02-c2r` @ `8ef7b05a`)** — nf-guvenlik koşulları: `supabase\schema.sql` yeniden üretilmeli (`pnpm.cmd db:schema`; şu an paketin şeması duruyor, C2 migration'ı `20261008111900_swap_review_measures_the_rule_that_holds.sql` şemaya işlenmedi) → tam kapı + `test:db` + Requests e2e (`requests-swap-review` dahil). Sonra tek tabloyla birlikte Mert'in sabah bakışını bekler (S2, G13). Tahmin: 1–1.5 saat (kilitli koşular dahil).

## 5. Karar ya da izin bekleyen
- **Koordinatör:** 111800 için §5.1 "gönder" verildi, ama koşulu (main CI yeşil) sağlanmadı → bekliyor. Main kırmızı kalırsa önce EKRAN-02-CI.
- **Mert:** tek tablo + C2 görünüm bakışı (sabah, S2 / G13). Soru: Requests'in tek tablo düzeni ve takas incelemesindeki ölçüm kutusu (C2) olduğu gibi kabul mü? Bu cevap gelmeden c2r trene girmez.
- nf-guvenlik'in düşük bulguları (C2.md'de): kural tutsa da dinlenme açığı dakikası gösteriliyor (muhtemelen kapsam dışı lokasyon, yalnız dakika); bayat pencere eski metni tutuyor (sunucu PT409 veriyor); yol kutusu ölçülen dakikayı göstermiyor. Karar: düzeltilsin mi / backlog'a mı.

## 6. İnceleme bekleyen dosyalar
- `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-c2r\docs\plan\ekranlar\02-requests\uygulama\C2.md` — C2 raporu + "Ek 2026-10-08: paketin canlı hâli üstüne yeniden kuruldu" (koordinatör okumalı).
- `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-pkg\docs\plan\ekranlar\02-requests\uygulama\PAKET.md` — paket raporu (main'de).
- Tek tablo ve C2 ekran görüntüleri önceki pencerelerde `artifacts\ekran-02\` altına alındı (Mert'in sabah bakışı için); yeni artifact linki bu pencerede üretilmedi.

## 7. Canlı ve yerel veritabanı
- **Canlıda olup main'de olmayan migration: yok.** Canlıdaki beş paket migration'ı main'de, aynı numara ve aynı md5 ile.
- **Silen migration bekliyor:** `20261008111800_retire_what_the_package_replaced.sql` (main'de var, canlıda yok). Siler: `public.weekly_exchange_candidate_check(uuid,uuid,jsonb,uuid[])`, `weekly_assignment_candidate_check(uuid,uuid,jsonb,uuid[],integer)`, `weekly_assignment_candidate_base(uuid,uuid,jsonb,uuid[],integer)`, `schedule_actor_can_manage_service(uuid,uuid,uuid)`, `schedule_actor_can_publish_service(uuid,uuid,uuid)`, `schedule_actor_has_capability_service(uuid,uuid,text,uuid)`. Yedek: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-pkg\artifacts\ekran-02\pkg\live-backup\retire-111800-backup-2026-10-08.sql` (altı tanım + üç schedule_actor_* için service_role grant'ı; canlı md5'ler yeniden ölçüldü, değişmemiş; dış çağıran yok).
- Diğer canlı yedekler aynı klasörde: `functions-before.sql`, `live-md5.txt`, `expected-md5.txt`, `live-data-backup-2026-10-08T105759Z.md`.
- **Yerel ortak DB** (`supabase_db_newfork-clean`): paketin altı migration'ı (111800 dahil) koordinatörün treninde uygulandı. Benim kalıcı uyguladığım başka şey yok. C2 migration'ı (`111900`) yerelde yok. `pg_stat_statements.track` ayarına dokunulmadı (ölçüm betiği koşmadı).

## 8. Bilinmesi gereken (kayıtta olmayan)
- **MCP `apply_migration` ledger sürümünü uygulama anı yapar**, dosya önekini değil; uygulamadan sonra dosya adı ledger'a göre yeniden adlandırıldı (paket böyle yapıldı). 111800 için koordinatör "ledger satırını dosya adına eşle" dedi → bu sefer ters yön: ledger satırının `version`'ını `20261008111800` yap, önce satırı yedekle.
- Beş paket dosyasının son satırındaki yorum hâlâ eski numarayı ("020500") anıyor; 111800'ün başlığı bunu açıklıyor. Bilerek bırakıldı (dosya içeriği değişirse md5 ledger'la tutmaz).
- `artifacts\ekran-02\pkg\live-backup\expected.py` ve `heavy-run.sh` eski dosya adlarını (`20261008020000…`) kullanıyor; yeniden koşulacaksa adlar güncellenmeli.
- EKRAN-02-CI'da tren-2'nin tek kod değişikliği veri paketi (+ `packages\shared` authorization/matrix). Paket `shift_exchanges_maintain_service`'i ve `time_off_sweep`'in kilit davranışını değiştirmedi (yalnız failures tablosu + pass_limit eklendi). Yani yavaşlık büyük ihtimalle yeni `app_private.eligibility` çekirdeği ya da onay yolunda yeni eklenen adımlardan (shorten_time_off, recheck preview) geliyor; yerel küçük dünyada okumalar hızlı, bu yüzden yerel tek-sorgu ölçümü yavaşlığı göstermedi → eşzamanlılık (cron + işçi + test aynı anda) şüphesi.
- CI artefaktı/trace indirilmedi (dosya indirme Mert'in "evet"ine bağlı, §5.3); kanıt yalnız `gh run view` süreleri.
- Test sırası alfabetik, `workers: 1`; CI her koşuda taze Supabase kurar (cron'lar orada da çalışıyor).

## 9. Temizlik
- Açık süreç yok (ölçüm betiği ve artığı PID 9305 / 14037 durduruldu, doğrulandı). Kilit yok.
- `task/ekran-02-data` + `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-pkg`: dal main'de, silinebilir — ama worktree'nin `artifacts\` klasöründe canlı yedekler ve bu not var (gitignore'da); silmeden önce `artifacts\ekran-02\pkg\live-backup\` ve `artifacts\devir\` taşınmalı. 111800 uygulanana kadar yedek gerekli.
- `task/ekran-02-c2` (`de435630`) ve `task/ekran-02` (`10f702e4`) + `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02`: c2r tarafından geçildi; main'de değiller. Mert'in sabah bakışı c2r ile bitip c2r main'e girince silinmeli (önce `git cherry` ile c2r'de karşılıkları olduğu doğrulanmalı).
- Alt ajanın geçici worktree'si `C:\Users\TheWe\AppData\Local\Temp\claude\c2r-wt` (detached `4903f87f`, temiz): silinebilir, benim silme iznim reddedildi, koordinatöre bildirilmişti.
- `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-02-main` (detached `6b24dbb1`) ve `...\ekran-02-c3` (`task/arayuz-salt-hata`) benim değil / bu pencerede kullanmadım.

## 10. Bağlam ve öneri
- Bağlam: bir kez sıkıştırıldı; şu an tahminen %30–35.
- Öneri: devralan oturum önce EKRAN-02-CI'ı, `shift-hub-time-off` onayını yerel DB'de geri alınan transaction'da `pg_locks` ile adım adım zamanlayarak kapatsın; main yeşil olmadan 111800'e ve c2r'ye dokunmasın.
