# Koordinatör devri — 2026-09-30 gece (kullanıcı uyurken)

Devreden: "Koordinatör" (`local_2022ee49-1224-4076-a443-4fcce3142f85`); bağlamı %61, iş sınırında devrediyor.
Devralan: havuzdan "Bekle … (42)" (`local_c575161a-0a35-45af-ae96-d4e74880bc97`); yeni başlık "Koordinatör".
Ölçüm anı: `origin/main` = bu devir commit'i (altındaki son kod `ddb2e359`; main CI 36724425552 check + db + e2e yeşil). Ortak yerel DB'nin son migration'ı `20261001020000`. `main.lock` boş; `db.lock` `nf-db/emp-001-c1`'de (tam paket denemesi).

**Kullanıcı UYUYOR.** Talimatı (2026-09-30 akşamı, koordinatörün penceresinde): "Dün gece yaptığımız gibi sen session'ları ilerlet. Benim adıma verdiğin bütün kararları not al. Ama bu sefer kararın sonucunu app'te hangi özellik nasıl çalıştı / değişti diye nokta atışı anlat." ve "Session mesajları sana ulaşmama ihtimaline karşı sürekli git sen onları check et." Hafıza: `user-away-mode` (2026-09-30 güncellemeleri).

**Güncel pano `docs/plan/ILERLEME-PLANI.md` §0.** Kayıt oturumu tutar; kayıtları kendin yazma, ona "BESLEME #n" gönder (sıradaki #13; #12 işleniyor). Bu dosya yalnız panoda olmayanı taşır.

## 0. Gece çalışma düzeni (kullanıcı yokken)
1. **Yokla, mesajı bekleme.** 10–12 dakikada bir arka plan zamanlayıcısı (`sleep 720` arka planda) ile uyan; her yürüyen oturumun klasörüne bak: `git -C <worktree> log --oneline -1`, `git status -s | wc -l`, `find <worktree>/artifacts -name 'RAPOR*.md' -mmin -14`; `list_sessions` ile çalışıyor mu. Boşta + yeni commit/rapor = bitmiş iş; raporu klasörden oku. Bu gece yedi "bitti" mesajı ulaşmadı.
2. **Kararlar.** Ürün/UX kararını kullanıcının vizyonuna ve KARARLAR'a göre sen verirsin; her kararı beslemeyle `KOORDINATOR-KARARLARI.md`'ye yazdır (KK-n) ve kullanıcıya her seferinde "Uygulamada etkisi"yle anlat: ekran adı ve yolu, kim ne yapınca önce ne oluyordu / şimdi ne oluyor, isimli örnek, geri alma. Park: geri alınamaz silme, hosted (canlı DB gönderimi), ücretli, `supabase db reset`, `CLAUDE.md` / `.claude/agents/**`.
3. **Bütçe.** Haftalık kullanım sınırı %82 (uygulamanın kullanım kartı, 2026-09-30 gece; `get_usage`). Koordinatör kararı: **%90'da yeni iş başlatılmaz**; bu gece G18'den sonra yeni backlog grubu açılmaz; kalan pay EMP-001 C'ye ve QA düzeltmelerine. Her iki yoklamada bir ölç. Rol görev mesajlarına "dosyaları satır aralığıyla oku, tam testi bir kez koş" yaz.
4. **Hatlar.** Birinci hat EMP-001 (Employees çekmecesi; C dilimleri). İkinci hat G18 bitti (a, b, c main'de); G14 bitti (dilim c = BL-204 kullanıcı konuşması bekliyor, tasarımına GİRME).
5. **Oturum yenileme.** Bağlamı yarıyı geçen rol, iş sınırında havuzdan ("Bekle … (43)"–"(50)" boş) yeni oturuma devredilir: eskisinin adına "(eski)" ekle, yenisine rol başlığını ver, sabitle, Remote Control aç, devir + görev mesajı gönder. "undelivered … can still pick it up later" sonucu gelirse `get_session` ile bak; çalışıyorsa mesaj alınmıştır, yeniden gönderme.

## 1. İlk işler (sırayla)
1. `get_session self`; başlık "Koordinatör", sabitli, Remote Control açık (devreden ayarlar; doğrula). 12 dakikalık yoklama zamanlayıcısını kur.
2. **Yürüyen dört işi topla** (klasörden; mesaj gelmeyebilir):
   - **EMP-001 C1** (`nf-db`, `local_8918dfd6-f929-4312-857e-58362641f3a4`, worktree `optimistic-dewdney-c78421`, dal `task/emp-001-c1`, commit `6cad44d6` + devamı): rapor `artifacts/nf-db/emp-001-c1/RAPOR.md` ("C2 için sözleşme", "nf-guvenlik için"). Koordinatör kararları verildi: `get_employee_detail_service` cevabına `is_workspace_owner`; var olan workspace'lere de "Manager" işi eklenir; liste satırındaki iş adı sırası. Migration adı `20261001020000`'dan büyük olmalı.
   - **Acil durum kişisi mesajı** (`nf-backend`, `local_2464b099-317e-437f-ac12-5a506804d03d`, worktree `optimistic-blackburn-f4a88f`, dal `task/emp-001-contact-refusal`): Account → Profile → "Emergency contact"te erişimi alınmış üye "Try again." yerine okunur cümle görecek (web, dar). R1: diff'i sen oku.
   - **EMP-001 A3** (`nf-arayuz`, `local_6a90e9ce-d597-4eeb-abe3-2c7fe7da8fec`, worktree `goofy-wescoff-7931db`, dal `task/emp-001-a3`): Access → "Profile photo" grubunun iki açıklaması kalkar (BL-446). R1: diff + ekran görüntüsü.
   - **Kayıt oturumu** (`local_6fe24435-0391-4db7-bf3c-d448e03044da`, worktree `modest-zhukovsky-87381b`): BESLEME #12'yi işliyor.
   A3 + mesaj düzeltmesi bitince: `newfork-wt/merge-account`'ta tek toplu dal (`task/batch-t10` = `origin/main` + ikisi) → tam kapı → push → dal CI yeşil → `main.lock` → main → main CI izle → kullanıcının ana klasörünü `git -C newfork-clean merge --ff-only origin/main`.
3. **C2'yi ver** (`nf-backend`): C1 sözleşmesiyle, `task/emp-001-c2` dalı `task/emp-001-c1` üstünde; `docs/plan/tasks/EMP-001.md` Touches C2, Done when 20–26'nın shared/API/veri tarafı. Sonra **C3** (`nf-arayuz`; bağlamı %53 → yeni oturuma devret) ve **C4** (`nf-test`, e2e). C1 + C2 + C3 + C4 TEK dal, TEK `nf-guvenlik` incelemesi (R3, zorunlu), ekran değiştiği için `nf-gorsel-qa`, TEK birleştirme penceresi. Alan EKLEYEN iş olduğu için OPS-03 sırası geçerli mi, `nf-guvenlik`'e sor (söküm alan SİLDİĞİ için main önce girmişti; KK kaydı var).
4. **Görsel QA borcu** (`nf-gorsel-qa`, `local_2a24338f-ba49-4311-acbe-4f916b5ae06d`, bağlam ~%34): B4 (rolün Save ile kaydı; rol taslağı varken "Terminate employee" pasif ama soluk görünmüyor — koordinatör gözlemi) ve A3 main'e girince tek turda baktır.
5. **Kullanıcı uyanınca sabah raporu** (§3'teki liste).

## 2. Bu gece main'e girenler (hepsi CI yeşil; ayrıntı panoda ve KK-38…)
| İş | Commit | Ekranda |
|---|---|---|
| EMP-001 A2 + G14 dilim a | `d411d7a8` | Access'in iki açıklaması kalktı; Schedule tekil/çoğul, "bugün" rozeti lokasyonun saatinde |
| G14 dilim b | `0e6d0cfc` | Pasif Publish nedenini söyler; okuma hatasında hafta okları; kurtarma penceresinde Discard iki tık ve ilk fare tıkı çalışır |
| EMP-001 B (söküm) | `9733f42c` | "Manages without working there" yok; Remote olmayan her müdürün en az bir lokasyonu olur (kullanıcı kararı K4 "her müdür") |
| EMP-001 B4 + G18 a, b, c | `ddb2e359` | Rol "Save changes" ile; çekmece sormadan kapanır; çıkarma sonrası çekmece kapanır + bildirim; Documents sayacı yalnız belgeleri sayar; belge çekmecesinde yazılan silinmez |
İncelemeler: G14 b (alt ajan kod incelemesi + QA ONAY @`7e19a76b`), söküm (`nf-guvenlik` ONAY @`dd230072`, QA ONAY @`9733f42c`), B4 (alt ajan ONAY @`54a73953`), G18 c (`nf-guvenlik` ONAY @`c8cac1e6`), G18 a+b (işçinin bağımsız alt ajanı). Söküm sonrası yerel `test:db`: 155 dosya, kırmızı 11 = `ci-not-green.txt`.
Yedekler (yerel DB): `newfork-wt/coord/artifacts/emp-001-b/membership_managed_locations-2026-09-30.sql` (silinen tablo, 1 kayıt), `newfork-wt/coord/artifacts/g18-c/count_account_attention_service-before.sql`.

## 3. Sabah raporunda kullanıcıya gidecekler
1. **Canlı veritabanına gönderim (yalnız kullanıcı; OPS-03):** üç migration — `20261001000000`, `20261001010000`, `20261001020000` (+ C birleşirse onunkiler). Sıra: yedek (`db dump --linked`) → `db push --dry-run` → `db push` → koordinatör `list_migrations` + `get_advisors` (security).
2. **Kullanıcı adına verilen kararlar:** KK-38'den itibaren `docs/plan/KOORDINATOR-KARARLARI.md` (her maddede "Uygulamada etkisi"); kayıt oturumu #12 ile son altıyı yazıyor. Kullanıcıya sohbette her biri anlatıldı; sabah tek tabloda özetle.
3. **Teyit / karar soruları (tek tık, önerilen ilk):** (a) BL-204 müsaitlik uyarısı konuşması (kullanıcı anlatacak; mockup sonra); (b) söküm sonrası "müdür atandığı her lokasyonu yönetir, ara sıra çalıştığı yer dahil" — böyle kalsın mı (öneri: evet); (c) OPS-03'e "alan silen işte sıra ters" cümlesi; (d) BL-118 owner kendi belgesini yükleyebilsin mi (öneri: şimdi değil); (e) belge çekmecesinin öteki yazılan alanları (erteleme / uzatma / ret nedeni) da korunsun mu; (f) Access'teki ret cümlesi "Choose a location, or turn on Remote" diyor ama ikisi Employment sekmesinde — metin; (g) `CLAUDE.md`: koordinatör kimliği yine değişti (bu devir) + bekleyen üç kural maddesi (kayıt oturumu kuralı, push öncesi bütün vitest, "tek hat" cümlesi) — `CLAUDE.md`'ye kullanıcı onayı olmadan DOKUNMA; (h) eski oturumların arşivi (Remote Control kapatmak gerekiyor; her seferinde sorulur): "(eski) Koordinatör — sabah", bu oturum, "(eski)" / "(eski 2)" nf-db, nf-backend, nf-gorsel-qa, iki kayıt oturumu; arşivden önce `find <worktree>/artifacts -type f` ile bak, atıf alan raporu `newfork-wt/coord/artifacts/`'a taşı; (i) uzak dal silme komutu (pano §0c); (j) `~/.claude/OBSERVATIONS.md` 30 maddeye ulaştı (her beşinci maddede kullanıcıya gönderilir); (k) ultrareview: söküm birleştiği için bu işte çalıştırılamaz — C dalı hazır olunca öner.
4. **Bakım satırı:** haftalık kullanım yüzdesi, bağlam, kilitler.

## 4. Oturumlar
| Oturum | Kimlik | Durum |
|---|---|---|
| Rol: nf-planlama (Kayıt) | `local_6fe24435-0391-4db7-bf3c-d448e03044da` | #12 işliyor; iki beslemede %50'yi geçiyorlar — az ve toplu besle, yalnız pano §0 + §0d okut |
| Rol: nf-db | `local_8918dfd6-f929-4312-857e-58362641f3a4` | C1 |
| Rol: nf-backend | `local_2464b099-317e-437f-ac12-5a506804d03d` | acil durum mesajı → C2 |
| Rol: nf-arayuz | `local_6a90e9ce-d597-4eeb-abe3-2c7fe7da8fec` | A3; bağlam %53 → C3'ten önce yenile |
| Rol: nf-test | `local_50c331df-d410-4f84-8521-486025aa57c1` | boşta → C4 |
| Rol: nf-guvenlik | `local_7753c716-a240-468b-bf54-cefdaf951d66` | boşta → C incelemesi |
| Rol: nf-gorsel-qa | `local_2a24338f-ba49-4311-acbe-4f916b5ae06d` | boşta → B4 + A3 |
| İşçi: G18 Belgeler | `local_713bf34a-f838-4b6c-881d-eaba5c50eca5` | bitti, boşta |
| İşçi: G14 Schedule | `local_353f164f-9df7-449c-9c1f-f747f3685d99` | bitti, boşta |
| Eskiler ("(eski)", "(eski 2)") | adlarından | durdu; arşiv sabaha |
| Kullanıcının oturumları | "Employee drawer UI improvements", "Dev sunucusu başlat", "…30 Tane Boş Session Aç" | dokunma |
Worktree'lerin: `newfork-wt/coord` (docs ve `CLAUDE.md`; `git switch --detach origin/main` ile başla), `newfork-wt/merge-account` (toplu dallar; node_modules kurulu).

## 5. Dersler (bu devir)
- **GateGuard kancası:** dal değiştiren, push eden, yeni dosya yazan her çağrıyı önce reddeder; istenen gerçekleri (ne değişir, tek satır geri alma, kullanıcının talimatı aynen) yazıp AYNI çağrıyı yinele. Hafıza dosyası düzenlemesinde de sorar.
- **Oturum başka oturumun worktree'sine yazamaz.** Rol yenilerken yeni oturum kendi klasöründe yeni dal açar (taban: eski dalın ucu).
- **Migration'lı işi main'e alma penceresi:** önce silinen/değişen nesnenin dökümü (`docker exec supabase_db_newfork-clean pg_dump -t …` ya da `pg_get_functiondef`) → `main.lock` + `db.lock` → `git rebase origin/main` → `npx supabase migration up --local` (merge-account içinde) → `psql` ile ölç → `git push origin HEAD:main` → kilitleri bırak → main CI izle → `nf-test`'e `test:db`.
- **Alan SİLEN işte OPS-03 sırası ters** (önce main, sonra canlı); `nf-guvenlik` E1. Canlı site bu repodan yayın almıyor (BL-426).
- **"Etkilenen e2e yok" iddiasına güvenme:** metin ya da gizli öğe değişince `e2e/` içinde `grep`; Playwright `toContainText` gizli alt öğenin metnini de sayar. Dal CI'ı e2e'siz main'e alma.
- **Yük altında düşen test:** `account-password-change.spec.ts` ilk test, `PublicTrustPages.test.tsx` "/privacy" — boşta yeniden koş, koda düzeltme yazdırma.
- **Komut çıktısını kes:** `grep` sonucu dev satır olabilir (`BACKLOG-PROGRAM.md` satır 30 tek satırda on binlerce karakter); her zaman `| cut -c1-300 | head`.
- **İki dalı tek main CI turuna indir:** koşan toplu dalın üstüne ikinci dalı yığıp (t8 → t9) yalnız üsttekini main'e al.
- **Rol "bitti" dedikten sonra gelen kuyruk mesajı** (rebase, ek kontrol) işlenir; commit kimlikleri değişir — toplu dala alırken `git cherry` / patch-id ile bak.
