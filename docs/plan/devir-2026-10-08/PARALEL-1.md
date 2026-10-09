<!-- from: oturum/paralel-1 | task: DEVIR-PARALEL-1 | at: 2026-10-08T22:29:51.478Z -->
# DEVIR — PARALEL-1 (oturum/paralel-1; işler: TREN-ARACI, BL-987 + BL-988, BL-965, OTOMASYON-5)

Yazıldı: 2026-10-08 ~15:30Z. Ölçümler bu saatte yapıldı; origin/main = `9f287986`.

## 1. Kimlik
- **Oturum:** PARALEL-1 oturumu.
  - Koordinatöre yazarken `from` kimliği `local_70128f8f-5bc3-4776-92cf-1fe096aa4404` (iki "Koordinatör" adlı oturum vardı).
  - Oturumun kendi klasörü: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\zealous-diffie-ec31cb`. Dalı `claude/nice-joliot-4b346e` @`d57be38c`; kendine ait commit yok, uzakta yok.
- **İş klasörleri ve dallar:**

| Dal | Yerel | Uzak | Main'de mi (`git cherry -v origin/main <dal>`) | Klasör |
|---|---|---|---|---|
| `task/tren-araci` | `55fb876b` | `494ffd82` (eski görev dosyası, rebase öncesi) | hayır: 8 commit `+` | `C:\Users\TheWe\Documents\Codex\newfork-wt\tren-araci` (temiz) |
| `task/tren-araci-2` | — | `55fb876b` | hayır: aynı 8 commit `+` | — |
| `task/bl-987` | `77b8120b` | **yok, hiç gönderilmedi** | hayır: tren 8 + kendi 3 commit `+` | `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-987` (temiz) |
| `task/bl-965-sonuc` | — | `1f6a69c6` | **evet**: `-`, main'de `6440a109` | — |
| `task/bl-965` | `1f6a69c6` | `affccbad` | yerel `-`; uzaktaki `53f1a952` `+` ama eski yaklaşım (aşağıda §9) | `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-965` (temiz) |
| `task/bl-965-2` | — | `a06f2806` | evet, hepsi `-` | — |
| `task/bl-965-3` | — | `2992af06` | evet, cherry boş | — |
| `task/bl-757` | — | `fc1870dd` | içerik main'de daha yeni hâliyle (`9db64c83`) | — |

## 2. Hedef
- **TREN-ARACI:** koordinatörün gönderim treni tek komut olsun: `node scripts/train.mjs plan / build / apply-local / gate / push`.
- **BL-987:** guard, oturumun main push'unu "tren dışı" saysın (14 Ekim'e kadar uyarı, sonra engel).
- **BL-988:** heavy.lock 30 dakikayı geçince UZUN satırı çıksın.
- **BL-965:** belge bakım işi tarihsiz onaylı belgede çökmesin.
- **OTOMASYON-5:** yeni düzende (tren yok) oturumun gönderimi tek komut olsun (`/gonder`, `scripts/ship.mjs`). Guard yerel e2e damgası yerine dal CI'ına baksın. Koordinatöre hatırlatma kancası eklensin.

## 3. Biten
- **BL-965:** canlıda ve main'de; main CI 37752170438 yeşil.
  - Göç main'de `be7a389a`: `C:\Users\TheWe\Documents\Codex\newfork-clean\supabase\migrations\20261008022536_document_maintenance_keeps_going.sql`. Dosya md5 `ddfd8bb957f47f88a7be1dab5fcad7b8`; canlı fonksiyon tanımının md5'i `ed9d6796ae4a9e2db2615a4a13d54ffc`.
  - Sonuç notu main'de `6440a109`. Yerel DB'de de uygulanmış (ledger `20261008022536`).
- **TREN-ARACI:** dalda hazır; `nf-guvenlik` ONAY @`a1d24446`, son uç `55fb876b`. Betik testleri 141/141.
  - **Yeni karar (tren kalktı) yüzünden main'e girmeyecek.**
- **BL-987 + BL-988:** dalda hazır, yalnız yerelde; `nf-guvenlik` ONAY @`0ef949a6`, son uç `77b8120b`. 146/146 betik testi, lint ve typecheck yeşil.
  - **BL-987'nin engel kuralı yeni karara ters, main'e girmeyecek.** BL-988 kısmı işe yarar (§4).

## 4. Açık kalan
- **OTOMASYON-5: başlamadı.** Yalnız anlama adımı yapıldı: dört başlık koordinatöre gitti, koordinatör işi beklemeye aldı. Dal ve klasör açılmadı. Anlama notu aşağıda §5'te aynen.
- **Yeni dala taşınması iyi olacak iki parça** (OTOMASYON-5 ya da ayrı küçük iş, ~30 dk):
  1. **UZUN satırı:** `longLockLines()` main.lock ve heavy.lock 30 dk'yı geçince `UZUN: <ad>.lock <n> dk, sahibi …` satırı basar; `lock.mjs status` ve `inbox.mjs board` kullanır. Kaynak: `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-987\scripts\lock.mjs` satır 18-20 ve 148-153, testleri aynı klasörde `scripts\lock.test.mjs`. Main'deki lock.mjs'te yok; elle taşınmalı (cherry-pick tren commit'lerini de çeker).
  2. **Kilit tutulurken de NF_OVERRIDE yedeği:** BL-987'de NF_OVERRIDE kilit tutulurken de önce `refs/nf-backup/main/` yedeği alıyor, kayda `chained` yazıyor. Main'de yalnız kilit yok ya da bayatken çalışıyor. Yeni düzende de yararlı.
- **Sıradaki adım:** yeni koordinatör OTOMASYON-5 kapsamını yeniden kararlaştırınca, güncel origin/main'den `task/otomasyon-5`.

## 5. Karar ya da izin bekleyen
- **Kimden:** yeni koordinatör ve Mert. OTOMASYON-5 anlama notu, koordinatöre giden metin:
  - **Eksik ya da yanlış olabilecek:**
    1. **Dal push'u ve force yasağı:** `branch` önce rebase edip aynı adla iterse, daha önce uzağa gitmiş dalda push fast-forward olmaz; force yasak. BL-965'te bu yüzden `-sonuc`, `-2` adları açıldı.
    2. **Patch-id'nin iki sınırı:**
       - Main'de değişikliğin komşu satırları değişirse patch-id de değişir; o zaman dal CI'ı yeniden koşmalı.
       - Patch-id aynı olsa da değişiklik yeni main'le birlikte hiç test edilmemiş olur. Bunu main CI yakalar, geri alma kuralı devreye girer.
    3. **"Aynı bilinen test" test düzeyinde ölçülmeli** (job düzeyi başka bir e2e kırmızısını da geçirir).
       - Kaynak `gh run view <id> --log-failed`: Playwright `✘ e2e/flows/<dosya> › <başlık>`, pgTAP `not ok`, vitest `FAIL`.
       - Ayıklanamazsa izin yok.
       - Ölçüm: main'in son kırmızısında (CI 37777039059, `9f287986`) ve `task/guvenlik-a-ga2`'de (37794571368) tek kırmızı `e2e/flows/time-off-approval.spec.ts:91 › two locations approve in turn, the last one opens the shift, and the employee sees Approved`. shift-hub-* bu koşularda kırmızı değil.
    4. **Docs muafiyeti:** yalnız docs/*.md değiştiren push'ta CI hiç koşmaz (ci.yml `paths-ignore`). Guard ve `ship.mjs main` bunları CI şartından muaf tutmalı; yoksa koordinatörün kayıt commit'leri sertleşme gününden sonra reddedilir.
    5. **`supabase migration up --local` tuzağı:** CLI dosyayı cümle cümle koşar, sıra dışı dosyada `--include-all` ister. Trende bu yüzden `psql -1` + ledger satırı yolu yazıldı (testli).
    6. **e2e damgası kalkınca ölü kod kalır:** `e2e/e2e-pass-reporter.mjs` ve `e2e/playwright.config.ts` satır 76'daki raporcu kimsenin okumadığı `C:\Users\TheWe\Documents\Codex\.newfork-inbox\e2e-pass.jsonl`'a yazmaya devam eder. Bu iki dosya görevin dosya listesinde yoktu. `e2e/CLAUDE.md` ve KARARLAR da damgadan söz ediyor.
    7. **İki ayrı gün:** guard'ın genel uyarı→ret günü 2026-10-14 (`ENFORCE_DAY`); görev CI şartı için 2026-10-15 diyordu.
    8. **Ayar dosyası:** `.claude/settings.json`'a kanca satırını oturum kuralım gereği başka oturumun isteğiyle eklemem. Mert'e bu pencerede sordum, **Mert soruyu kapattı (cevap yok)**. Kanca satırı Mert'in o oturumdaki kendi "evet"iyle eklenmeli.
    9. **Atlanacak mesajlar:** `<cross-session-message`, `gece-modu turu`, `/`; ayrıca `<task-notification`, `<ci-monitor-event`, `<<autonomous-loop` gibi sistem turları.
  - **Sorular** (önerilen ilk):
    1. **Daha önce uzağa gitmiş dal:**
       - (A) uzakta dal varsa `branch` rebase etmeden üstüne iter; main adımı rebase eder ve patch-id ile eşler; patch-id değiştiyse `<dal>-2` adıyla iter.
       - (B) her seferinde yeni ad.
    2. **Yerel kalıcı migration:**
       - (A) trendeki `psql -1` + ledger yolu ship.mjs'e taşınır;
       - (B) `supabase migration up --local --include-all`.
    3. **e2e raporcusu:** raporcu dosyası ve config satırı silinsin mi? (A) evet; (B) kalsın.
    4. **"Bilinen kırmızı" nereden gelsin:**
       - (A) son tamamlanan main CI koşusunun kırmızı testleri;
       - (B) elle tutulan liste.
    5. **Sertleşme günü:** (A) 2026-10-15 ayrı gün; (B) genel 2026-10-14.
  - **Bence:**
    - CI hükmü tek fonksiyonda olsun (`ship.mjs` `ciVerdict`), guard onu içe aktarsın.
    - gh'ye ulaşılamazsa "yeşil değil" sayılsın (uyarı, sonra ret, NF_OVERRIDE kaçışıyla).
    - `ship.mjs` heavy.lock'u yalnız push anında tutsun.
    - `select`, `scripts/` değiştiyse `node --test` listesini de koysun.
    - Kanca ayrı dosya olsun (`scripts/coord-reminder.mjs`), `inbox.mjs`'teki `isCoordinator` yeniden kullanılsın.
    - Elenenler:
      - kırmızıyı job düzeyinde karşılaştırmak (yanlış dalı geçirir);
      - yerel e2e damgasını CI şartının yanında tutmak (karar tam takımı CI'a verdi);
      - guard'da CI'ı yeniden koşturmak (tek runner).
- **Tren, BL-987 ve TREN-ARACI dalları:** rafa mı, silinsin mi? Karar koordinatörün; ben silmedim.

## 6. İnceleme bekleyen artifact ve dosyalar
- İnceleme bekleyen yok (TREN-ARACI ONAY @`a1d24446`, BL-987 ONAY @`0ef949a6`).
- **Saklanması gereken yedek:** BL-965 canlı göçten önceki fonksiyon tanımı, `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-965-artifacts\live-before-20261008010000.sql`. Aynı klasörde pgTAP logları var.
- **Geçici dosyalar** (scratchpad, oturum kapanınca gider): `C:\Users\TheWe\AppData\Local\Temp\claude\C--Users-TheWe-Documents-Codex-newfork-clean--claude-worktrees-zealous-diffie-ec31cb\1c9012e9-c9aa-4dd5-968d-e7ce6f21b3a6\scratchpad\`
  - `date-shift.mjs`: testi 2026-10-15'teymiş gibi koşturur: `node --import <yol>\date-shift.mjs --test …`. Alt süreç açan testler kaydırılmış saati görmez.
  - `bl-965-son.md`, `tren-araci-hazir.md`: gönderilen raporların kopyaları.
  - `guard.bak`, `lock.bak`, `train.mjs.bak*`.

## 7. Yerel DB / kilit / betik durumu
- **Kilitler:** üçü de boş (15:2xZ). Elimde kilit yok.
- **Arka plan:** arkada süreç, sunucu ya da izleyici yok.
- **Yerel DB:** ortak konteyner `supabase_db_newfork-clean`. Ledger'ın sonu `20261008111800 retire_what_the_package_replaced` (EKRAN-02 paketi). BL-965 göçü `20261008022536` uygulanmış. Bu oturum DB'de başka bir şey bırakmadı.
- **Tren klasörü** `C:\Users\TheWe\Documents\Codex\newfork-wt\train`: koordinatörün; temiz, `9f287986`'da, `artifacts\train\` yok.

## 8. Bilinmesi gereken, kayıtta olmayan
**Tren aracı** (`task/tren-araci-2` @`55fb876b`, `C:\Users\TheWe\Documents\Codex\newfork-wt\tren-araci\scripts\train.mjs`):
- **Yapı:**
  - Durum dosyası `<tren>\artifacts\train\state.json`, loglar `artifacts\train\<zaman>\`. Kilit kimliği `koordinator/tren-<zaman>`.
  - Tren klasörü `NEWFORK_TRAIN_DIR` ile değişir.
  - `plan` çıkış kodu: 1 engel / 2 bir dal atlandı / 0 hepsi gider.
- **build:** dalları bellekte kurar: `git merge-tree --write-tree --name-only -z --no-messages --merge-base=<ebeveyn> <uç> <commit>` + `git commit-tree`. Yalnız `schema.sql` çatışırsa geçici index (`GIT_INDEX_FILE`) ile başlık değiştirilir; `schema.sql` sonda bir kez `fingerprint()` ile yeniden hesaplanır.
- **Göç sayımı:** `migrationChanges` eklenen / değişen / silinen göçü dalın `+` commit'lerinden sayar (rebase sonrası sha değil, patch). `stray()` sürümsüz ada göre eler (ledger numarası değişen göç için).
- **apply-local:** `psql -1`, göç + ledger satırı tek işlemde (`statements` = dosyanın tamamı, dolar tırnağı `$nf_train$`). CLI'ın cümle cümle koşması ve `--include-all` ihtiyacı yüzünden.
- **gate ve push:**
  - `gate`: kirli ya da dal ucunda olmayan klasörü reddeder (aşılamaz). Koşu sırasında klasör değişirse kırmızı. db.lock'u bırakır; heavy'yi yalnız yeşilde tutar.
  - `push`: main.lock'u yalnız o an tutar. Yalnız fast-forward (NF_OVERRIDE bunu aşamaz). `gate.head == uç`, heavy ve CI kontrolü yapar; sonra `git push origin <uç>:refs/heads/main`.
- **Bağımlılık:** guard'ın `audit`, `backupMain`, `ciState` ve test-db'nin `container`, `nonTransactional` dışa aktarımlarını kullanır. Bunlar yalnız tren dalında dışa açık; main'de `audit` ve `backupMain` iç fonksiyon.
- **Testler:** 35 test, Windows'ta ~32 sn (git süreç açılışı yavaş; tek dosyada 49 sn, iki dosyaya bölününce 27 sn). Kök `pnpm test` betik süresi trenle ~31 sn uzar.
- **Kullanım ve CI:** gerçek kullanım tren-2'de koordinatör elindeydi. Dalın CI'ı (37784748035) iptal edildi; bu dal için yeşil dal CI'ı yok.

**Guard** (`scripts/guard.mjs`):
- **Zamanlama:** kilidi komut koşmadan önce denetler. Kilidi push'la aynı komutta almak yerine ayrı bir Bash çağrısında al (`takesLockBefore` zinciri tanır ama ayrı çağrı en güvenlisi).
- **Komut metni tuzakları:**
  - Bir betik metninde `HEAD:main` geçerse (ör. `node -e "...HEAD:main..."`) guard onu main push'u sanıp reddedebilir; betiği dosyadan koştur.
  - Kesme işareti içeren `node -e` komutu `chain()` bölmesini şaşırtır (BL-964 bir kısmını kapattı).
- **Tarih:** `ENFORCE_FROM` = 2026-10-14 00:00 +03:00; `flagger` bu günden önce uyarır, sonra reddeder.
  - Tarih bağımlı testler `BEFORE`/`AFTER` sabitleriyle yazılmalı. BL-987 incelemesinin yüksek bulgusu tam buydu: yeni kuralla iki eski BL-760 testi (`coord-hooks.test.mjs`, `warn === null`) 14 Ekim'de kendiliğinden kırmızıya dönecekti. Main'de o kural yok, sorun da yok. Ama guard'a uyarı→ret günü olan her yeni kural (ör. OTOMASYON-5'in CI şartı) aynı tuzağa düşer.
- **Kapalı kalma:** yalnız main push'unda kapalı kalır (guard hata verirse ret, NF_OVERRIDE geçer); diğer her şeyde açık kalır.

**Kilitler** (`scripts/lock.mjs`):
- Kimlik `oturum/iş`; sahiplik `CLAUDE_CODE_SESSION_ID` ile, terminalde cwd ile tanınır.
- 2 saati geçen kendi main.lock'umu guard "bayat" diye reddetti; aynı komutta release + take ile çözüldü.

**Posta kutusu:**
- SendMessage koordinatöre bazen "tutuldu/süresi geçti" oldu; o zaman `inbox.mjs send` raporu yeter.
- `C:\Users\TheWe\Documents\Codex\.newfork-inbox\coordinator.json` hâlâ eski koordinatörü gösteriyor: `session_id f2f4ad49-…`, 2026-10-07 06:08Z. Yeni koordinatör `claim` etmezse koordinatör kancaları (pano, OTOMASYON-5 hatırlatma kancası) yanlış oturuma bakar.

**CI ve dal:**
- Force yasak olduğu için rebase edilmiş, önceden gönderilmiş dal yeni adla gider (`-2`, `-sonuc`). Eski adlar uzakta birikir, temizlik gerekir.
- Dal push'unda CI'ın önceki koşusu iptal olur (`cancel-in-progress`); main'de beklenir.

**Canlı göç** (KK-226): MCP `apply_migration` ledger'a uygulama anının numarasını yazar (UTC+3 civarı). Dosya o numaraya yeniden adlandırılır, ledger'a dokunulmaz.

**Daha önce bildirilen backlog adayı:** `bl052_document_onboarding` #25 yerelde ara ara düşüyor.

## 9. Temizlik
Hiçbirini silmedim (koordinatör: "ben ölçüp silerim").

| Ne | Birleşmiş mi | Öneri |
|---|---|---|
| `task/bl-965-sonuc` (uzak) | evet (`6440a109`) | silinebilir |
| `task/bl-965-2`, `task/bl-965-3` (uzak) | evet | silinebilir |
| `task/bl-965` (yerel `1f6a69c6` + uzak `affccbad`) | yerel evet. Uzaktaki `53f1a952` ayrı göç dosyalı ilk yaklaşım; düzeltmesi main'deki `20261008022536_document_maintenance_keeps_going.sql` içinde (dosyanın 1. maddesi: tarihsiz belgede NULL `days_left`) | silinebilir; klasör `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-965` temiz |
| `task/bl-757` (uzak `fc1870dd`) | içerik main'de daha yeni hâliyle (`9db64c83`) | silinebilir |
| `task/tren-araci` (yerel + uzak), `task/tren-araci-2` (uzak) | hayır, rafta | koordinatör kararı; silinirse guard `refs/nf-backup/` yedeği alır. Klasör `C:\Users\TheWe\Documents\Codex\newfork-wt\tren-araci` temiz |
| `task/bl-987` (yalnız yerel) | hayır, hiç uzağa gitmedi | **silmeden önce** UZUN satırı ve NF_OVERRIDE yedeği parçası yeni dala alınmalı (§4); klasör `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-987` temiz |
| `C:\Users\TheWe\Documents\Codex\newfork-wt\bl-965-artifacts` | — | canlı yedek dosyası içinde; arşive taşınıp saklanmalı |
| Oturum klasörü `...\zealous-diffie-ec31cb` (`claude/nice-joliot-4b346e`) | kendine ait commit yok | oturum kapanınca uygulama temizler |

## 10. Bağlam ve devam önerisi
- **Bağlam:** ~%55 (tahmin; koordinatör ~1 saat önce %51 ölçtü, bir kez sıkıştırıldı).
- **Önerim:**
  - OTOMASYON-5'i yeni koordinatörden yeni bir oturum alsın; bu not ve §5 yeter.
  - Önce dört başlığın sorularına cevap gelsin; en kritikleri 1 (dal adı) ve 3 (bilinen kırmızı test düzeyinde).
  - Benim bilgimi isteyen iş yalnız UZUN satırını taşımak; ~30 dk, bende ya da yeni oturumda.
