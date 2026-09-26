# Koordinatör devri — 2026-09-26 akşam

Eski koordinatör: "Koordinatör" oturumu (`local_7488a3bf-b4a1-4555-838b-d3e1d363b99c`, ad `Koordinatör [0bff93]`).
Yeni koordinatör: "Hand off raporu" oturumu (kullanıcı kararı 2026-09-26: bundan sonra koordinatör o).
Ölçüm anı: `origin/main` = `41e337f` (bu dosyanın commit'i hariç). Kullanıcı evden çıktı; Remote Control
ile telefondan izliyor. Dili: Türkçe, sade; sorular tek tıklık, önerilen ilk sırada.

## 0. Yeni koordinatörün ilk 5 işi
1. `CLAUDE.md`'yi baştan oku (özellikle §3, §6, §7, §10, §11). §3 ve §12'deki koordinatör oturum kimliği
   eski oturumu gösteriyor: kendi kimliğinle güncelle (kullanıcı bu oturumu koordinatör yaptı; değişikliği
   kullanıcıya bir satırla bildir). Rol oturumları raporlarını o kimliğe gönderiyor.
2. Aşağıdaki "Çalışan işler" bölümündeki iki alt ajanın sonucu eski oturuma döner; eski oturum
   sonuçlarını sana `SendMessage` ile iletecek. Gelmezse o işleri yeniden başlat (bölüm 2).
3. Birleştirme penceresini aç: BL-186 + ghost 11b (bölüm 3). Kural: migration ortak yerel DB'ye YALNIZ
   bu pencerede, `main.lock` tutulurken uygulanır.
4. Kayda geçmemiş kararları `nf-planlama`'ya işlet (bölüm 5).
5. Uzun işler rol oturumlarında (bölüm 7): `Rol: nf-db [ac6356]`, `Rol: nf-backend [e60efc]`,
   `Rol: nf-arayuz [9b579b]`, `Rol: nf-test [168e53]`, `Rol: nf-guvenlik [c853b4]`,
   `Rol: nf-gorsel-qa [0460b0]`, `Rol: nf-planlama [79093a]` (hepsi boşta).

## 1. Bugün main'e girenler (hepsinin CI'ı yeşil, son koşu 36270277142 @5c0cd28)
- FB-6.1 .2 .3 .4 .5 .6 .7 .8 (SQL + web) .9 (yalnız Schedule) .10 .11 .12; BL-080, BL-136/137/138/139/142/
  148 (kısmen)/158/164/165/167 (ekleme dalı)/170/171/177; CI hijyeni BL-140/143/146/150.
- `scripts/lock.mjs` (atomik kilit) + CLAUDE.md §7 kuralı; CLAUDE.md §11.10 bağlam/devir kuralı (`41e337f`).
- Plan: BL-186 (müsaitlik = tercih) görev dosyası ready; BL-197..203 yeni maddeler; BL-198 kararı.

## 2. Çalışan işler (eski oturumun alt ajanları)
- `nf-test` ghost-e2e (worktree `.claude/worktrees/agent-a395240a02e59eab2`, branch `ghost-e2e`):
  birleştirme koşusunda düşen iki e2e. (1) `e2e/flows/schedule-multi-location.spec.ts:68` ghost kartta
  "Besiktas" arıyor — kullanıcı kararıyla lokasyon artık iğnenin baloncuğunda; test yeni kurala göre
  güncellenecek (lokasyon hâlâ doğrulanmalı). (2) `e2e/flows/shift-hub-swap.spec.ts` "two-location swap"
  yerelde 30 sn poll'a rağmen düştü (Received "Ali"); önceki "CI yükü" teşhisi çürüdü, kök neden aranıyor.
  Gerçek ürün hatasıysa test gevşetilmez, nf-db/nf-backend işi olur. `db.lock`'u bu ajan tutuyor olabilir.
- (Bitti) `nf-gorsel-qa` BL-186 ekranları: ONAY @2cfa7e3 (görüntüler `artifacts/nf-gorsel-qa/bl186/`).
  5616/5617 portlarında sahibi bilinmeyen bir süreç (5617: PID 77376) açık kalmış; sahibini doğrulayıp
  PID ile durdur (isimle toplu öldürme yok).

## 3. Birleştirmeye hazır / neredeyse hazır
### BL-186 — müsaitlik yalnız tercih (kullanıcı kararı 2026-09-26)
- Kural: müsaitlik hiçbir yolda engel değil; hücrede uyarı (köşe ikonu — kullanıcı "şimdilik A, TBD, sonra
  değiştireceğim"), Publish'te onay kutusu (onaylayan = yayınlayan, adıyla; yalnız yeni/değişen uyarı);
  Autofill müsait olmayanı seçmez; Settings → Conflict handling'den "Employee availability" satırı kalktı;
  My Availability'de tek cümle: "Availability is a preference, not a guarantee: a manager can still schedule
  you when you've marked yourself unavailable."; onaylı izin kesin engel kalır.
- Dallar: `bl186-db` @b2928db (dilim 1, nf-guvenlik ONAY @b2928db; test düzeltmeleri `d8c331a` burada),
  `bl186-web` (dilim 2), `bl186-ui` @2cfa7e3 (dilim 1-3 cherry-pick, nf-guvenlik ONAY @2cfa7e3),
  `bl186-e2e` @a75bcc6 (dilim 1-3 + e2e spec + builder `tests.availability`, nf-guvenlik ONAY @a75bcc6).
- DİKKAT: `bl186-ui`/`bl186-e2e` dilim 1'in İLK hâlini (`bdf761c` = `53d0551`) taşıyor; `bl186-db`'deki
  `d8c331a` (yeniden kurulan onay mekanizması testleri + `retired_objects_stay_gone` trigger) ve `b2928db`
  (hafıza) EKLENMELİ. Birleştirme yığını: origin/main + 53d0551 + d8c331a + b2928db + 23e0512 + d223957 +
  2cfa7e3 + a75bcc6 (bl186-e2e'deki kopyaların sha'ları farklı olabilir; `git log` ile eşle).
- Onaylar tam: nf-guvenlik (@b2928db, @2cfa7e3, @a75bcc6) + nf-gorsel-qa ONAY @2cfa7e3. Migration ile shared şema (strict) AYNI anda girmeli; aksi hâlde
  Schedule, Employee Hub ve Conflict handling 500 verir. Hosted'a da aynı anda gitmeli.
- Pencere adımları: `node scripts/lock.mjs take main ...` → `take db ...` → `npx supabase migration up --local`
  (`20260926220000_availability_is_a_preference.sql`) → `pnpm.cmd test:db` (builder'ı yeniden yükler) →
  ci-green listesindeki her dosya için `/<dosya> \.+ ok$` satırı ara (DİKKAT: "Failed: 0" ve TODO satırları
  sahte kırmızı gösterir; bugün bu yüzden iki kez yanlış alarm oldu) → `pnpm.cmd e2e` (tamamı; yeni
  `schedule-availability-warning.spec.ts` ilk kez gerçek DB'de koşacak) → db kilidini bırak → tam kod kapısı
  (`lint`, `typecheck`, `test`, `build`, `=== CODE GREEN` gördükten sonra) → push → main kilidi → CI izle.
- Yerelde `schedule_publication.test.sql` şu an kırmızı ("A current availability acceptance is required",
  satır 30): temizlik sonrası kalan bir onay kaydı; BL-186 migration'ı bu kuralı kaldırdığı için pencerede
  yeşile dönmesi beklenir — doğrula.

### Ghost 11b (FB-6.1.5 görünüm kararı) + BL-180
- Kullanıcı kararı: gerçek ve ghost kart aynı düzen: 1) tip-iş, 2) etiket düz metin (chip yok), 3) saat;
  ghost tek "ölü" gri tarama, lokasyon yalnız köşedeki iğnenin baloncuğunda; gerçek kartta iğne yok;
  "All locations – Together" görünümünde gerçek kartta lokasyon satırı kalır (başlığın altında, ikonsuz).
- Dal `ghost-11b` @e5947ce: nf-guvenlik ONAY @e5947ce, nf-gorsel-qa ONAY @e5947ce. BL-180 dalı `bl180`
  @ace352d (poll 15→30 sn) ONAY @ace352d — ama takas testi yerelde yine düştü (bölüm 2).
- Koordinatörün yığını: `newfork-wt/fb61-merge` worktree'sinde branch `ghost-merge` (origin/main dc754b3 +
  627f875 + d77acbe + a68d7f5 + 1339e11): kod kapısı yeşil, e2e 2 kırmızı (bölüm 2). ghost-e2e düzeltmesi
  gelince yeniden koş.
- Mockup dalı `ghost-color-mockups` ve `artifacts/nf-arayuz/ghost-color/` main'e girmeyecek; dal silinebilir.

## 4. Sıradaki işler (öncelik sırasıyla)
1. BL-198 (high/risky): onaylı takas, güncellemeyi kaçırmış eski taslak yayınlanınca sessizce geri
   alınıyor. Karar: takası bozan her değişiklik yayında engel. Görev dosyası `docs/plan/tasks/BL-198.md`.
   BL-186'dan SONRA (aynı preflight fonksiyonu).
2. BL-197: şablon uygulanınca arşivli etiket düşer ama kullanıcı uyarılır ("1 archived label wasn't applied").
3. BL-188: silinmiş lokasyon şablon/zamanlanmış dışa aktarma yetkisinde sayılmaz (Q-C kuralı; rename
   kendini geri alma hatası buradan çözülür). BL-187: owner kendi çalıştığı lokasyonu silemiyor.
4. BL-183: owner izni bildirimi — kullanıcı kararları (henüz kayda geçmedi, bölüm 5).
5. FB-6.1 kapanışı: .9'un diğer ekranları (liste nf-backend raporunda: Workspace, Employees, Requests,
   Templates, Availability, Announcements, Notifications, Employee Hub, Settings, Account → `NoAccessState`
   + `noAccessHomePath`), .11 kalanları (7. dosya girdi; yetki matrisinde Schedule `stage='core'`), .13 görsel,
   .14 kapanış + HOSTED migration gönderimi (toplu; 20260925173926'dan itibaren bütün yenileri; sıra şartı:
   onaylı izin CHECK ve BL-186 migration'ı web/API yayınıyla aynı anda; sonra güvenlik uyarıları), .0 ekran turu.
6. FB-6.2 Çalışanlar: `docs/plan/tasks/FB-6.2.md` açık sorular S1–S4 kullanıcıda.
7. BL-199 müdür vardiya notu, BL-200 takas onayında 2 sn bildirim beklemesi, BL-192 mobil gezinme yok,
   BL-193 ham zod hatası ekranda, telefonda Together görünümünde başlıkların harf harf kırılması (yeni madde).

## 5. Verilmiş ama kayda geçmemiş kararlar (nf-planlama'ya işlet)
- BL-183 (owner izni bildirimi): alıcılar YALNIZ vardiyası boşalan lokasyonun müdürleri (admin almaz);
  owner izni iptal ederse "X is back" bildirimi GİTMEZ.
- BL-148: Account ekranlarındaki kalan 15 ham renk için YENİ token'lar eklensin (görünüm aynı kalsın).
- BL-166: Account giriş alanı kenarı yalnız Account'ta koyu gri (`--theme-muted`), BL-136 gibi.
- Hücre müsaitlik uyarısı görünümü: A geçici, "TBD" — kullanıcı yeniden tasarlayacak (yeni madde).
- Yolda: telefonda "All locations – Together" + dar sütunda kart başlığı harf harf kırılıyor (nf-gorsel-qa).
- Yolda: ölü `availability-conflicts` API ucu + `list_schedule_draft_availability_conflicts_service`
  (BL-186 sonrası sil); `PublishScheduleDialog` ölü `reasons` durumu ve shared `missing_reason`.
- Yolda: Tooltip basıp sürükleyince `pointerPressed` takılı kalıyor (düşük).

## 6. Sorulmamış küçük kararlar (kullanıcı dönünce, tek turda)
- BL-078 "işlem gerekmez" diye kapansın mı (öneri: evet).
- "Vardiya Planı izin kuralları [9d1089]" oturumu arşivlenebilir mi (BL-080 main'de, CI yeşil).
- Yerel `bl142-owner@newfork.test` hesabı kalsın mı (öneri: kalsın).
- Arşivli iş/tip adları kartta "Shift"e düşüyor; arşivli adı göstermek ister mi.
- Hosted Auth ayarları (kullanıcının yapacağı): Email OTP Expiration 3600, APP_URL, ACCOUNT_SECURITY_FROM;
  minimum parola 8 (BL-161, yerel config de 8 olacak).

## 7. Çalışma düzeni (kullanıcı 2026-09-26'da istedi)
- Uzun kod işleri rol oturumlarında (§12): görev kartı ya da `SendMessage` ile rol oturumuna; kısa işler
  (inceleme, görsel QA, ölçüm) alt ajan. Her iş bitişinde bakım satırında bağlam doluluğu; yarıyı geçince
  devir raporu + yeni oturum.
- Her alt ajan raporundan sonra arkada süreç kaldı mı kontrol et (`TaskStop`); bugün bir alt ajan 4 saat
  boyunca `find /` ile bütün diski taradı.
- Ortak yerel DB: rollback denemesinde her test dosyası AYRI psql oturumunda (bugün tek oturumda birden
  çok dosya koşulunca test verisi Meyhouse'a sızdı; hedefli temizlik yapıldı, yedek
  `artifacts/koordinator/db-cleanup-2026-09-26-b/`). Kalıcı silme izin sisteminde reddedilirse başka
  oturuma devretme; kullanıcıya sor.
- Kullanıcı ekranda görerek karar veriyor: soruyu gerçek uygulamadaki yeriyle (ekran → menü → düğme),
  somut örnekle ve ekran görüntüsüyle sor; görsel kararda 2-3+ gerçek mockup.

## 8. Temizlik (kimsenin işi yarımda değilse)
- `.claude/worktrees/` altında ~33 worktree. main'e girmiş dallar (silinebilir, önce `git branch --merged`
  ile doğrula): no-access-card, no-access-wire, no-access-variants, bl137-*, bl177, plan-*, fb61-8, fb61-8-sql,
  fb61-8-web, fb61-11, fb61-12, bl164-167, ci-hygiene, fb61-5, bl142-wizard, bl139-web-schema,
  worktree-agent-a537c86 (kilit), worktree-agent-a3704c9 / ae21698 (demo, commit yok).
  Açık tutulacak: bl186-*, ghost-11b, ghost-e2e, bl180, ghost-color-mockups (silinecek ama karar sonrası).
- Ana klasörde (`newfork-clean`) `.claude/agent-memory/nf-guvenlik/MEMORY.md` yalnız satır sonu farkıyla
  değişmiş görünüyor; `git checkout --` izin sisteminde engelli → kullanıcının komutu:
  `git -C C:/Users/TheWe/Documents/Codex/newfork-clean checkout -- .claude/agent-memory/nf-guvenlik/MEMORY.md`
  ardından `git -C ... pull --ff-only`.
- Kilitler: `node scripts/lock.mjs status`.
