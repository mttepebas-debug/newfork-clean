# Koordinatör devri — 2026-10-07 (gece modu açık)

- **Oturum (2026-10-07 06:08Z devir):** "Koordinatör" `local_70128f8f-5bc3-4776-92cf-1fe096aa4404` (posta kutusu `f2f4ad49-6b1b-4db6-a445-4198729b2a0f`, `inbox.mjs claim` yapıldı). Eski koordinatör `local_9c7e674a…` / `53bf53b1…` devredildi. Mert bu pencerede `/compact` ya da `/clear` yazar; kimlik DEĞİŞMEZ.
- **Önce oku:** `CLAUDE.md` (2026-10-07: tek tip oturum, rol oturumu yok; alt ajan yalnız `nf-guvenlik`, `nf-okur`; klasör kuralları `apps/api`, `apps/web`, `supabase`, `e2e` altındaki `CLAUDE.md`'lerde), `docs/plan/EKRAN-PLANI.md` ("Bir ekranın turu": ekran tek sahip oturumda uçtan uca, kabul listesi Mert onaylı). `docs/plan/ILKELER.md` karar vermeden önce okunur.

## 00. YENİDEN BAŞLATMA (2026-10-08 ~10:00Z) — devam ederken ÖNCE BUNU OKU
- **Neden:** makinede 7.500+ `rundll32` süreci birikti (6 Ekim 19:36'dan beri saatte ~266; kaynağı bulunamadı); Chrome açılamıyor. Mert bilgisayarı yeniden başlatıyor. Bütün oturumlara DURAKLAT verildi (`inbox.mjs board` "DURAKLADI" satırları). Sonra: birikme yeniden başlıyor mu ölç (`tasklist /FI "IMAGENAME eq rundll32.exe"`), başlıyorsa kaynağını ara (BL adayı).
- **Tren-1** (`newfork-wt/train`, dal `train/20261008T0916Zb`, yerel, push edilmedi): EKRAN-01 paket 1 (`7336c08c`), GA-4 (`cb4d21f4`'ün 11 commit'i), EKRAN-01 raporu, BL-965 raporu, koordinatör kayıtları (KK-225…227, OPS-08, BL-973, G12), sayfa klasörü satırı (`a85a7f8b`), `schema.sql` yeniden üretildi (`fafb2e4a`). Yerel DB'ye kalıcı uygulandı: `052513`…`052645`, `064103`.
  - Kapı: lint, typecheck, test, build YEŞİL; test:db yalnız bilinen 3 kırmızı (management_owner_job TODO, scheduling_settings_shift_types_rls, weekly_exchange_changed_terms). e2e makine yüzünden düştü (11/16 "run out of resources").
  - **Kilitler bende:** `db.lock` + `heavy.lock` "koordinator/tren-1" — yeniden başlatmadan sonra da benim; yerel DB main'in önünde (canlıyla aynı).
  - **Kalan:** Docker/Supabase ayağa kalkınca e2e'yi yeniden koş (`newfork-wt/train-1-gate.sh` son bloğu, 11 dosya) → yeşilse `main.lock` → `git push origin train/20261008T0916Zb:main` → kilitleri bırak → main CI → EKRAN-01, GA-4, BL-965, GUVENLIK-A oturumlarına haber.
- **Sonra:** tren-2 = EKRAN-02 veri paketi (önce kendi pgTAP + canlı, `TREN-HAZIR`) + varsa tren aracı (PARALEL-1, `task/tren-araci`, görev ONAY 3 düzeltmeyle). BL-969 en son. Mert: tren ölçümü ("hazır" → "main'de" süresi; 2–3 tren sonra sayıyla rapor; Mert "Ölç, sonra karar ver" seçti).

## 0000. GECE MODU AÇIK (2026-10-07 ~10:00Z / yerel ~03:00) — sıkıştırmadan sonra ÖNCE BUNU OKU
- **Mert'in talimatı (`/gece-modu` argümanı):** "artifactlara ben sabah gelince karar vereceğim. işi biten karar bekleyen sessionları güvenli bir şekilde durdur. bu sessionların hepsi karar beklediği için durursa, yeni sessionlara task delege etmeye devam et". Mert'e gece mesaj ve soru gitmez; sorular `SABAH-SORULAR.md`'ye.
- **Araçlar:** cron `b06937c7` (`3-59/10 * * * *`, gece turu), `request_keep_awake` her turda yenilenir, posta kutusu `wait` arka planda. İzin modu bypass (Mert açtı).
- **"Güvenli durdur":** oturum işini kayda geçirmiş (rapor posta kutusunda, commit dalda), sunucularını PID ağacıyla kapatmış, kilit tutmuyor → posta kutusuna `DURDURULABILIR` yazar → koordinatör dokunmaz, oturum boşta kalır (arşiv yok; sabah Mert'in kararıyla devam eder). Yarım tur varsa `stop_session` yalnız sorun çıkarsa.
- **Yeni iş verme:** `start_session` aracı yok, kart (spawn_task) gece tıklanmaz. Yol: işini bitirmiş ve kaydını bırakmış boştaki oturuma yeni `Görev:` mesajı (önce PARALEL-1, sonra EKRAN-16 keşif); Mert kararını bekleyen oturumlar (EKRAN-08, EKRAN-10 ×3, BILDIRIM) yeniden kullanılmaz — sabah bağlamları gerekiyor. Yedek yol: Opus alt ajan, worktree yalıtımıyla.

| Hat | Gece planı | Sabaha bekleyen (Mert) |
|---|---|---|
| EKRAN-02 Requests | telefon kartı (#67) + görüntüler; C2 (H2 penceresi, KARARLAR kesin) aynı dalda; veri paketi yeni main'e taşınır + BL-910 + `nf-guvenlik` yeniden + test:db | tek tablo "gönder" (Mert bakacak); veri paketi gönderimi S1 (ultrareview) cevabına bağlı |
| EKRAN-01 Schedule | #11 → #9 → #20 → #18 (R3 gönder koordinatörde, gece de geçerli); R0–R2 kendisi | 3 varyant (#86–#88), S24, S25 |
| EKRAN-03 Employees | [şimdi] grubu (R1, kendisi gönderir) | `styles.css` ve veri maddeleri EKRAN-02 dilimlerine bağlı → biterse DURDURULABILIR |
| GUVENLIK-A | GA-1 (kiracılar arası taşıma kilidi; R3, `nf-guvenlik`, canlı migration yedekli, gönder koordinatörde) → GA-4 (BL-906 planlı kapanış; yeni pgTAP dosyası yok) | GA-2/GA-3 EKRAN-02 paketinden sonra |
| PARALEL-1 | main'e gönderim + CI yeşil → ekran oturumlarına yeni test:db bildirimi → boşsa yeni iş | — |
| EKRAN-16 keşif | rapor → DURDURULABILIR | ≤5 soru |
| EKRAN-08 çekmece | davranış testi (db.lock boşalınca) + rapor → DURDURULABILIR | 2 varsayım teyidi |
| EKRAN-10 General | rapor + ≥6 tasarım → DURDURULABILIR | tasarım seçimi |
| EKRAN-10 Locations / Jobs | Mert'in değişikliklerini bekliyor → DURDURULABILIR | artifact ayarları |
| BILDIRIM | söküm listesi + olay envanteri + plan + ≤6 soru + ≥3 varyant → DURDURULABILIR | temel model soruları |

- **Gece yeni iş adayları (Mert kararı istemeyen, açık hatlarla çakışmayan; sırayla):** (1) BL-804 Workspace "Scheduled today / Open today" UTC gününe göre sayıyor (leave: high; Ekran 5; KARARLAR saat dilimi kuralı belli); (2) BL-559 sahibi birincil lokasyonu olmayan kişi son tarihli belgeyi gönderemiyor (high; Ekran 6); (3) BL-821 yayındaki belge türünü arşivlemek zorunlulukları kapatmıyor (high; Ekran 6). Yetki matrisi / `ci-green.txt` / `styles.css` gerektiren iş gece açılmaz.
- **Gece notu (sabah raporu için, tur tur):**
  - ~10:20Z: EKRAN-10 General bitti (artifact Kwz63F5JeddW5S7y2kSsAi, BL-911…916, KK-208, sabah G1–G3), durdu. Jobs durdu (BUJShpW3rXDGFVNyEygDZr v2). Locations durdu (5 tasarım UWTcHirMHXjrfa9TND2TLE + kopya Lru9WAg6HaSbdErLyMhU26; backlog adayı: ortak çekmecede `scrollbar-gutter` 15 px — EKRAN-16 BL'lerinden sonra numaralanacak). EKRAN-16 keşfi main'de `ca4326f6` (KK-209, sabah G4–G7, sunum PEYuSjGWXGN9dkb9LipikY); oturum BL-917'den başlayan metni hazırlıyor, sonra boş → gece işi adayı.
  - EKRAN-02: telefon kartları hazır (`8a1581ca`, 390 görüntüleri `newfork-wt/ekran-02/artifacts/ekran-02/tek-tablo/*-390-after.png`, e2e 7/7); sabah Mert'e masaüstü + telefon önce/sonra → "gönder". Sonra C2 ve veri paketi hazırlığı.
  - EKRAN-03: [şimdi] 1 main'de (`904a07ab`). Main CI 37598002511 kırmızı (yalnız check, ShiftQuickEditor süre aşımı, BL-757 yük); `--failed` yeniden koşu EKRAN-03'te, PARALEL-1 push'u main yeşilini bekliyor.
  - ~11:15Z: **Sabah "evet" bekleyen canlı işler (KK-214, her biri kendi oturumunun penceresinde):** ACIL-40001 (EKRAN-08 oturumu, dal `task/acil-40001`, 24 fonksiyon 40001→PT409, dal CI 37611123359 yeşil, `nf-guvenlik` ONAY; canlı + main birlikte); EKRAN-01 paket 1 (#20 sütun → canlı önce); GUVENLIK-A GA-1 (main gece gidebilir, canlı sabah) ve GA-4; BL-804 (EKRAN-16 oturumu; canlı önce).
  - PARALEL-1 main'de (`702f2b69`, CI 37608195446 yeşil): BL-897/755/760 kapandı; oturum şimdi BL-964 (kanca tırnak içi + `git push \⏎` atlaması, son tarih 10-14). Main CI kırmızısı (37598002511) yeniden koşuyla yeşile döndü.
  - Kararlar: Jobs V1 (KARARLAR Settings), Locations A, Important Dates L1 + Note, H2 uyarı kutuları; BL-958 (40001 döngüsü), BL-959 (kapalı günlü hafta 500 → EKRAN-01), BL-910 (ret gerekçesi sızıntısı → EKRAN-02 paketi).
  - ~12:20Z: **GA-1 main'de** (`a79ff194`, CI 37615016851 yeşil; `jobs.department_id` bileşik FK ile korunuyor, hücre `fa6a9964`); ortak yerel DB'ye uygulandı; **canlıda açık** — sabah GA-1 + GA-4 canlı (GUVENLIK-A oturumu), GA-4 main. GUVENLIK-A DURDURULABILIR.
  - BL-964 kapandı (`a57f2a4c`); BL-841 kapandı, BL-497 kısmen (`3fec39b8`); BL-965 (belge bakım işi tarihsiz belgede çöküyor, bütün workspace'ler) PARALEL-1 oturumunda, canlı sabah. BL-966 (kapanış gözlenebilirliği) backlog.
  - **Sabah "evet" listesi (pencere pencere):** ACIL-40001 (EKRAN-08 oturumu), EKRAN-01 paket 1, GUVENLIK-A (GA-1 canlı + GA-4), BL-804 (EKRAN-16 oturumu), BL-965 (PARALEL-1 oturumu), EKRAN-02 veri paketi (S1'e bağlı). G10 cevabı (a) gelirse bunlar tek "gönder"le koordinatöre geçer.
  - Koordinatör bağlamı %79 (12:20Z); 5 saatlik limit %56 (12:50Z sıfırlanır), haftalık %23.
  - ~14:20Z: EKRAN-01 web paketi + BL-959 main'de (`d017320c`, CI 37627942589 yeşil); veri maddeleri + Schedule 40001 payı dalda hazır. EKRAN-02 C2 (H2 penceresi) dalda (`task/ekran-02-c2`, ONAY @09cd161d, sabah G13). EKRAN-03 gece partisi main'de (`9ebdc113`…`bdf54974`), şimdi BL-503 (ABD form kuralları, R2). BL-804 dalda hazır (`task/bl-804`, migration `20261007235000`). BL-757 ölçüldü, düzeltme EKRAN-01 paket 1'den sonra. KK-220: migration'lar gönderim anında yeniden numaralanır.
  - **Mert gece EKRAN-16 oturumunda giriş ve katılım için sıfırdan tasarım istedi:** tasarım kitabı https://claude.ai/artifact/BZkoou6GKHrEwcwoDZYqQu; ilk karar giriş modeli (kod — önerilen — ya da parola), seçim sayfanın kaydında. Sabah raporunda sor: bu iş Ekran 16 keşfinin (G4–G7) yerini mi alıyor, yanına mı.
  - Sabah "evet" listesine ek: BL-804 (EKRAN-16 oturumu, hazır). Sabah sorularına ek: G10–G13.
  - ~16:00Z: BL-503 (ABD form kuralları) main'de `9e7abc62`; BL-969 (eski veriyi düzelten migration + CHECK + toleransların silinmesi, §2.A.5) dalda hazır `task/bl-969` (ONAY @f451d108). BL-497-2 (dalgalı test) main'de `2b90a932`. EKRAN-01 paket 2 (göçsüz) ikinci inceleme sonrası gece gidebilir; #35 cümleleri KK-221; BL-968 → G14.
  - **Sabah gönderim sırası (KK-218/220/223):** 1) ACIL-40001 (EKRAN-08 oturumu) → 2) EKRAN-02 veri paketi (S1'e bağlı; izin fonksiyonlarında 40001→PT409) → 3) EKRAN-01 paket 1 + Schedule 40001 payı → 4) GUVENLIK-A GA-1 canlı + GA-4, BL-804 (EKRAN-16 oturumu), BL-965 (PARALEL-1 oturumu) → 5) BL-969 (EKRAN-03 oturumu, en son). Her biri: Mert'in o pencerede "evet"i (ya da G10 = a ise koordinatörün "gönder"i) → rebase + yeniden numara → yedek → canlı → main. Sonra EKRAN-02 tek tablo + telefon (Mert'in bakışı) ve C2 (G13), BL-757 (EKRAN-01 paket 1'den sonra).
  - **Gece yeni iş durdu (koordinatör kararı, ~16:00Z):** kalan backlog işleri ya Mert kararı istiyor ya da sabah gidecek paketlerle aynı dosyalara dokunuyor; sabah 9 dalın sırayla rebase'i zaten yük. Daha fazla dal açmak birleştirme riskini artırır. Boştaki oturumlar: GUVENLIK-A, PARALEL-1, EKRAN-16/BL-804, EKRAN-08/ACIL, EKRAN-10 ×3, BILDIRIM.
  - ~19:00Z: **BL-804 canlıda ve main'de** (`8aa7b5ea`, Mert'in EKRAN-16 penceresindeki "evet"iyle; canlı sırası 130000 → 235000, GA-1 230000 sonra). **ACIL-40001 v2** gönderime hazır: dal `task/acil-40001-v2` @`10e1cc05` (yerinde değişiklik, başka işlerin gövdelerini korur; migration `20261008001500`); eski `task/acil-40001` birleşmez, silinir. Bir kez dalgalanan test: `bl052_document_onboarding` 25 (ortak DB eşzamanlılığı).

## 000. GÜNCEL DURUM (2026-10-07 ~09:35Z) — ÖNCE BUNU OKU
- **Mert'in uyarısı (09:30Z, üçüncü kez):** "hiç sorgulamıyorsun … ne tavsiye veriyorsun ne karşı çıkıyorsun ne fikrini sunuyorsun". Her yeni isteğe önce: ne anladım · artı/eksi + çakışan kural · önerim/itirazım (DERSLER 10-06 gece girişi). Kural önerisi olarak sorulan soru kapatıldı, cevap bekliyor.
- **Hat sayısı (KK-204):** Mert "şuan için bu kadar hat yeterli. ama durdurmayacagız bunları" — yeni hat yok, 11 hat sürer. Görev mesajı `Görev: <İŞ-ID>` ile başlar (KK-188). Alt ajan en az Opus 5.5 medium (KK-198).
- **Mert hakkında (hafıza):** uzun liste okumaz → önce/sonra görüntüsü ve ≤10 satır özet; UI'da simetri/hizalama takıntısı → hizalama ölçülerek götürülür; görüntüyü göndermeden önce telefonunu da kendin aç (KK-199 dersi).

| Hat | Oturum | Durum (09:35Z) | Sıradaki koordinatör adımı |
|---|---|---|---|
| EKRAN-02 Requests | `local_224535dd…` | tek tablo masaüstü hazır (`task/ekran-02` @`9891727d`, /code-review + tam kapı + 7 e2e yeşil); Mert "önce telefon düzelsin" → #67 telefon kartı | telefon görüntüleri gelince Mert'e önce/sonra → "gönder"; sonra C2 (H2 kesin, KARARLAR), veri paketi A1A2+A3+AUTHZ-DUMP+A4 (R3, nf-guvenlik yeniden, S1 ultrareview sorusu açık) |
| EKRAN-01 Schedule | `local_6979dfbe…` | "başla" verildi: #11 → #9 → #20 → #18 (R3 gönder bende); iş kaybı beşlisi zaten kapalı | CSS maddeleri EKRAN-02 görünüm dilimi main'e girince; DB-4 veri paketinden ve S24'ten sonra; kayıt işleri bende (aşağıda) |
| EKRAN-03 Employees | `local_e062291d…` | "başla": #1, #7, #8, #16 (yalnız `apps/web/src/employees/*`) | `styles.css` + c1a EKRAN-02 görünüm diliminden sonra; veri dilimleri paketten sonra |
| PARALEL-1 | `local_0ea2b338…` | görev ONAY, şartla: izlenen pgTAP dosyalarına dokunmaz (geçici kopya) | gönderimden önce haber verecek → ekran oturumlarına yeni test:db davranışını bildir |
| GUVENLIK-A | `local_bf8f7f46…` | salt okur ölçüm + plan | rapor → Mert'e özet; kod EKRAN-02 paketinden sonra |
| EKRAN-16 keşif | `local_1f893110…` | salt okur dört ajan | rapor → YENİ bulgulara BL no |
| EKRAN-08 çekmece | `local_05f60332…` | davranış testi + 5 tasarım artifact | rapor + artifact → Mert seçer → KARARLAR |
| EKRAN-10 General | `local_a1ef992c…` | 5 rol inceleme + ≥6 tasarım | aynı |
| EKRAN-10 Locations | `local_dd2f4f75…` | birebir artifact, Mert ayarlıyor | `LOCATIONS-TWEAKS.md` gelince koda iş açılacak (ortak parça kararları tek seferde; öneri Mert'te cevapsız) |
| EKRAN-10 Jobs | `local_ba6dcfcd…` | aynı | `JOBS-TWEAKS.md` |
| BILDIRIM | `local_2e4ae653…` | daraltıldı: eski sistem incelenmez; söküm listesi + olay envanteri + sıfırdan plan + ≤6 soru + ≥3 varyant | söküm yeni sistemin ilk dilimi (EKRAN-02 paketi eski fonksiyonlara yazıyor) |

- **Bende bekleyen kayıt işleri:** EKRAN-01 raporundaki BACKLOG düzeltmeleri (BL-703, 194, 386, 705, 694, 101), BL-211 / BL-376 kapanışı, Schedule'ın 82 BL'sinin "EKRAN-01 listesine taşındı" notu, BL-038 K3–K6 → KARARLAR Schedule (kaynak `tasks/BL-038.md`); EKRAN-03 tazelik hükümleri (BL-765, BL-776, BL-407; KK-177/BL-282 kapandı); EKRAN-02 Requests BL'lerinin listeye taşınması. Raporlar posta kutusu `done/`'da (`20261007T081605-oturum-ekran-01…`, `20261007T081502-oturum-ekran-03…`, `20261007T070028-oturum-ekran-02…`).
- **Temizlik:** `newfork-wt/ekran-02-ba` (yedek `artifacts/koordinator/yedek-ekran-02-ba-20261007/`; silme ajanlara reddedildi, komut Mert'te), `.claude/worktrees/handoff-koordinatorlugu-20c0b3` (rol hafızası yedeği `artifacts/koordinator/yedek-handoff-wt-agent-memory-20261007/`).
- **CI:** tek koşucu; 2 ve 3 açılışta kalkmaz (KK-187). OTOMASYON-3 main'de: `heavy.lock`, kayıt koruması, karar kancası; 2026-10-14'e kadar uyarı.
- **Kullanım (09:30Z):** 5 saatlik %16, haftalık %10. Koordinatör bağlamı %53 → bu not devir içindir; Mert `/compact` yazabilir.

## 00. GÜNCEL DURUM (2026-10-06 ~17:05Z) — sıkıştırmadan sonra ÖNCE BUNU OKU
- **Gece durum dosyaları (koordinatörün scratchpad'i, bu oturum):** sabah raporu notları `C:/Users/TheWe/AppData/Local/Temp/claude/C--Users-TheWe-Documents-Codex-newfork-clean/53bf53b1-53ab-488d-9ec7-a96202015189/scratchpad/sabah-raporu.md`; ağır iş izin sırası `.../scratchpad/agir-kuyruk.md`. İkisi de güncel tutulur.
- **AĞIR İŞ İZNİ (Mert ~15:05Z; hafıza `heavy-run-permission`):** tam kapı, e2e, tam test:db, build, dev sunucusuyla QA yalnız koordinatörün izniyle, aynı anda tek oturum; `AGIR-ISTEK` → "AĞIR İZİN: <rol> başla" → `AGIR-BITTI`; push sonrası CI bitene kadar izin yok. Tek runner (runner 2, 3 durduruldu; KK-176).
- **CLAUDE.md §3'de Mert'in beş kuralının TAM METNİ** (1ac3226d): her istekte önce ne anladım / artı-eksi + mevcut kural / daha iyi yol. Bu gece tartmadan uyguladığım için Mert uyardı (OBSERVATIONS).
- **Sabah:** soru listesi `docs/plan/SABAH-SORULAR.md` (Tur 1 hat durduranlar + yerel DB reset sorusu); dallar sabah onayına: Requests C3, C1, B1a, C2-css; Employees C1a; arayüz salt-hata; BL-435. R3 paket A1A2 + A3 + AUTHZ-DUMP gönderimi + ultrareview sorusu (canlıda K-S3 yalnız-View rol satırı silme: önce say). Görüntü yolları sabah-raporu.md'de.
- **Hatlar (17:05Z):** veri temizleniyor → EKRAN-02 A4 (devir `.newfork-inbox/done/20261006T165239-nf-db-veri-ekran-02-a3.md`); web AUTHZ-DUMP + BL-435 ağır izinde (push yok); arayüz salt-hata kapısı sırada; planlama EKRAN-04/05/06 C görsel QA sırada.

> **2026-10-07:** aşağıdaki gece kuralı 2026-10-06 gecesine aitti; Mert döndü. Gece kuralları artık `CLAUDE.md` §4.5'te (gündüz kuralları geçer, ek yasak yok).

## 0. GECE KURALI (Mert, 2026-10-06 ~13:05–13:20Z; KK-175)
- **Sıra:** "sessionları yöneterek sayfalama inceleme işini bitir sonra da backloglara dön". Önce ekran dilimleri (sayfa sayfa plan), sonra backlog.
- **Ekran değişiklikleri sabahı bekler:** ekranda görünen bir şeyi değiştiren iş main'e GİRMEZ — dalında hazır, tam kapı yeşil, öncesi/sonrası görüntüleri `artifacts/<rol>/<iş>/`, raporda "sabah onayına hazır". Veri, API, CI, test işleri normal kuralla main'e ve canlıya gider (R3 koordinatör izniyle, canlı migration yedekli).
- **Köklü değişiklik yok:** "design, kural, davranış, mantık, kod calışma prensibi gibi değişiklikleri gerekmedikçe yapma … ben yokken köklü değişiklik yapma." Dilim içinde KARARLAR'da olmayan karar gerekirse uygulanmaz, sabah sorusu olur.
- **Backlog:** "sadece backlogda olanların tazeliklerini kontrol et. hala geçerliyse backlogları azaltmaya çalış". Kapsam Schedule + Requests + Employees maddeleri. Planlama tazeliği ölçer (bayat → kanıtla kapanır), geçerliyi "salt hata düzeltmesi" / "karar ister" diye ayırır; hatlar sıraları bitince "salt hata düzeltmesi"ni alır (görünürse dalda).
- **Sabah raporu (Mert uyanınca ilk mesaj):** ne bitti, ne canlıda, sabah onayını bekleyen dallar + görüntüleri (SendUserFile), backlog'dan kapananlar ve nedeni, sorular (tek tur, §13 şablonu).

- **PC yeniden başladı (~13:40Z, aşırı yük) → TEK AĞIR İŞ (Mert ~13:50Z; KK-176):** runner 2 ve 3 durduruldu, CI tek runner'da sırayla (~25 dk); yerel ağır iş (tam test, e2e, test:db, build) yalnız `db.lock` ile ve `gh run list` boşken. Hatlar 13:55Z'de bu kuralla yeniden başlatıldı; dört sabitli oturumda Remote Control açık. CI-DOCS gereksiz çıktı (paths-ignore zaten var; iptal edildi); REMOTE-CI araştırması planlamada (sabah Mert'e).

## 1. Yön ve kurallar
- **Koordinatör işçi değil (KK-159):** kod, ölçüm, test, kapı, ekran görüntüsü, alt ajan YOK. Oturumların görüntülerine bakmak ve Mert'e göndermek serbest.
- **Beş kural (KK-165)**; **görsel soru dersi:** önce nerede / kim / ne oluyor / sorun ne; görüntüye kendin bak; Mert'in seçtiğini yeniden onaya sunma (OBSERVATIONS 2026-10-06, iki kez).
- **Gönderim:** R0–R2 oturum izinsiz; R3 ve her canlı migration koordinatörün izniyle (riskli diff'i oku).
- **Docs gönderimi CI koşturmaz** (`ci.yml` `paths-ignore: docs/**, **/*.md`); main'de yeni koşu eskisini iptal etmez, bekler (BL-756). Kod + docs aynı push'ta giderse CI koşar.
- **Kilit:** `node scripts/lock.mjs take main "koordinator/<iş>"` ayrı komutta, sonra push, sonra release.
- **GateGuard** her yeni scratchpad dosyasında olgu ister; yazıp yeniden dene.
- **Kırmızı main:** bugün 5 e2e kırmızısı, hepsi yük (VAR-E2E-GIRIS, VAR-E2E-2). Önce ayır (kod mu, yük mü), yalnız düşen işi yeniden koşturt; aynı test tekrar düşerse sınıflandırma görevi. E2E-YUK (`29e504d5`: e2e `needs: [check, db]` + flow 7 `test.slow()`) girdi; ilk koşusu 37467116856.

## 2. İlk işler (devralınca)
1. `node scripts/inbox.mjs claim`, arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000). Her çıkışta çıktıyı VE `ls .newfork-inbox/new/`'i oku (ack'lenmemiş eski rapor = işlenmemiş; 2026-10-06'da üç rapor böyle kaçtı), `ack`, yeniden başlat.
2. Her uyanışta takılma: `node scripts/inbox.mjs board | grep -A1 '^TAKILDI' | paste - - | grep -v 53bf53b1`; 20 dk sessiz "working" → `list_events`.
3. Kayıt worktree'si `../newfork-wt/coord` (`fetch` + `checkout --detach origin/main`); düzenleme scratchpad python betiğiyle.

## 3. Hatlar (hepsi sabitli, Remote Control açık) ve gece sırası (KK-174, KK-175)
| Oturum | Kimlik | Gece sırası |
|---|---|---|
| Veri: nf-db (opus/high) | `local_c2ed4f3f-934a-48cd-82d9-1e99087b91cd` | Undo geri yükleme sınırı (`20261007130000`, ONAY @21387bce, R2) main + canlı → **devir notu, "temizlenebilir" raporu → koordinatör `clear_session` + A1 mesajı + bir tur sonra Remote Control aç** → EKRAN-02 A1 → A2 → A3 → A4 (R3: koordinatör gönder izni) → EKRAN-03 A1 → A4 (Q1, Q2 cevaplı) → backlog salt hata (nf-db) |
| Web: nf-backend (medium) | `local_c9810f32-30fd-4fe4-b343-1185c9a111ef` | EKRAN-02 B1a (ekran → dal, push yok) → BE-2b-O1 (e-posta bir kez yeniden deneme, R2, gider) → B1b (A1–A3 sonra; ekran kısmı dal) → B2 → B3 → backlog salt hata (nf-backend) |
| Arayüz: nf-arayuz (medium) | `local_6cda4e74-9638-44d9-931c-9ce8c2e1fa3c` | E2E-YUK (girdi) → EKRAN-02 C3 sayfalama → C1 tek tablo → C2 inceleme (üçü dal + görüntü) → backlog salt hata (nf-arayuz; görünürse dal) |
| Planlama: nf-planlama (medium) | `local_47a5c079-bbdb-4533-a9d3-6fb7062efea7` | GECE-2 EKRAN-01 kapanış ölçümü → BACKLOG-TAZELIK-RE (Schedule + Requests + Employees) → GECE-3 EKRAN-04 Availability keşfi |
- Mert'in kendi oturumları: dokunma. İkinci veri oturumu açılmaz (bilgisayar darboğaz). Aynı anda en çok iki ağır iş.

## 4. Mert'te bekleyenler (sabah)
1. Sabah onayı: gece dallarda bekleyen ekran işleri (B1a, C3, C1, C2, görünür backlog düzeltmeleri) — görüntüler.
2. **Requests uyarı varyantları** https://claude.ai/artifact/UvHbxipPcLVHmMW1ZVE4Xh — G2 yol/dinlenme uyarısının yeri, G3 izin kısaltma satırı: birer numara.
3. **Telefon tasarımı:** Mert 2026-10-06 ~11:50Z soruyu kapattı ("bekle"); Employees telefon listesi https://claude.ai/artifact/CQx4kkeVq1CJF3zGchvkXC Sistem 1'den önce; önerilen yol Sistem 1'in telefon hâli, 5 varyant.
4. **Resend:** canlıda e-posta yok; adımlar Mert'e iletildi (12:35Z, `docs/plan/mvp/RESEND.md` §3). Mert "tamam" deyince bir oturum canlıda test daveti + parola sıfırlama doğrular.
5. Sorulmayanlar: C-D11 (tek lokasyonda Pazar görünmüyor), BL-445 "başka fikri"; planlamanın "karar ister" listesi; EKRAN-04 soruları.
6. Hatırlatmalar BL-686, BL-687.

## 5. Bugün main'e ve canlıya girenler
- Sabah: "!" işi, Edit bayrağı, canlı kanal lokasyon başına (DB-2), şablon Replace kuralı (DB-3), BE-2b API.
- Öğleden sonra: VAR-UYG-KIRMIZI (`88f5e7a1`, kökü kodda), LIST-YESIL (`529d6e98`, üç sayfada yeşil ekleme düğmesi), DB-1c Undo sunucuda (`ec38901d`, canlı `20261007120000`), BL-763 e2e kurulum (`bce5765a`), Undo düğmesi bağlantısı (`48de63c5`), E2E-YUK (`29e504d5`). Canlı web/API = main (CANLI-ESIT-WEB), canlı DB = main 436/436 (CANLI-ESIT-DB).
- Kararlar: KK-172…KK-175; KARARLAR liste ortak dili (yeşil ekleme düğmesi, sayfalama 25/50/100 varsayılan 50, bütün liste sayfaları — her sayfa kendi ekran turunda), Requests tek tablo, Employees Q1 (bekleyen izin sessizce geri çekilir), Schedule haftalık e-posta bir kez yeniden dener; BL-761…BL-788.

## 6. Dersler
- Okunmamış rapor kalmasın (yukarıda §2.1).
- Mert'in seçtiği şeyi yeniden onaya sunma; soru yalnız yeni karar için.
- Arayüz hattı sunucu açık bırakmasın; PID ile kapatsın.
