# İlerleme planı — hesaplı (sürüm 7, 2026-09-30)

## 0. Güncel durum (kayıt oturumu tutar; her beslemede güncellenir)
Tutan: "Rol: nf-planlama (Kayıt ve ilerleme)" oturumu, `local_c9e94ca2-949d-472e-83f8-59ec0628259b` (KARARLAR OPS-04; 2026-09-30'da devraldı, önceki kayıt oturumu `local_d09b11f8…` arşivlendi — koordinatörün aktardığı). Son güncelleme: 2026-09-30, `origin/main` `d1dd2327` + bu commit, koordinatör beslemesi #5 (kayıt devri; backlog sayımı ve uzak dal sayısı `d1dd2327`'de yeniden ölçüldü, değişmedi: 239 açık, 40 dal; FB-6.2 ölçümleri besleme #1'den, `bccdb4df`; işçi oturumlarının durumu koordinatörün aktardığı gibi, ölçülmedi). Koordinatör bugün `local_460271c1-c51e-4537-bb02-a601c501bbbf` ("Koordinatör — devir 2026-09-30 sabah"; `HANDOFF.md`). İş sırasının kaynağı `tasks/BACKLOG-PROGRAM.md` (kullanıcı kararı 2026-09-29); bu bölüm onun ve görev dosyalarının özetidir. §1–§9 FOUNDATION-B'nin puan tablosudur; bu güncellemede yalnız §1 ve §3'ün FB-6.2 satırları yenilendi.

### 0a. Durum ne (en çok 5 satır)
1. **Ne bitti:** Employees ekranının yetki işi (FB-6.2) kapanışa geldi; son adım olan uçtan uca testler (`.10`) main'de. Yönetici yalnız kendi lokasyonundaki kişileri görüyor ve oraya davet gönderebiliyor; bu akışlar her gönderimde otomatik deneniyor.
2. **Kanıt:** `9f1cc3b3` + `352faab7` main'de; main CI 36696339068 check + db + e2e yeşil (`gh run view`, 2026-09-30). Kilitler boş.
3. **Neredeyiz:** FOUNDATION-B Aşama 6–7 %53,9 (124 / 230 puan, tahmin ağırlıklı). Backlog'da 239 açık madde: kritik yok, 5'i "high" (BL-238, BL-101, BL-276, BL-426 ve belge çekmecesinde dosya yükleyince yazılanın silinmesi). Yan yana iki iş yürüyor: EMP-001 dilim A — Employees → çekmece → Profile sekmesinin sadeleşmesi; G14 dilim a — Schedule'da ekranı değiştirmeyen dört düzeltme (tekil/çoğul metinler, Escape, "bugün"ün saat dilimi, ham renk kodları).
4. **Sıradaki:** EMP-001 A bitince FB-6.2 `.11` kapanışı (koordinatör) → EMP-001 B ("yalnız yönetir"in sökülmesi) ve C → G8a (arşivli lokasyon kuralı) → G8b. G14'te dilim a'dan sonra dilim b (görünen düzeltmeler: basılamayan Publish, okuma düşünce hafta gezinmesi, soluk çip kenarları, Unpublish penceresinin iki pürüzü, dar pencerede üst çubuk); dilim c (müsaitlik uyarısı) seninle konuşmadan sonra.
5. **Bekleyen karar:** G14 planı onaylandı (2026-09-30). Kalan: dar pencerede üst çubuk iki satır kalsın mı (S2) ve müsaitlik uyarısı konuşması (BL-204) — ikisi de ekran görüntülerinden sonra; BL-437 (zamanlanmış dışa aktarma ekrandan kurulamıyor: taşınsın mı, silinsin mi). Tam liste §0c.

### 0b. Açık işler, önem sırasıyla
Sayım: 2026-09-30, `bccdb4df`, betikle (`BACKLOG.md` açık bölümü; yöntem `BACKLOG-PROGRAM.md` "Sayım"). Toplam 239. "Şu an koşabilir mi" sütunu kayıt oturumunun değerlendirmesidir (grubun dokunduğu dosyalar ve yürüyen işler); her grup başlamadan önce tazeliği yeniden ölçülür.

| Sıra | Grup | Tema | Bir cümleyle (örnek madde) | Açık | En yüksek işaret (leave / do) | Şu an koşabilir mi |
|---|---|---|---|---|---|---|
| yürüyor | EMP-001 | Employees çekmecesi yenilikleri (kullanıcı isteği, program dışı) | Employees → çekmecede Profile sadeleşir, "Manages without working there" kalkar, rol "Save changes" ile kaydedilir | görev dosyası, 3 dilim | R3 (B ve C) | A yürüyor (`nf-arayuz`); B ve C, FB-6.2 `.11` kapanınca |
| 7 | G7 = FB-6.2 | Çalışanlarda yetki çekirdeği | Employees'te kimin kimi görüp düzenleyeceği tek yerden sorulur; kalanların en önemlisi eski yetki kapısını kullanan fonksiyonlar (BL-276) | 21 | high / risky | `.11` kapanışı EMP-001 A'yı bekliyor; maddeler `.11`'de tazelenir, dördü EMP-001 B ile kapanır (BL-424, BL-418, BL-387, BL-421) |
| 8 | G8 | Silinmiş ve arşivli kayıtlar | Arşivlenmiş iş ya da vardiya tipindeki eski vardiyanın kartında ad yerine "Shift" yazıyor (BL-254) | 3 | medium / moderate | Hayır — G7 kapanışı ve EMP-001 B1'den sonra (kullanıcı 2026-09-30) |
| 3 | G3 kalanı | Bayat ekranlar | Workspace hub'ında davet kabul edilince Account rozeti yenilenmiyor (BL-389) | 3 | low / moderate | Evet (`nf-backend` boşta) |
| 4 | G4 kalanı | Zamanlanmış dışa aktarma | E-postayla zamanlanmış dışa aktarmanın sunucu tarafı bitti; ama Schedule → Export penceresinde bunu kuracak bölüm yok (BL-437) ve canlıda saatlik tetik bekliyor (BL-101) | 3 | high / moderate | Hayır — BL-437 ürün kararı (taşınsın mı, silinsin mi) ve BL-426 (Vercel) kullanıcıda |
| 5 | G5 ardı | Hesap güvenliği, düşük bulgular | Hesap silmede ilk kurtarma e-postası düşerse kişi 15 dakika yeniden gönderim alamıyor (BL-357) | 4 | low / safe | Evet |
| 9 | G9 kalanı | İzin ve takas kuralları | Her takas onayı cevaptan önce bildirim dağıtımını 2 saniyeye kadar bekliyor (BL-200) | 5 | medium / moderate | Evet, önce ölçüm (BL-200) |
| 10 | G10 | Schedule kayıt ve yayın kuralları | Her Pazar akşamı (Pacific) yönetici ekrandaki haftayı düzenleyemiyor (BL-238) | 14 | high / risky | `nf-db` işi, aynı migration ailesi: EMP-001 B/C ve G8 ile aynı anda değil, sırayla |
| 11 | G11 kalanı | Hata sözleşmesi | Settings'e yazan rotaların kapısı yetki çekirdeğine çevrilmeli (BL-374) | 6 | medium / risky | Evet (`nf-backend`); BL-374 R3 |
| 12 | G12 kalanı | Yerel veritabanına dayanıklı testler | İki veritabanı testi herkesin kullandığı örnek lokasyonu değiştiriyor (BL-217) | 12 | medium / moderate | Evet (`nf-test`, yalnız test); BL-105 kullanıcı onayı ister |
| 13 | G13 kalanı | Test ve CI kararlılığı | Davetlinin yeni hesap açarak daveti kabul etmesi uçtan uca denenmiyor (BL-434) | 8 | medium / moderate | Evet (`nf-test`) |
| yürüyor | G14 | Schedule üst çubuk, menüler, pencereler — görsel; bu planda yalnız masaüstü | Basılamayan Publish düğmesi basılabilir görünüyor ve nedenini söylemiyor (BL-308) | 17 (10'u bu planda) | medium / safe | Plan onaylı (kullanıcı, 2026-09-30). Dilim a yürüyor (işçi oturumu, `nf-arayuz` kurallarıyla; dal `task/g14-a`): BL-311, BL-372, BL-353, BL-312. Dilim b a'dan sonra: BL-308, BL-392, BL-345, BL-305, U08 (U08 S2'yi bekliyor). Dilim c: BL-204, kullanıcıyla konuşmadan sonra. Ertelenen 5: BL-233, BL-333, BL-319, BL-320 (telefon/tablet), BL-327. "Bir sonraki planda" 2: BL-318, BL-121 |
| 15 | G15 | Görsel tutarlılık | Ortak ikon düğmesi telefonda 44×44 dokunma hedefinin altında (BL-334) | 25 | medium / moderate | Kısmen — çok ekran; Employees çekmecesine değen kalemler (BL-259) EMP-001'den sonra |
| 16 | G16 | Giriş öncesi, hesap ve workspace ekranları | Kurulumdan çıkan owner boş ızgarayla karşılaşıyor (BL-122) | 16 | medium / moderate | Evet; BL-355 (3) kullanıcı kararı |
| 17 | G17 | Çalışanlar ve kişi kaydı | Telefonda Employees çekmecesinde "Terminate employee" hiç görünmüyor (BL-407) | 16 | medium / risky | Hayır — EMP-001 ile aynı dosyalar; BL-431 ve BL-432 EMP-001 B4 ile kapanır |
| 18 | G18 | Belgeler | Belge çekmecesinde dosya yükleyince kişinin yazdığı son kullanma tarihi ve ek alanlar siliniyor (numarasız madde, program adı U59) | 6 | high / moderate | Evet |
| 20 | G20 | Performans | Schedule ızgarası her çizimde bütün modeli yeniden kuruyor (BL-275) | 3 | medium / moderate | Evet |
| 21 | G21 | Müsaitlik | Yöneticiler arası ortak müsaitlik notu (BL-135) | 3 | medium / safe | Evet |
| 23 | G23 | Ölü kod ve ikiz yollar | SSN kalıntıları duruyor; ROADMAP "SSN yok" diyor (BL-382) | 12 | medium / moderate | Evet; BL-382 silme onayı kullanıcıda |
| 24 | G24 | Geliştirme ortamı ve araçlar | 382 migration dosyası tek tabana sıkıştırılmalı (BL-377) | 16 | medium / risky | Evet (koordinatör + `nf-test`) |
| — | GK | Karar bekleyen | Hesap düğmesi ile workspace değiştirici tek kontrol olsun mu (BL-073) | 1 | low | Kullanıcı kararı (varyantlar hazırlanacak) |
| — | Hosted | Canlı yayın | Vercel projesi eski repoya bağlı; main'e giren hiçbir şey canlıya çıkmıyor (BL-426) | 1 | high / risky | Kullanıcı kararı: şimdilik dokunulmuyor |
| — | GF | FOUNDATION-B dilimlerine bağlı | İlgili dilimle kapanır: FB-6.1b, FB-6.3 izin, FB-6.4 takas, FB-6.6 belgeler, FB-6.8 ayarlar | 9 | medium (üçü risky) | Dilim sırasıyla |
| — | GY | Yol haritası fazları | MVP fazlarının işleri: onboarding yedi adım, Billing/Stripe, landing, Requests, bildirimler | 25 | medium / risky (BL-059, BL-041) | Faz sırası kullanıcı kararı olmadan değişmez |
| — | GS | MVP sonrası | Kiosk, time tracking, payroll | 10 | low / risky (BL-060) | Kapsam dışı |

İşaretler (2026-09-30): 239 açık maddenin hepsi işaretli; 13'ünde bir işaret "belirsiz" (nedeni maddenin altında; liste `BACKLOG-PROGRAM.md` "Sayım"). Dağılım: leave — high 5, medium 77, low 155, belirsiz 2; do — safe 142, moderate 69, risky 16, belirsiz 12; işaretsiz 0.

### 0c. Kullanıcıda bekleyenler (karar, onay, komut)
Soruların uzun metni (seçenekler, öneri) `tasks/BACKLOG-PROGRAM.md` "Kullanıcıya dönüşte" ve "Hosted bekleyen" bölümlerinde.

| # | Tür | Ne bekliyor | Neyi durduruyor |
|---|---|---|---|
| 1 | konuşma | BL-204: Schedule hücresindeki müsaitlik uyarısı nasıl görünsün. İstenen sıra: önce bugünkü davranışın sözlü anlatımı, sonra ekran görüntüleri, sonra konuşma, sonra mockup. Sözlü anlatım verildi (2026-09-30); `nf-gorsel-qa` bugünkü hâlin ekran görüntülerini alıyor | BL-204'ün varyantları (konuşmadan önce hazırlanmaz) |
| 2 | karar (ekran görüntüsünden sonra) | G14 S2 — dar pencerede (yaklaşık 936px) Schedule üst çubuğu iki satıra sarıyor (program adı U08): iki satır kabul mü, tek satıra mı sığsın (öneri: iki satır kabul, yalnız hiza kusuru varsa düzeltilir). `nf-gorsel-qa` görüntüyü alıyor | G14'ün U08 kalemi |
| 3 | karar | BL-437: haftalık e-postayla zamanlanmış dışa aktarma sunucuda çalışıyor ama Schedule → Export penceresinde onu kuracak bölüm yok. (a) bölüm yeni Export paneline taşınsın, (b) özellik MVP'den çıksın ve kodu silinsin | G4'ün kalanı; BL-101'in canlı tetiği anlamını buna göre kazanır |
| 4 | onay | `CLAUDE.md` değişikliği, dört parça: (a) §3 ve §12'de koordinatör kimliği hâlâ `local_243f826b…`, bugünkü `local_460271c1…`; (b) yeni kural "ekran davranışı değişen işte push'tan önce o paketin bütün vitest'i koşulur"; (c) kayıt oturumu kuralı (KARARLAR OPS-04); (d) §11.4 "Tek hat" cümlesi yeni kurala göre: varsayılan tek grup, kullanıcı isterse dosyaları kesişmeyen ikinci iş | Rol oturumları raporu eski adrese gönderebilir; (b) olmadan odaklı test en az iki kez yetmedi |
| 5 | karar | KK-29: lokasyonu yönetip orada çalışmayan yönetici, o lokasyonda kişilere eylem de yapar mı, yalnız görür mü. Not: EMP-001 B bu alanı söküyor; B main'e girince soru düşer (EMP-001 "KARARLAR'da değişecek satırlar") | Hiçbir şeyi; EMP-001 B'ye kadar bugünkü kural geçerli |
| 6 | onay | Ultrareview (yalnız kullanıcı başlatır): FB-6.2 `.7b`, T5b, T5a, G9b, G11, G4–G6 için öneriler duruyor; EMP-001 B ve G8a başlarken yeniden önerilecek | Hiçbir şeyi; ek güvence |
| 7 | karar | BL-426: Vercel'deki proje bu repoya bağlansın mı. Bugün main canlıya çıkmıyor; son canlı yayın 2026-08-05 | G4'ün kalanı (BL-101 saatlik tetik, e-posta denemesi); değişiklikleri canlıda görmek |
| 8 | karar | BL-417: yönetici, kişinin çekmecesinde kendisinin ulaşamadığı lokasyonun adını görsün mü (öneri: görsün). EMP-001'den sonra madde yeniden yazılacak | Employees çekmecesi ve listesindeki lokasyon adları |
| 9 | karar | BL-419: kurulumu bitmemiş workspace'te doğrudan API'den davet gönderilebiliyor (ekranda yol kapalı). Kabul mü, "kurulum bitmeden davet yok" kuralı mı (öneri: kabul) | — |
| 10 | karar | BL-073: hesap düğmesi ile workspace değiştirici tek kontrol olsun mu (görsel; varyantlar gösterilecek) | G16'nın bir kalemi |
| 11 | karar | BL-355 (3): Account → Profile'daki "To save, fill in …" satırı sayfa değişmeden de görünsün mü (öneri: bugünkü gibi kalsın) | G16'nın bir kalemi |
| 12 | onay | BL-105: veritabanı test aracının (pgTAP) yerelde kalıcı kurulumu | G12'nin bir kalemi |
| 13 | onay | BL-382: SSN kalıntılarının (tablo, tür, 410 dönen rota) silinmesi | G23'ün bir kalemi |
| 14 | karar | BL-370: vardiyası olmayan yayın "yayında" sayılsın ve geri alınabilsin mi (öneri: evet) | G10'un bir kalemi |
| 15 | onay | Sürüm atlamaları: vitest, vite, react-router, TypeScript ana sürümleri (yeni bağımlılık sayılır) | — |
| 16 | komut | Uzak dal temizliği: içeriği main'de olan 40 dal (ölçüm 2026-09-30, `bccdb4df`). Komut aşağıda | Dal listesinin okunurluğu; bekledikçe liste büyür |
| 17 | komut | BL-433: dört eski klasördeki kaydedilmemiş rol notları main'e taşındıktan sonra klasörlerin silinmesi (silme kullanıcı komutuyla) | Önce notların karşılaştırılması (koordinatör ya da `nf-test`) |
| 18 | karar (sırası gelince) | K10: onaylı iznin iptalini kim onaylar (FB-6.3 başlamadan); K7: Schedule ekran turunun günü (FB-6.1 `.0`) | FB-6.3 ve FB-6.1 kapanışı (§5) |

Uzak dal silme komutu (PowerShell; kullanıcı çalıştırır). 36 dalda main'de olmayan yama yok; son dört dalın (`g4`, `g5`, `g9b-shorten`, `g12`) içeriği main'de başka commit olarak var (`BACKLOG-PROGRAM.md` "Uzak dal silme listesi"). Yerel `keep/fb62-8-save-pattern` dalına dokunmaz.
```powershell
Set-Location C:\Users\TheWe\Documents\Codex\newfork-clean
git push origin --delete batch/t1 merge/account task/account-redesign task/batch-t1 task/batch-t1b task/batch-t2 task/batch-t3 task/batch-t4 task/batch-t4b task/batch-t5 task/batch-t5b task/batch-t5c task/fb62-10 task/fb62-7b-db task/fb62-7b-qa-db task/fb62-7b-qa-fixes task/fb62-9-red-files task/fb62-core-a task/fb62-core-a-t5b task/fb62-core-a-t5b-2 task/fb62-core-a-t5b-3 task/fb62-core-a-t5b-4 task/fb62-core-b-7a task/fb62-core-b-7b task/fix-g5-timing-test task/g1-error-states task/g1-schedule-dialogs task/g1-schedule-dialogs-rebased task/g13-test-stability task/g19-today-helper task/g2-quick-editor task/g22-tooltip-note-corner task/g3-stale-screens task/g6-notification-delivery task/g9-timeoff-exchange task/g9b-qa-fixes task/g4-scheduled-export task/g5-account-security task/g9b-shorten-time-off task/g12-pgtap-resilience
```

### 0d. Kayıt oturumu çalışma notu (devir 2026-09-30; yeni oturum buradan başlar)
İlk oturum bağlamının yarısını envanterde dosyaları baştan sona okuyarak harcadı. Tekrarlanmasın.

**(a) Okunacak en az şey**
- `.claude/agents/nf-planlama.md` (34 satır); `KARARLAR.md`'de yalnız OPS-04 satırı (`grep -n "^| OPS-04" docs/plan/KARARLAR.md`).
- Bu dosyanın yalnız §0'ı (0a–0d). §1–§9 FOUNDATION-B puan tablosu; bir dilim main'e girmedikçe açılmaz.
- `tasks/BACKLOG-PROGRAM.md` (~65 bin token, tamamı okunmaz): "Sayım"ın ilk maddesi, "Satırın anlamı" ve "Program dışı yürüyen iş" paragrafları, Notes / Result'ın ilk 5 kaydı. Başlıklar `grep -n "^#"`, sonra `sed -n 'N,Mp' <dosya> | cut -c1-400`. G7 satırı tek başına 9 bin karakter.
- `BACKLOG.md` okunmaz; madde `grep -n "^- \*\*BL-NNN " docs/plan/BACKLOG.md` ile bulunur. `HANDOFF.md` koordinatörün.
- Yürüyen işler: `tasks/EMP-001.md` ve `tasks/G14.md`'de yalnız Status, kararlar tablosu, Notes / Result.

**(b) Bir BESLEME'yi işleme sırası**
1. `git fetch origin`; ağaç temizken worktree `origin/main`'e getirilir (uygulamanın taban dalıyla eşitleme aracı).
2. Her iddia ölçülür: commit `git merge-base --is-ancestor <sha> origin/main`; CI `gh run view <id> --json conclusion,headSha,jobs`; dal `git ls-remote --heads origin <dal>` ve `git worktree list`; en yüksek numara `git grep -ho "BL-4[0-9][0-9]" origin/main -- docs/plan | sort -u | tail -1`. Ölçülemeyen "ölçülmedi" yazılır; uyuşmazlık koordinatöre söylenir.
3. Yazma sırası: `BACKLOG.md` (madde, kapanış, alt satır; yeni maddede "Program: Gxx") → `DONE.md` (iş bittiyse) → görev dosyası (Status, Notes) → `BACKLOG-PROGRAM.md` (grup satırı, Notes'un başına kayıt, gerekirse "Sayım") → `KARARLAR.md` (kullanıcı kararıysa) → `ROADMAP.md` ve `FOUNDATION-B.md` Notes (dilim main'e girdiyse) → en son bu dosyanın §0'ı.
4. Sayım, repo kökünden: `MSYS_NO_PATHCONV=1 git show keep/nf-planlama-memory:.claude/agent-memory/nf-planlama/backlog_sayim.py > /tmp/backlog_sayim.py && python /tmp/backlog_sayim.py` (dal main'e alındıysa `python .claude/agent-memory/nf-planlama/backlog_sayim.py`). Beklenen (2026-09-30, `80767d88`): açık 239 (210 + 29), kapanan 225 (187 + 38), en yüksek BL-437, işaretsiz 0, "açık ama grupsuz" yalnız BL-426.
5. Koordinatöre tek satır: commit sha + ne güncellendi + uyuşmazlık.

**(c) Gönderim ve tuzaklar**
- Gönderim: commit → `git fetch origin && git rebase origin/main` → `git diff --name-only origin/main..HEAD | grep -vc '^docs/'` 0 olmalı → `node scripts/lock.mjs take main "nf-planlama/kayit, docs push"` → `git push origin HEAD:main` → `node scripts/lock.mjs release main "nf-planlama/kayit"`. Docs gönderimi CI tetiklemez.
- GateGuard kancası: oturumun ilk Bash'i, her yeni dosya ve yıkıcı görünen her komut (`git checkout --`, dal değiştirme içeren zincir) önce reddedilir; istenen gerçekler yazılıp aynı çağrı yinelenir. Var olan betik dosyasının üstüne yazmak yeni reddi önler.
- Satır sonu: `docs/plan` çalışma kopyasında CRLF. Python'da `newline=""` ile oku, aynı satır sonuyla yaz. `sed -i` dosyayı LF'ye çevirir (zararsız, git uyarı verir).
- Çok dosyalı düzenleme tek betikle: her çapa `assert` ile tam bir kez bulunur, hepsi geçince yazılır. §0c numaraları betikle yeniden verilir.
- Başka ajanın docs commit'i `git cherry-pick <sha>` ile alınır. Çakışmada iki tarafın bilgisi kalır (madde satırındaki işaret bizden, yeni alt satır onlardan; grup satırında kapsam notu onlardan; Notes'ta iki kayıt da). Önce yalnız çakışma çözülür ve `git -c core.editor=true cherry-pick --continue`; kendi eklemeler ayrı commit; sonra sayım.
- Numara çakışması: başka dalda açılmış yeni BL, main'deki en yüksek numarayla aynıysa yeniden numaralanır ve söylenir (2026-09-30'da çakışmadı).
- Başka bir ajan bir grubu ölçerken o grubun madde satırlarına dokunulmaz.
- Git Bash: `git rev-parse --short A B` hata verir, tek tek çağır; `<dal>:<yol>` biçimi `MSYS_NO_PATHCONV=1` ister; `rev` komutu yok.
- Rol hafızası `docs/` dışında: `keep/nf-planlama-memory` dalına commit, sha koordinatöre; main'e o alır.

**(d) Açık işler**
- `keep/nf-planlama-memory` @`2fe1e1a8` (iki commit: rol hafızası, sayım betiği ve dersler): koordinatör bir sonraki kod gönderiminde alacak.
- 13 "belirsiz" işaret (liste `BACKLOG-PROGRAM.md` "Sayım"): madde başlarken ya da karar gelince netleşir.
- Birleştirme önerisi: "Genel seed/SQL replay" (U04) ile BL-083 aynı iş. Bayat görünen kısımlar: BL-057'de "Time Tracking gizlenir", OBS-001'de davet kısmı. Kapatılmadı; koordinatöre söylendi.
- `CLAUDE.md` onay listesi (a–d) ve 40 uzak dalın silme komutu: §0c ve altındaki blok.
- `task/g14-plan` dalı ve `agent-a4489d63f38f27eeb` worktree'si kapanabilir (içerik main'de `33bf0b2b`); silme koordinatörün ya da kullanıcının.
- FB-6.2 `.11` kapanınca: §1 ve §3 puan tablosu, `.8` etiketli maddelerin tazeliği (BL-402, BL-403, BL-418, BL-422, BL-425), `ROADMAP.md` durum satırı.

**(e) Envanter raporu:** `docs/plan/research/kayit-envanter-2026-09-30.md` (ilk kayıt oturumunun ilk iş raporu; 2026-09-30, `bccdb4df`; o günden sonra kayıtların hepsi güncellendi, rapor tarihçe içindir). İlk kayıt oturumunun worktree'si `youthful-montalcini-5c90e3` kapanıyor; oradaki gitignore'lu üç raporun yedeği `C:/Users/TheWe/Documents/Codex/newfork-wt/coord/artifacts/from-youthful-montalcini-5c90e3/` altında (envanter raporunun aslı, `nf-backend/7b/RAPOR.md`, `nf-backend/7b-qa/RAPOR.md`; yedek klasörü de gitignore'da). Main'deki belgelerde iki `nf-backend` raporuna yol atfı yok (`git grep`, `d1dd2327`).

Hazırlayan: `nf-planlama` (`local_c67b8d60-…`). Koordinatör: "Koordinatör el değiştirmesi", `local_243f826b-1906-491b-b1fc-1a1bdbb4316d` (2026-09-29'dan; CLAUDE.md main `3fa8bc7f`).
Ölçüm: `origin/main` `228ff3b7`, 2026-09-29 (BL-218.3 kapandı: `.3-i`, `.3a`, `.3b`, `.3-ii` main'de `be46cd22`, main CI run 36522159307 yeşil — e2e işi bir kez yeniden koşturuldu, `tasks/BL-218.md` → Notes; üstüne hedef dışı Schedule sağ üst pencereler `228ff3b7`, FOUNDATION-B tablosunu değiştirmez). Önceki ölçüm `de80eda6`, 2026-09-28 (BL-199 kapandı, main CI yeşil run 36501225426; `10c11be5`'ten bu yana main'e yalnız BL-199 ve plan commit'leri girdi, FOUNDATION-B tablosu değişmedi); önceki ölçüm `10c11be5` (SEC-003 kod kısmı `721ea41f`, main CI yeşil run 36445247470; hosted gönderim aynı gün, koordinatör); SEC-003 commit'leri `34fc2075`, `3eeb4c11` (`nf-db`), `6887fbbc` (`nf-backend`), `d0751603`, `0d03389e`, `74e2d363` (`nf-test`) — hepsi `git cat-file` ile doğrulandı; durumlar koordinatörün 2026-09-28 güncellemesiyle. Hesap betiği: satırlar, bağımlılıklar ve puanlar bu dosyadaki tablolardır; sayıları elle değil betikle ürettim, tablo değişince aynı yolla yeniden hesaplanır.

**Güncelleme kuralı (3 satır):**
1. Tablo her main birleşmesinde, her karar cevabında ve işi durduran her bulguda yeniden hesaplanır (durum, yüzde, sıra, karar ağırlığı).
2. Her yeniden hesapta koordinatöre 3 satır gider: ne değişti · hedef yüzdeleri · sıradaki iş ve neden (hesabın üç sayısıyla).
3. Tek hat (CLAUDE.md §11.4/§11.6, `1d349d2a`): aktif hedef bitene kadar yalnız o; sıradaki iş bu tablodan gelir. Hedef dışı iş yalnız kullanıcı kararıyla araya girer (§7).

## Büyüklük ölçütü (puan)
| Puan | Ölçüt (en yüksek tutan satır geçerli) | Kabaca süre (tahmin) |
|---|---|---|
| 1 | Tek katman, 1–2 dosya; test yok ya da tek test; kayıt, ölçüm, kapanış | ≤ ½ gün |
| 2 | Tek katman, ≤ 5 dosya; birim testleri | ~1 gün |
| 3 | İki katman (ör. DB + pgTAP, API + web) ya da ≤ 10 dosya; ya da tek e2e senaryosu | ~2 gün |
| 5 | Üç katman ya da sözleşme değişikliği (shared tip + API + web) ya da migration + e2e | 3–4 gün |
| 8 | Dört katman (DB + API + web + ekran) ya da birden çok migration + e2e; daha büyüğü bölünür | ~1 hafta |
Katman: DB (migration/pgTAP) · API · web veri katmanı · ekran (görünüm/metin) · e2e. Görev dosyası olmayan dilimler için puan, FOUNDATION-B dilim tablosundaki kişi-hafta orta noktası × 8'dir ve **tahmin** diye işaretlidir; görev dosyası yazılınca adımlara bölünür.
Durum: bitti (main'de) · incelemede (commit var, ONAY ya da birleştirme bekliyor) · sürüyor · hazır (önünde bekleyen satır ve karar yok) · bekliyor.

## 1. Hedefler ve ilerleme (biten puan ÷ toplam puan)
| Hedef | Biten / toplam | Yüzde | Not |
|---|---|---|---|
| SEC-003 hesap güvenliği paketi | 26 / 26 | **%100 — bitti** (2026-09-28, `10c11be5` + hosted) | Hedef kapandı; yayın öncesi şartlar §8'de. |
| **FOUNDATION-B — Aşama 6–7** (**aktif**, 2026-09-28'den) | 124 / 230 | **%53,9** (2026-09-30, `bccdb4df`: FB-6.2 `.1`–`.10`'un 38 puanı main'de, `.11`'in 1 puanı açık; önceki 86 / 230 = %37,4, 2026-09-29, `228ff3b7`; önceki %33,5 FB-6.2.0'ın 1 puanını saymıyordu, betik 78 buldu; BL-218.3 +8) | Bitenlerin 61 puanı FB-6.1'in 14 adımının geriye dönük puanı (tahmin). Açık dilimlerden FB-6.4–6.8 ve Aşama 7 görev dosyasız (tahmin, 44 puan). |
| FOUNDATION-B — program geneli (bilgi) | 202 / 308 | %65,6 (tahmin, 2026-09-30; önceki 164 / 308 = %53,2, 2026-09-29) | Aşama 1–5 bitti; plandaki süre orta noktaları × 8 = 78 puan sayıldı. Eski "~%58" formülünün yerine geçer; ikisi farklı ölçü, karşılaştırılmaz. |

## 2. İş tablosu — SEC-003 (bitti 2026-09-28; kayıt için)
Kaynak: `tasks/SEC-003.md`, koordinatör girdisi 2026-09-28, dallar yukarıda.
| ID | Ne (kişi için) | Bağlı olduğu | Karar | Puan | Durum | Rol | Ana dosyalar |
|---|---|---|---|---|---|---|---|
| S.0 | Görev dosyası ve kararlar | — | — | 1 | bitti | `nf-planlama` | `tasks/SEC-003.md` |
| S.1a | Eski parolasız hesap silme yolu veritabanından kalkar; davet kabulü onaylı e-posta ister | — | — | 3 | bitti (`721ea41f`) | `nf-db` | `supabase/migrations`, `supabase/tests` |
| S.1b | Onaysız hesap davet listesini görmez, reddedemez (`3eeb4c11`); yerel `enable_confirmations`; D-1 | S.1a | — | 2 | bitti (`721ea41f`) | `nf-db` | `supabase/migrations`, `supabase/config.toml` |
| S.A | Account → Workspaces'te kapatma ve sahiplik devri parolayı sunucuda sorar (#3; planlı kapatma "Close at end of period" penceresine var olan parola alanı gelir, iki ölü `reauthentication_required` dalı silinir; ortak yardımcı `apps/api/src/auth/verify-password.ts`, hata anahtarı `session.password_incorrect` S.B ile ortak); eski silme rotaları kalkar (#4, `6887fbbc`) | — | — | 5 | bitti (`721ea41f`) | `nf-backend` | `apps/api/src/account/workspace-account-*`, `apps/api/src/auth/verify-password.ts`, `packages/shared`, `apps/web/src/lib/supabase.ts`, `WorkspacesPage.tsx` |
| S.B | Davet, silinen hesabın kilidini açmaz (#1); Account → Security'de parola değişimi mevcut parolayı ister (#2; hata anahtarı `session.password_incorrect`, S.A ile ortak); O-1 ve testi; davet kabulünün API tarafı ve görünen ad (#9) | S.1a | — | 5 | bitti (`721ea41f`) | işçi oturumu (`nf-backend` kuralları) | `apps/api/src/employees/invitation-service.ts`, `employee-create-service.ts`, `apps/api/src/account/account-security-*`, `apps/api/src/app.ts` |
| S.C | Uçtan uca: parola değişimi ve devir parolayla; yeni owner yerel posta kutusundan e-postasını onaylar | — | — | 3 | bitti (`721ea41f`) | `nf-test` | `e2e/**`, `.github/workflows/ci.yml` |
| S.D | Ekran metinleri: "e-postanı doğrula" ve "parola yanlış" | S.A, S.B | — | 2 | bitti (`721ea41f`) | `nf-arayuz` | giriş/kayıt ekranı, Account → Security |
| S.E | Birleştirme: tam kapı, `nf-guvenlik`, `nf-gorsel-qa` (Account → Workspaces'te ekran değişti), ultrareview önerisi (kullanıcı 2026-09-28: ultrareview istemedi), yerel auth yeniden başlatma (kullanıcı izin verdi) | S.1b, S.A, S.B, S.C, S.D | — | 3 | bitti (`721ea41f`) | koordinatör | — |
| S.F | Hosted: BL-265 — `20260928040000` + `20260928050000` gönderimi (D1 sayımı 0/0, koordinatör 2026-09-28; "Confirm email" kullanıcı tarafından açıldı, K22 kapandı). **Yayın öncesi şart:** hosted e-posta teslimatı (SMTP, saatlik sınır) ölçülür ve S.D'nin "e-postanı doğrula" ekranı main'de; **BL-283** API parola doğrulamasına hesap başına deneme sınırı (kullanıcı kararı 2026-09-28; SEC-003 kapsamı dışında, yüzdeye girmez) — hepsi web/API yayınından önce | S.E | — | 2 | bitti (hosted 2026-09-28) | koordinatör + kullanıcı (gönderim onayı) | hosted |

## 3. İş tablosu — FOUNDATION-B Aşama 6–7 (aktif hedef)
Kaynak: `tasks/FOUNDATION-B.md` dilim tablosu, `FB-6.1.md`, `FB-6.1b.md`, `BL-218.md`, `FB-6.2.md`, `FB-6.3.md`; durumlar `origin/main` `228ff3b7` (2026-09-29).
| ID | Ne (kişi için) | Bağlı olduğu | Karar | Puan | Durum | Rol | Ana dosyalar |
|---|---|---|---|---|---|---|---|
| F.can | Web'de tek yetki yardımcısı `can()` (FB-6.0-can) | — | — | 5 (tahmin) | bitti | `nf-backend` | — |
| F.61 | FB-6.1 Schedule'ın bitmiş 14 adımı (`.1`–`.12`) | — | — | 61 (geriye dönük tahmin) | bitti | çok rol | — |
| FB-6.1.0 | Schedule ekran turu: kullanıcı ekranları gezer, sorunları söyler | — | K7 | 2 | bekliyor | koordinatör + kullanıcı | — |
| FB-6.1.13 | Schedule'da seçilen görsel varyantlar uygulanır | FB-6.1.0 | — | 3 | bekliyor | `nf-arayuz` | `apps/web/src/schedule/**` görünüm |
| FB-6.1.14 | FB-6.1 kapanışı | FB-6.1.13 | — | 2 | bekliyor | koordinatör | `tasks/FB-6.1.md` |
| BL-218.1 | Management/Owner kırmızı testleri | — | — | 3 | bitti | `nf-db` | — |
| BL-218.2 | Management/Owner veritabanı kuralları | — | — | 8 | bitti | `nf-db` | — |
| BL-218.3-i | Settings → Jobs okumasında sistem kimliği (`system_key`) ve DB'nin dört yeni "hayır"ı için okunur İngilizce hata cümleleri (DB'siz) | — | Böl, aynı anda yürüt | 2 | bitti 2026-09-29 (`73cd561c`; main `be46cd22`) | `nf-backend` | `packages/shared`, `apps/api/src/settings`, `apps/web/src/settings/organization-data.ts`, API hata eşlemesi |
| BL-218.3a | Takvim ve çekmece referans okumasına departman/iş `system_key`, katı `primary_job_id`, işlere departman; pgTAP, ızgara <50 ms (`.5a`'nın DB yarısı dahil) | — | Böl, aynı anda yürüt | 3 | bitti 2026-09-29 (`ab483d2a` … `22a1a547`; `.3b` kayıt kuralı `37d8c046`, `11899af4` dahil; hosted 5 migration kullanıcıda gönderildi) | `nf-db` | `supabase/migrations` (`get_schedule_read_model_service`, `read_employee_references_service`) |
| BL-218.3-ii | Takvim ve referans tipleri, API geçirme, Management'ı bulan saf yardımcı; yalnız Owner işi olan owner'da yeni vardiyanın varsayılan işi | BL-218.3a | Böl, aynı anda yürüt | 3 | bitti 2026-09-29 (`fc7ec76e`, `ef4f640c`, `be46cd22`) | `nf-backend` | `packages/shared`, `apps/api/src/schedule`, `apps/web/src/schedule/*-data`, `shiftEditorState.ts`, `apps/web/src/employees/*-data` |
| BL-218.4 | Kurulum sihirbazında "en az 1" metni; Settings → Jobs'ta kilitli Owner satırı | BL-218.3-i | — | 3 | hazır | `nf-arayuz` | `OwnerOnboardingPage.tsx`, Settings → Jobs |
| BL-218.5a | Employees çekmecesinin iş listesi için departman ve Owner bilgisi (okuma) | — | Böl, aynı anda yürüt | 0 | kapandı 2026-09-28: DB yarısı `.3a`'ya, `nf-backend` yarısı `.3-ii`'ye katıldı (3 puan oraya taşındı) | — | — |
| BL-218.5b | Çekmecede iş listesi departmana göre gruplu, Owner kilitli (DEV varyantları) | BL-218.3-ii | — | 3 | EMP-001'e taşındı 2026-09-30 (EMP-001 K6); puanı burada duruyor, EMP-001 ile kapanır | `nf-arayuz` | `EmployeeDrawer.tsx` |
| BL-218.6 | Takvim'de "By department", Management grubu, iki satır, tek sayım | BL-218.3-ii | — | 5 | hazır | `nf-arayuz` (+ `nf-backend`) | `apps/web/src/schedule/**` |
| BL-218.7 | e2e: kurulum → çekmece → By department | BL-218.4, .5b, .6 | — | 3 | bekliyor | `nf-test` | `e2e/flows/**` |
| FB-6.1b.1 | Açık düzenleme tutmadığı lokasyona vardiya ekleyemez (BL-159) | — | — | 3 | hazır | `nf-db` | `supabase/migrations` (`apply_schedule_template_service`) |
| FB-6.1b.2 | Boş yeni taslakta "yayınlanmışları soluk göster" anahtarı (DEV varyantları) | — | — | 3 | hazır | `nf-arayuz` | `SchedulePage.tsx`, schedule CSS |
| FB-6.1b.3 | e2e iki senaryo | FB-6.1b.1, .2 | — | 3 | bekliyor | `nf-test` | `e2e/flows/**` |
| FB-6.2.0 | Çalışanlar dilimi taze ölçüm (FB-6.1 işlevsel kısmı ve BL-139 main'de) | — | — | 1 | bitti 2026-09-28 (`756af40c` ölçüm; `nf-test` koşusu `2fed2144`: `employee_hub` 13/13, `roles_permissions_rls` 42/47) | `nf-planlama` (+ `nf-test` koşu) | `tasks/FB-6.2.md` |
| FB-6.2.1 | Yetki matrisi: ikinci admin, "yalnız yönetir", lokasyondan çıkarma | FB-6.2.0 | — | 3 | bitti 2026-09-29 (T5a, main `b6c8d766`) | `nf-db` | `supabase/tests/authorization_matrix.test.sql` |
| FB-6.2.2 | Veri modeli: "yalnız yönetir", "kendi lokasyonundan çıkar" komutu | FB-6.2.1 | — | 5 | bitti 2026-09-29 (T5a, main `b6c8d766`) | `nf-db` | `supabase/migrations` |
| FB-6.2.3 | Çalışan okuma ve listesi çekirdeğe | FB-6.2.2 | — | 3 | bitti 2026-09-29 (T5a, main `b6c8d766`) | `nf-db` | `supabase/migrations` |
| FB-6.2.4 | Çalışan yazmaları çekirdeğe (kaydet, çıkar, arşiv, erişim, rol) | FB-6.2.3, BL-218.3 | — | 5 | bitti 2026-09-30 (T5b, main `da8e3dc0`) | `nf-db` | `supabase/migrations` |
| FB-6.2.5 | Davet çekirdeğe | FB-6.2.4 | — | 3 | bitti 2026-09-30 (T5b, main `da8e3dc0`) | `nf-db` (+ API imza) | `supabase/migrations`, `invitation-service.ts` |
| FB-6.2.6 | İş katalogu ve pano çağıranları çekirdeğe; BL-187 | FB-6.2.5 | — | 3 | bitti 2026-09-30 (T5b, main `da8e3dc0`) | `nf-db` | `supabase/migrations` |
| FB-6.2.7 | API ve web veri: lokasyondan çıkarma ucu, `can()` geçişi, "Çalışan görünümüne geç" rotası | FB-6.2.6 | — | 5 | bitti 2026-09-30 (`.7a` T5b `da8e3dc0`; `.7b` T5c `0806cc62`, QA düzeltmesi `809592bc`) | `nf-backend` | `employee-directory-routes.ts`, `App.tsx`, employees data |
| FB-6.2.8 | Employees ekranı: "Kendi lokasyonundan çıkar", "Yalnız yönetir", etiketler (DEV varyantları) | FB-6.2.7 | — | 5 | bitti 2026-09-30 (`48a9d139`, `3f034462`; "yalnız yönetir" alanı EMP-001 B'de sökülecek) | `nf-arayuz` | `EmployeeDrawer.tsx`, `EmployeesPage.tsx` |
| FB-6.2.9 | Kırmızı dosyalar yeşile (`roles_permissions_rls` #3, #7, #30, #35, #46) | FB-6.2.6 | — | 3 | bitti 2026-09-30 (`af2ef900`) | `nf-test` | `supabase/tests/**`, `ci-green.txt` |
| FB-6.2.10 | e2e: davet ve kapsam akışları | FB-6.2.7 | — | 3 | bitti 2026-09-30 (`9f1cc3b3`; main CI 36696339068 yeşil) | `nf-test` | `e2e/flows/invite.spec.ts` |
| FB-6.2.11 | FB-6.2 kapanışı | FB-6.2.8, .9, .10 | — | 1 | bekliyor (EMP-001 dilim A bitince; koordinatör) | koordinatör | `tasks/FB-6.2.md` |
| FB-6.3.0 | İzin dilimi taze ölçüm | FB-6.2.11 | — | 1 | bekliyor | `nf-planlama` | `tasks/FB-6.3.md` |
| FB-6.3.1 | Yetki matrisi: izin oylaması ve iptal | FB-6.3.0 | K10 | 3 | bekliyor | `nf-db` | `supabase/tests` |
| FB-6.3.2 | İzin talebinden lokasyon kalkar (sözleşme) | FB-6.3.1 | — | 5 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.3.3 | Oylama motoru | FB-6.3.2 | — | 5 | bekliyor | `nf-db` | `supabase/migrations`, `time_off_voting.test.sql` |
| FB-6.3.4 | Kalan izin yardımcıları ve bildirim alıcıları çekirdeğe | FB-6.3.3 | — | 3 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.3.5 | API ve web veri: lokasyonsuz izin, oy durumu | FB-6.3.2 | — | 5 | bekliyor | `nf-backend` | `schedule-requests-routes.ts`, web data |
| FB-6.3.6 | Requests → Time off ekranı: oy durumu (DEV varyantları) | FB-6.3.5 | — | 3 | bekliyor | `nf-arayuz` | `ScheduleRequestsPage.tsx` |
| FB-6.3.7 | Kırmızı izin dosyası yeşile | FB-6.3.4 | — | 2 | bekliyor | `nf-test` | `supabase/tests` |
| FB-6.3.8 | e2e: izin akışı | FB-6.3.6 | — | 3 | bekliyor | `nf-test` | `e2e/flows/time-off.spec.ts` |
| FB-6.3.9 | FB-6.3 kapanışı | FB-6.3.7, .8 | — | 1 | bekliyor | koordinatör | `tasks/FB-6.3.md` |
| FB-6.4 | Takas / Shift Hub: uygunluk motoru (görev dosyası yok) | FB-6.2.11 | — | 11 (tahmin) | bekliyor | çok rol | — |
| FB-6.5 | Availability çekirdeğe (görev dosyası yok) | FB-6.2.11 | — | 3 (tahmin) | bekliyor | çok rol | — |
| FB-6.6 | Belgeler / onboarding çekirdeğe (görev dosyası yok) | FB-6.2.11 | — | 8 (tahmin) | bekliyor | çok rol | — |
| FB-6.7 | Duyurular / önemli tarihler / bildirimler (görev dosyası yok) | FB-6.2.11 | — | 5 (tahmin) | bekliyor | çok rol | — |
| FB-6.8 | Ayarlar / hesap / workspace yaşam döngüsü (görev dosyası yok; en sonda) | FB-6.3.9, FB-6.4–6.7 | — | 9 (tahmin) | bekliyor | çok rol | — |
| A7 | Aşama 7: tek migration tabanı + hosted yeniden kurulum | FB-6.8, FB-6.1.14, FB-6.1b.3, BL-218.7 | — | 8 (tahmin) | bekliyor | `nf-db` + koordinatör + kullanıcı | `supabase/migrations`, hosted |

## 4. Sıradaki iş hesabı (yalnız "hazır" satırlar)
**2026-09-30 notu:** aşağıdaki hesap 2026-09-29 sabahına aittir. FB-6.2 `.1`–`.10` bitti; sıra bugün §0'dan ve `tasks/BACKLOG-PROGRAM.md`'den okunur. Tablo FB-6.2 `.11` kapanınca yeniden hesaplanır.
Sıralama: (i) arkasında bekleyen toplam puan (satırdan sonra zincir boyunca gelen bütün satırlar) → (ii) doğrudan açtığı satır sayısı → (iii) küçük puan.
| Sıra | ID | Hedef | (i) arkasında (satır) | (ii) doğrudan açtığı | (iii) puan |
|---|---|---|---|---|---|
| **1** | **FB-6.2.1** | FOUNDATION-B (aktif) | 111 (26) | 1 | 3 |
| 2 | BL-218.4 | FOUNDATION-B (aktif) | 11 (2) | 1 | 3 |
| 2 | BL-218.5b | FOUNDATION-B (aktif) | 11 (2) | 1 | 3 |
| — | FB-6.1b.1 | FOUNDATION-B | 11 (2) | 1 | 3 |
| — | FB-6.1b.2 | FOUNDATION-B | 11 (2) | 1 | 3 |
| — | BL-218.6 | FOUNDATION-B | 11 (2) | 1 | 5 |
FB-6.1.0 hazır sayılmaz: K7'yi (ekran turu günü) bekliyor.
**Gerekçe (yeniden hesap 2026-09-29, BL-218.3 bitti `be46cd22`):** Hesapta tek başına öne çıkan **FB-6.2.1** (yetki matrisi: ikinci admin, "yalnız yönetir", lokasyondan çıkarma): Çalışanlar, İzin, Ayarlar dilimleri ve Aşama 7 (26 satır, 111 puan) arkasında. FB-6.2.0 bitmişti (`756af40c`), BL-218.3 de kapanınca FB-6.2 zincirinin önünde bekleyen tek şey FB-6.2.1–.3; FB-6.2.4 artık yalnız FB-6.2.3'ü bekliyor. Geri kalan beş hazır satırın hepsi 11 puan açıyor (BL-218.7 → A7 ya da FB-6.1b.3 → A7); eşitlikte küçük puan önde: BL-218.4 ve BL-218.5b (3), BL-218.6 (5) en sonda. **Sıradaki iş hesaptan: FB-6.2.1 ∥ BL-218.4 / BL-218.5b** — dosya paylaşmıyorlar (§6). Backlog'dan kritik madde yok; yeni yüksek madde BL-316 (Schedule → Export önizlemesi 500, BL-218.3'ten önce de vardı) koordinatörce önerilecek.
**Önceki gerekçe (yeniden hesap 2026-09-28, SEC-003 bitti; kayıt için):** Aktif hedef artık FOUNDATION-B. Hesapta ilk sırada **BL-218.3**: FB-6.2.4 onu beklediği için Çalışanlar, İzin, Ayarlar dilimleri ve Aşama 7 (29 satır, 120 puan) arkasında; doğrudan 4 satırı açıyor. İkinci **FB-6.2.0**: neredeyse aynı zinciri (114) tek puanlık bir ölçümle başlatıyor, BL-218.3 ile dosya paylaşmıyor. FB-6.1b.1 ve .2'nin arkasında yalnız 11 puan var. **Durum 2026-09-28 (yeniden hesap, BL-199 kapandı `de80eda6`):** BL-199 hedef dışıydı ve yüzdeye girmiyordu; FOUNDATION-B tablosunda satır değişmedi, bu yüzden sayılar aynı (120 / 114). **Sıradaki iş hesaptan: BL-218.3 ∥ FB-6.2.0** — ikisi dosya paylaşmıyor, aynı anda gidebilir (§6). Backlog'dan kritik madde yok; yüksek olup kolaylaşan BL-293 (Schedule hızlı düzenleyicisinde klavye odağı) koordinatörce önerilecek.

## 5. Kararlar (açık; sorma sırası = durdurduğu puan)
| Sıra | K | Soru | Durdurduğu satırlar | Toplam puan |
|---|---|---|---|---|
| 1 | K10 | FB-6.3 S4 — onaylı iznin iptalini kim onaylar | FB-6.3.1 ve ardındaki 10 satır | 47 |
| 2 | K7 | FB-6.1 ekran turu günü | FB-6.1.0, .13, .14, A7 | 15 |
| — | K19, K20, K21, K23, K15, K24 | BL-238 saat dilimi · BL-255 · BL-254 · denetim sırasının yeri · faturalama · K24: kurulumu bitmemiş workspace'ten davet gitmişse kapatma yine parolasız kalsın mı (BL-284; tek hat gereği SEC-003'ten sonra sorulur) | aktif hedeflerde satır yok | 0 |
**Not:** K10'un satırları FB-6.2 bittikten sonra başlar. Ağırlık en yüksek olsa da cevap FB-6.3.1'e kadar gerekmez. **K22 kapandı 2026-09-28:** kullanıcı hosted panelde "Confirm email"i ve "Require current password / Secure password change"i açtığını yazdı (koordinatör penceresi); S.F artık yalnız S.E'yi bekliyor. Aktif hedefi (SEC-003) durduran açık karar kalmadı. **Kararlar tablosu dışında açık onay:** S.F için hosted gönderim onayı (kullanıcının kendi "evet"i; CLAUDE.md §8) — koordinatör soruyor.

## 6. Paralel yerleşim (aynı anda en çok 2 ağır iş)
- **Şimdi (2026-09-29, BL-218.3 kapandı):** FB-6.2.1 (`nf-db`; `supabase/tests/authorization_matrix.test.sql`, `db.lock`) ile BL-218.4 / BL-218.5b (`nf-arayuz`; `OwnerOnboardingPage.tsx`, Settings → Jobs, `EmployeeDrawer.tsx`) dosya paylaşmıyor, aynı anda gidebilir. BL-218.5b ile BL-218.6 ikisi de `nf-arayuz` ve ekran işi: aynı rol sırayla. FB-6.1b.1 FB-6.2.1–.6 ile aynı `supabase` ailesinde, aynı anda değil. **Ağır iş sınırı (2026-09-29 dersi):** CI e2e koşarken yerel e2e ve görsel QA sunucuları üst üste binince main CI e2e'si yanlış kırmızı verdi (BL-321); yerel e2e, main CI bitmeden başlatılmaz.
- **Eski (2026-09-28, BL-199 kapandı):** sıradaki iki hazır satır BL-218.3 ve FB-6.2.0; aşağıdaki satıra göre aynı anda gidebilir.
- **İlk iki hazır satır:** BL-218.3 (`nf-backend`; `packages/shared`, `apps/api/src/schedule`, web schedule/employees veri dosyaları) ile FB-6.2.0 (`nf-planlama` ölçümü + bir `nf-test` koşusu, `roles_permissions_rls` ve `employee_hub`) **dosya paylaşmıyor**; ikisi aynı anda gidebilir. Ağır iş yalnız FB-6.2.0'ın `test:db` koşusu (`db.lock`).
- FB-6.1b.1, BL-218.3a ve FB-6.2.1–6.2.6 aynı `supabase/migrations` ailesine yazar: aynı anda tek `nf-db` adımı. BL-218.3-i (`nf-backend`) ile BL-218.3a (`nf-db`) dosya paylaşmaz, aynı anda gider (kullanıcı kararı 2026-09-28); BL-218.3-ii `.3a`'nın sözleşmesini bekler.
- SEC-003'ün paralel yerleşim notları (S.A/S.B ortak dosyası) iş kapandığı için düştü.

## 7. Hedef dışı (tek satırlık özet)
- **Schedule sağ üst pencereler (stil B)** (kullanıcının tekil oturumu, kullanıcı kararı 2026-09-28): **bitti 2026-09-29** — main `5a92d2f2` + `228ff3b7`, tam kapı yeşil (288 test dosyası), Schedule e2e 8/8, ONAY `nf-guvenlik` + `nf-gorsel-qa` @258003e1. Hedef dışı, yüzdeye girmez. Yan bulgular BL-318..320, BL-311 ve BL-299 notları.
- **BL-199** (müdür Schedule'da vardiyaya not yazamıyor): **bitti 2026-09-28, 12/12 puan** — main `de80eda6`, main CI yeşil run 36501225426 (check, db, e2e success — `nf-planlama` `gh run view` ile doğruladı); görev dosyası `tasks/BL-199.md` → Result. Hosted gönderim `20260928060000` yapıldı 2026-09-29 (§8); iki eski dalın (`task/bl-199-ui`, `task/note-mark-r3`) silinmesi kullanıcıya soruluyor. Hedeflerin dışındaydı; yüzdelere girmez.
- **MVP'nin kalan fazları:** F0 (OPS-010, SEC-001), FJ (~%80), F1 (~%55), F2 (~%20), F3 (~%20), F4 (~%5, K15), F5 (~%30), F6 (başlamadı). Hepsi 2026-09-26 tahmini, ölçülmedi. FOUNDATION-B bitince sıra `ROADMAP.md`'den gelir.
- **Kod denetimi (BL-266..282):** SEC-003 dışındakiler backlog'da. Yerleri K23 ile kullanıcıya soruluyor.
- **Temizlik (koordinatör):** 43 birleşmemiş görünen dal, 34 worktree (sürüm 3 ölçümü). Arşiv adayı oturumlar: eski `nf-db` "BL-198" ve "Settings okumaları", "Code review", "ultrareview: bl252", "bl252-f6".
- **Kurallar (değişmedi):** çekirdeğe dokunan işler aynı anda yazılmaz; yerel `test:db` taban kırmızısı 19 dosya (`artifacts/koordinator/sec003-red.txt`; yeni fark `security_audit_events`, BL-288); SEC-003 ile BL-271 aynı dosya (`AuthContext.tsx`), BL-271 sonra; Pazar kuralı (BL-238 kapanana kadar, HANDOFF §0).

## 8. Yayın öncesi şartlar (web/API hosted yayınından önce; hedef yüzdelerine girmez)
| Şart | Kaynak | Durum |
|---|---|---|
| Hosted e-posta teslimatı ölçülür (hangi SMTP, saatlik sınır; onay e-postası Supabase Auth'tan gidiyor) | SEC-003 pre-mortem, koordinatör 2026-09-28 | ölçülmedi |
| BL-283 — API parola doğrulamasına hesap başına deneme sınırı | kullanıcı kararı 2026-09-28 | açık |
| BL-279 — hesap kurtarma e-postasını yeniden gönderme sınırı; geçerli bağlantı ezilmez (backlog programı G5) | koordinatör kararı KK-11, 2026-09-29 | açık |
| "Check your email" ekranı main'de | SEC-003 S.D | **bitti** (`721ea41f`) |
| Hosted veritabanı main ile aynı: BL-199 migration'ı `20260928060000` (iş arkadaşının notu çalışana gitmesin) | BL-199 kapanışı, koordinatör 2026-09-28 | **bitti 2026-09-29** — kullanıcı `20260928060000`–`100000` beş migration'ı gönderdi; koordinatör `list_migrations` ile gördü, `get_advisors` security'de yeni uyarı yok |
**Öneri (`nf-planlama`, kullanıcı kararı değil):** kod denetiminin kalan yüksek güvenlik maddeleri — BL-270 (admin → admin erişim kaldırma), BL-271 (çıkışta önbellek), BL-276 (eski yetki kapısı) — da yayından önce kapansın. Yerleri K23 ile sorulacak.

## 9. Backlog programı (2026-09-29)
- **Paralel işçiler (KK-15/16/18, kullanıcının isteğiyle; `KOORDINATOR-KARARLARI.md`):** Account turuyla aynı anda, dosya kümeleri ayrık işçi oturumlarında: G2 bitti (R1 onaylı, toplu tur bekliyor), G4 bitti (`nf-guvenlik` incelemesi sürüyor; saatlik cron kullanıcı kararı), G6 bitti (+ BL-342/BL-343, KK-17); G5 (G4'ün üstünde) ve G22 (G2'nin üstünde) başladı. Testler toplu turda (T1: G1 + G2).
- **Önce Account yeniden tasarımı (koordinatör kararı KK-1, 2026-09-29; `KOORDINATOR-KARARLARI.md`):** şu an yürüyen tek iş Account yeniden tasarımı (Account → Profile, Security, Preferences, Notifications, Workspaces, Documents; `task/account-redesign`, `nf-arayuz`). Backlog gruplarının kod işleri o iş main'e girince başlar. **Etkisi:** G16 (giriş öncesi, hesap ve workspace ekranları) ile BL-335 (iki telefon), BL-072 (iki avatar), BL-149 (Workspaces listesi bayat), BL-287, BL-331 ve BL-147 Account ekranlarına dokunuyor; tasarım main'e girince bu maddelerin tazeliği yeniden ölçülür, bir kısmı tasarımla kapanmış olabilir.
- **Ne:** kullanıcı kararıyla (2026-09-29, koordinatör aktardı) backlog önem sırasına ve yakınlığa göre gruplanıp sırayla düzeltiliyor; **aynı anda tek grup** (kullanıcı kararı 2026-09-29; önceki "en çok 2" geçersiz), testler art arda biten 1–2 grubun toplu turunda. Plan: `docs/plan/tasks/BACKLOG-PROGRAM.md` (290 açık madde, 24 iş grubu + kayıt bakımı G0 + karar bekleyen + programa girmeyen 3 grup).
  - **2026-09-30: kural değişti.** Varsayılan tek grup; kullanıcı açıkça isterse dosyaları kesişmeyen ikinci bir iş yan yana yürür (kullanıcı kararı 2026-09-30; makine sınırı en çok iki ağır iş, CLAUDE.md §3). Güncel cümle `tasks/BACKLOG-PROGRAM.md` "Satırın anlamı"nda; ilk uygulama EMP-001 yanında G14.
- **İlk iki grup (sırayla, T1 turu):** önce **G1** Schedule taslak ve yayın pencerelerinin davranış hataları (12 madde, en yüksek high / safe; BL-299 yanlış taslağı yayınlıyor, BL-300 klavyeyle çalışmıyor) ; sonra **G2** Schedule hızlı düzenleyicinin alanları ve klavye odağı (5 madde, high / safe; BL-293 WCAG 2.4.7). G1 ve G14 stil B mockup dalını (`task/schedule-dialog-mockups`, yalnız yerel DEV) beklemez: seçilen stil B zaten main'de (`228ff3b7`), sıra aynı (KK-4). Sonra G3 (bayat ekranlar, BL-271 gizlilik), ardından G4 (zamanlanmış dışa aktarma).
- **Tazelik:** G1–G3'ün 22 maddesi 2026-09-29'da ölçüldü (`3a31d625`): 21 geçerli, 1 değişmiş (BL-303), bayat yok. Sonraki gruplar sırası gelince.
- **FB-6.2.1 park (kullanıcı kararı 2026-09-29):** program sürerken FOUNDATION-B'nin FB-6.2.1 adımı bekler; §4 hesabı ve FOUNDATION-B yüzdesi (%33,5) program bitene kadar değişmez. Program G7 (yetki ailesi A) ayrı iş olarak açılmaz: sırası gelince FB-6.2.1'in görev dosyası açılır ve G7'nin 17 maddesi onun kapsamına girer (KK-5).
  - **2026-09-30: geçersiz.** G7, FB-6.2 dilimi olarak yürüdü (KK-5, KK-12); `.1`–`.10` main'de, yüzdeler §1'de güncel.
