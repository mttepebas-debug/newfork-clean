# EKRAN-03 Employees — ekranı "bitmiş" tanımına getirmek
Status: draft — 2026-10-06 (`nf-planlama`, koordinatörün görevi; ekran planının 4. adımı, `docs/plan/EKRAN-PLANI.md` "Bir ekranın turu" madde 4).
Session: -   Branch: task/ekran-03-<dilim>   Worktree: newfork-wt/ekran-03-<dilim>   DB: A1–A4 ve D `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). R3 dilimleri (A1, A2, A3, B1) `nf-guvenlik` zorunlu; ekran değişen dilimler (C1, C2) `nf-gorsel-qa`.
Risk sınıfı (toplam): **R3** — üyelik ve erişimin geri verilmesi, işten çıkarmada vardiya boşaltma, resmî ad ve özel bilgi yetkisi, davet bağlantıları (DELEGASYON §3).

**Kaynaklar:** keşif `docs/plan/ekranlar/03-employees/OZET.md` (§1 E3-01…E3-38, §2 prototip taşı/bırak, §3 K1–K12, §4 S1–S5, §5 G1–G3, §6 sınırda) ve A/B/C/D raporları; `S1-restore.md` (Restore senaryoları); KARARLAR "Employees" (:366–375, 2026-10-05/06 satırları) ve Genel → "Liste sayfalarının ortak dili" (Sistem 1, sayfalama); KK-169 (K1–K12), KK-170 (Restore belgeleri), KK-172 (Sistem 1).

**Tazelik 2026-10-06 (`origin/main` `28c2b94e`): 38 bulgunun 38'i geçerli.** Keşiften (`7eb3dc0d` / `31649359`) bu yana Employees'in web, API ve DB fonksiyonlarına dokunan commit yok: `git diff --stat 31649359 origin/main -- apps/web/src/employees apps/api/src/employees` boş; aradaki 21 commit ve 3 migration Schedule'ın (`terminate_employee_*`, `set_employee_archived_*`, `employee_invitation*`, `save_employee*` değişmedi). Elle yeniden ölçülenler: E3-01 `terminate_employee_service` :73-75 (aktif 2311 kişiden 74'ü lokasyonsuz, 2 Remote); E3-02 :124 `>= resolved_effective_at`, `>= now()` yok; E3-04 `save_employee_service` :133 preferred name güncellemede yazılmıyor, alan çekmecede açık (`EmployeeDrawer.tsx:2029-2034`); E3-09 :135-137 ad yalnız `employee.save` ile; E3-10 `EmployeeDrawer.tsx:473` `restoreAccess` göndermiyor, DB `user_id` null, `archived_at is null` koşulu yok; E3-11 `employee-directory-service.ts:226` `page_limit: 100`, web offset yok; E3-15 `styles.css:2745-2747` telefonda düğmeler gizli. 53 açık BL'den kapanan yok. **Not:** OZET §5 ve §9 "G1–G3 açık" diyor — bayat; KARARLAR'da G1 ve G3 seçildi, yalnız G2 açık.

## Goal
Employees ekranını (liste, Archive, kişi çekmecesi: Profile, Employment, Access, History; Add employee; Terminate, Restore, Remove from location; tercih edilen ad onayı; bunların API, DB ve bildirimleri) EKRAN-PLANI'nın "bitmiş sayılır" tanımına getirmek: keşif bulguları kapandı ya da adıyla ertelendi; prototipten "taşı" denen 12 madde uygulamada; ekranın açık backlog maddeleri kapandı ya da adıyla dışarıda; tam kapı ve main CI yeşil; masaüstü ve telefon ekran görüntüsü alındı.

Bir kişi için: Owner Mert, yanlışlıkla işten çıkardığı garson Ali'yi Archive'dan Restore eder; Ali aynı e-postayla girer, onboarding'i yarımsa kaldığı adımdan sürer, eksik gıda kartı için 14 günü vardır; pencere "1 of Ali's shifts is still unassigned: Tue Oct 14" der. 80 kişilik işletmede Ayşe Employees'i açınca ilk 50 kişiyi görür, altta "1 2"; "Add employee" filtre satırının sağ ucunda yeşil. Kadıköy müdürü Ayşe, Emre'nin resmî adını API'den de değiştiremez.

## Ürün kuralları (yazıldığı gibi uygulanır)
- **S1 Restore (Mert 2026-10-06, KARARLAR :369; KK-170; `S1-restore.md`):**
  - Restore kişinin erişimini **aynı hesapla** geri verir; yeni davet yok. Kişi çıkarıldığı durumuna döner: onboarding yarımsa kaldığı adımdan sürer, bitirene kadar kısıtlı (P10, K 87).
  - Eski e-postasına ulaşamayan kişi: Restore penceresinde ikinci eylem **"Invite to a new email"**; bilgiler dolu gelir, belge yükleme ve politika imzası sıfırlanır (Mert, sohbet; KARARLAR :369).
  - Belgeler (KK-170): süresi dolmamış onaylı belge sayılmaya devam eder; süresi dolmuş ya da eksik olan yeniden istenir, süre **Restore anından baştan** (Q2 önerilen). Politika imzaları "Invite to a new email"de baştan.
  - Boşalan vardiyalar geri verilmez; pencere hâlâ boş olanları yazar, başkasının aldığına dokunulmaz (Q3 önerilen).
  - Kişi Newfork hesabını silmişse hesapla Restore yapılamaz; pencere bunu söyler, yol "Invite to a new email" (S1 satır 6).
  - Eksik atama: en az 1 lokasyon ve birincil iş yoksa Restore penceresi seçtirir; müdürse müdür lokasyon kuralı (S1 satır 5; K 84).
  - Kim: owner ve admin, rütbe kuralıyla; müdür değil (S1 satır 9; K 79).
  - Bildirim: geri dönen kişiye e-posta + uygulama içi; lokasyon müdürüne uygulama içi bilgi; admin / owner'a yok (S1 satır 10; P07).
  - Teknik (Claude, P19; KK-170 kabul): işten çıkarmada üyeliğin eski durumu da saklanır; Restore kaydın o anki durumunu kontrol eder; Restore'da müdür lokasyon kuralı çağrılır.
- **S2 Send reminder (KARARLAR :370):** aynı davet bağlantısıyla yeni e-posta; bitiş tarihi değişmez. Ayrı **"Resend"** yeni bağlantı açar ve süreyi 7 gün yeniler.
- **S3 Internal note (:371):** yalnız kişiyi yönetebilen üst rütbe görür; eş rütbe görmez.
- **S4 Özel bilgi (:372):** yalnız alt rütbe için okunur; eş rütbe ve üstü, rolde "Private information" izni olsa da görmez.
- **S5 Documents adımı (:373):** Add employee'deki Documents adımı Documents ekranının (6) turunda; bu turda yok.
- **K1–K12 (KK-169; KARARLAR :374):** K1 geçmiş tarihli çıkarmada vardiya boşaltma şimdiden önceye uzanmaz (P09) · K2 Preferred name çekmecede salt okunur · K3 acil durum kişisi çekmecenin tek Save'ine bağlı · K4 lokasyonsuz kişide workspace saat dilimi · **K5 (Mert değiştirdi)** tercih edilen ad bildirimi owner'a, admin'lere ve onaylayacak müdüre gider, tek birinin onayı yeter · K6 lokasyon süzgeci "o lokasyonda çalışan herkes" + "No location" · K7 ortak liste dili · K8 "Confirm termination" kırmızı iki tık · K9 arşivli ama hesabı bağlı kişinin Access metni arşiv durumunu söyler · K10 salt okunur çekmecede tek düğme "Close" · **K11 (Mert daralttı)** bağlı ya da aktif kayıtta resmî adı doğrudan yalnız **owner** değiştirir (admin de değiştiremez), sunucuda · K12 davetli kişinin rütbesi davetteki rolle.
- **G1 (KARARLAR :368; Genel :301 ters çevirme):** Sistem 1; "Add employee" **yeşil**, filtre satırının sağ ucunda; boş hâlde de yeşil.
- **G3 (:367):** owner'ın Location hücresi "Kadikoy +1" (ilk lokasyon + kalan sayı); ilk lokasyon API'den gelir. Reddedilen: "All locations".
- **Sayfalama (Genel :302):** 25 / 50 / 100, varsayılan 50, sayfa numaraları; sıralama ve süzgeç sunucuda bütün listede.
- **Telefonda Terminate / Restore görünür (:375; BL-407).**

## Bulgu → dilim eşlemesi
| Bulgu | Dilim | Backlog |
|---|---|---|
| E3-01 lokasyonsuz / Remote terminate (K4) | A1 + B2 | YENİ |
| E3-02 geçmiş tarihli terminate (K1) | A1 | YENİ |
| E3-03 Send reminder (S2) | A3 + B1 | YENİ |
| E3-04 Preferred name kaydedilmiyor (K2) | B2 | YENİ |
| E3-05 offboarding follow-ups boş, haber yok | A1 + A3 (Q2) | YENİ |
| E3-06 Confirm termination yeşil (K8) | C2 | YENİ |
| E3-07 çekmece odağı | C2 | BL-478 |
| E3-08 ABD form kuralları, e-posta tekilliği | A2 + B2 | BL-503 |
| E3-09 resmî ad API'den (K11) | A2 | YENİ |
| E3-10 Restore (S1) | A1 + B1 + B2 | YENİ |
| E3-11 100 satır tavanı | A4 + B1 + C1 | BL-282 |
| E3-12 bekleyen izin / taslak açık (P09) | A1 + B2 (Q1) | BL-388 + YENİ |
| E3-13 müdür lokasyon kuralı dört yolda | A1 (Restore) + A3 (davet kabulü); lokasyon / iş silme Settings | BL-456, BL-452, BL-474 |
| E3-14 kurulum bitmeden davet | A3 | BL-419 |
| E3-15 telefonda Terminate / Restore | C2 | BL-407 |
| E3-16 Terminate penceresi klavye, balon | C2 | YENİ |
| E3-17 satır odağı, Space | C1 | YENİ |
| E3-18 ham DB metni | B1 | BL-620, BL-621 |
| E3-19 eşzamanlı düzenleme takılması | B2 | YENİ |
| E3-20 ikiz yol (boşaltmadan çıkarma / arşiv) | A1 | YENİ |
| E3-21 lokasyon süzgeci (K6) | A4 + C1 | BL-436 + ek |
| E3-22 doğrulama hatası gri | C2 | YENİ |
| E3-23 eski liste dili, `aria-pressed` (K7) | C1 | BL-604 + ek |
| E3-24 telefonda liste | C1 (G2 bekler) | BL-599 |
| E3-25 telefonda çekmece başlığı | C2 | YENİ |
| E3-26 tarayıcı kutucukları, Access düğmeleri | C2 | YENİ |
| E3-27 erişilebilirlik küçükleri | C1 + C2 | BL-429, BL-259, BL-663, BL-670 |
| E3-28 kaydı olmayan owner, görünen ad üç tablo | A4 | BL-338, BL-079 |
| E3-29 gövde yetkiden önce doğrulanıyor | B1 | BL-383 |
| E3-30 test boşlukları | D (+ her dilimin kendi testi) | BL-438 + ek |
| E3-31 davetli admin "çalışan" sayılıyor (K12) | A2 | YENİ |
| E3-32 özel bilgi kapısı satır içi | A2 + B1 | YENİ |
| E3-33 workspace fotoğraf yolu | B1 | YENİ |
| E3-34 bayat önbellek | B1 | YENİ |
| E3-35 History zayıf | A4 + C2 | YENİ |
| E3-36 tercih edilen ad bildirimi (K5) | A3 | YENİ |
| E3-37 durum / metin tutarsızlıkları (K9, K10) | C2 | BL-674, BL-408, BL-662, BL-428, BL-430 |
| E3-38 ölü ve ikiz kod | B1 + A1 | BL-401 |
| G3 "Kadikoy +1" | A4 + C1 | BL-428 |
| Prototip taşı (12): L3, L7, L11, L26, P4, P5, P8, E10, AC4, AC8, T2, T3 | C1 (L3, L7, L11, L26), B2 + C2 (P4, P5, E10, AC4, AC8, T2, T3), A2 + B2 (P8) | OZET §2 |

"YENİ" bulgular BL numarasını koordinatörden alır (PLAN-EKRAN-12 kalıbı); bu dosya numara vermez.

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri ve sözleşme önce, sunum sonra yeni `origin/main`'den; aynı dosyaya iki oturum aynı anda konmaz.

### V — G2 telefon listesi (`nf-arayuz`; R1)
- **Ne:** Telefonda Employees listesi: kart satırı mı, kaydırmalı tablo mu (E3-24). Mobil konuşmasında: https://claude.ai/artifact/CQx4kkeVq1CJF3zGchvkXC. Dal main'e girmez.
- **Done when:** Mert'in seçimi KARARLAR "Employees"e yazıldı (koordinatör). C1'in telefon kısmı bunu bekler; masaüstü kısmı beklemez.

### A1 — İşten çıkarma ve Restore (`nf-db`; R3)
- **Ne:**
  - K1 / E3-02: boşaltma `>= greatest(resolved_effective_at, now())`; geçmiş tarihli çıkarma çalışılmış vardiyayı boşaltmaz. Kilitleyen test (`employee_termination_offboarding.test.sql:103-117`) bugünkü kurala göre yeniden yazılır.
  - K4 / E3-01: lokasyonsuz ya da Remote kişide saat dilimi workspace'inki; çıkarma açılır.
  - S1 / E3-10: hesapla Restore (`restore_access`) ana yol; işten çıkarmada üyeliğin eski durumu (`active` / `pending_activation`) snapshot'a; Restore eski duruma döner; komut `archived_at` durumunu kontrol eder (bayat ekrandan ters çağrı reddedilir); `keep_manager_at_a_location` çağrılır; eksik atama varsa Restore seçilen lokasyon / iş ile birlikte yazılır (tek işlem); silinmiş hesapta (mezar taşı) hesapla Restore reddedilir, anlamlı hint ile; belge zorunlulukları KK-170'e göre yeniden açılır (geçerli onaylı belge `completed`, eksik / süresi dolmuş yeni süreyle). "Invite to a new email": bağ kopar, yeni adrese davet, onboarding özel bilgileri dolu kalır, belge yüklemeleri ve politika imzaları baştan (bugünkü `reset_employee_onboarding_for_rehire` bu kurala göre düzeltilir).
  - Restore cevabı pencere için listeleri döner: hâlâ boş vardiyalar (tarih, saat), eksik belgeler (ad, son tarih).
  - E3-20: API'nin boşaltmadan lokasyondan çıkaran / arşivleyen ikiz yolu silinir (`retired_objects_stay_gone`).
  - E3-12: işten çıkarmada bekleyen izin talepleri ve taslak vardiyalar — Q1'in cevabına göre; cevap gelene kadar yalnız pencere için sayı döner (P09: kullanıcı uyarılır).
  - E3-05: `employee_offboarding_followups` ya okunur (Q2'nin cevabıyla bildirim) ya silinir (ölü sistem kalmaz).
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/employee_termination_offboarding.test.sql`, `employees_on_the_core.test.sql`, `bl052_document_rehire.test.sql`, yeni `employee_restore.test.sql`, `authorization_matrix.test.sql`, `retired_objects_stay_gone.test.sql`, `ci-green.txt`.
- **Bağımlılık:** yok (ilk iş). Q1 / Q2 cevabı yalnız E3-12 / E3-05 kısmını bekletir.
- **Done when:** (a) geçmiş tarihli çıkarmada `now()`'dan önceki yayınlanmış vardiya boşalmıyor (pgTAP, önce kırmızı); (b) lokasyonsuz kişi çıkarılabiliyor; (c) onboarding'i yarım çıkarılan kişi Restore'da `pending_activation`'a, tam kişi `active`'e döner; (d) aktif kayda ters Restore çağrısı reddedilir; (e) lokasyonsuz müdür Restore'u lokasyon seçilmeden reddedilir; (f) silinmiş hesapta hesapla Restore reddedilir; (g) Restore sonrası geçerli onaylı belge `completed`, eksik belge `deadline_at = now() + period_days` (pgTAP, sabit tarih yok); (h) müdür Restore edemez, admin başka admin'i Restore edemez (matris hücreleri); (i) ikiz yol yok; `authz_catalog` sayaçları yalnız azaldı.
- **Test plan:** kırmızı pgTAP → migration (tek transaction + rollback) → `test:db` (`db.lock`).
- **Reviewer:** `nf-guvenlik` zorunlu. Ultrareview önerisi aşağıda.

### A2 — Kimlik ve görünürlük kuralları (`nf-db`; R3)
- **Ne:** K11 / E3-09 (bağlı ya da aktif kayıtta resmî ad değişikliği yalnız owner; sunucuda; onboarding'deki kişide resmî ad onayı yolu korunur); K12 / E3-31 (davetli kişinin rütbesi davetteki rolle); S3 (internal note okuması rütbeyle); S4 (özel bilgi yalnız alt rütbe; izin listesi değil çekirdek); E3-32 (özel bilgi ve davet bölümü kapısı çekirdeğe); E3-08 / P8 (aynı workspace'te e-posta tekilliği; bugünkü 2 yinelenen çift temizlenir, P01).
- **Touches:** `supabase/migrations/<yeni>.sql`, `employees_on_the_core.test.sql`, `employee_directory_rls.test.sql`, `authorization_matrix.test.sql`, `authz_catalog.test.sql`, `ci-green.txt`.
- **Bağımlılık:** A1 main'de (aynı matris dosyaları).
- **Done when:** (a) admin ve müdür aktif çalışanın adını API'den değiştiremez, owner değiştirir (pgTAP); (b) davetli admin'in kaydını müdür düzenleyemez; (c) eş müdür birbirinin internal note'unu ve özel bilgisini görmez, "Private information" izni olsa da (pgTAP); (d) aynı workspace'te aynı e-postayla ikinci kayıt reddedilir (pgTAP; yerelde yinelenen 0, SELECT).
- **Reviewer:** `nf-guvenlik` zorunlu.

### A3 — Davet ve bildirimler (`nf-db`; R3: davet / katılım)
- **Ne:** S2 / E3-03 (Send reminder aynı bağlantı, bitiş değişmez; Resend yeni bağlantı + 7 gün; eski bağlantı geçersiz); E3-14 / BL-419 (kurulum bitmeden davet reddi); K5 / E3-36 (tercih edilen ad bildirimi owner + admin'ler + onaylayacak müdür, ilk onay kapatır); E3-13'ün davet kabulü yolu (BL-456); S1'in Restore bildirimi (geri dönen kişi + lokasyon müdürü); E3-05'in bildirimi (Q2).
- **Touches:** `supabase/migrations/<yeni>.sql`, davet / bildirim pgTAP dosyaları, `ci-green.txt`.
- **Bağımlılık:** A2 main'de.
- **Done when:** her madde için pgTAP hücresi (alıcı sayımı dahil); Send reminder sonrası `expires_at` aynı, Resend sonrası +7 gün ve eski token reddedilir.
- **Reviewer:** `nf-guvenlik` zorunlu.

### A4 — Liste okuması (`nf-db`; R2)
- **Ne:** E3-11 / sayfalama (offset ya da sıralama anahtarı + toplam sayı; 25 / 50 / 100; sıralama ve süzgeç sunucuda bütün listede); K6 / E3-21 (lokasyon süzgeci "o lokasyonda çalışan herkes" + "No location"); G3 (owner için ilk lokasyon + kalan sayı); E3-28 (görünen ad tek kaynaktan; kaydı olmayan owner kuralı BL-338 ölçülür); E3-35'in veri yarısı (History'de kim ve hangi lokasyon; 50 tavanı sayfalı).
- **Touches:** `supabase/migrations/<yeni>.sql`, `employee_directory_rls.test.sql` ya da yeni `employee_directory_paging.test.sql`, `ci-green.txt`.
- **Bağımlılık:** A1 ile paralel olabilir (dosyalar ayrık), main'e sırayla.
- **Done when:** 120 kişilik workspace'te 50'lik sayfalar birleşince 120 farklı kişi, sayı 120, sıralama sayfalar boyunca kesintisiz (pgTAP); Kadıköy süzgeci Kadıköy'de çalışan çok lokasyonlu kişiyi de getirir; "No location" lokasyonsuz kişileri getirir; owner satırında ilk lokasyon adı + sayı.
- **Reviewer:** tek bağımsız inceleme (yetki değişmiyor; okuma fonksiyonu RLS'li kalır).

### B1 — API, shared ve web veri katmanı (`nf-backend`; R3)
- **Ne:** Restore ucu `restoreAccess` ile ve "Invite to a new email" eylemi; Resend ucu; liste ucu sayfa / boyut / süzgeç / sıralama parametreleri; E3-29 (önce yetki, sonra gövde; BL-383); E3-18 (ham DB metni ekrana çıkmaz; BL-620, BL-621); E3-32'nin web yarısı (`can()`); E3-33 (fotoğraf yolu); E3-34 (lokasyondan çıkarma Schedule'ı, ad onayı listeyi yeniler; arama her harfte listeyi boşaltmaz, `placeholderData`); E3-38 / BL-401 (ölü ve ikiz kod).
- **Touches:** `apps/api/src/employees/**`, `apps/api/src/app.test.ts` (Employees satırları), `packages/shared/src/<employees>.ts`, `apps/web/src/employees/employee-data.ts`, `apps/web/src/lib/**`, `EmployeesPage.tsx` ve `EmployeeDrawer.tsx` yalnız veri ve kapı.
- **Bağımlılık:** A1–A4 main'de.
- **Done when:** API vitest (404 / 403 + `authz.*`, `page_size` yalnız 25 / 50 / 100, Restore iki yolu, Resend); web vitest (sayfa değişimi, süzgeçte sayfa 1, arama odağı korur); `grep -c "restoreAccess" apps/web/src/employees` ≥ 1.
- **Reviewer:** `nf-guvenlik` zorunlu.

### B2 — Çekmece ve pencere davranışları (`nf-backend`; R2)
- **Ne:** Restore penceresi (iki eylem, sonuç metni, eksik atama seçimi, hâlâ boş vardiyalar ve eksik belgeler listesi, silinmiş hesap yönlendirmesi); Terminate penceresi (K4 saat dilimi, E3-12 sayıları, T2 gerekçe hatası alan altında); K2 Preferred name salt okunur (E3-04); K3 acil durum kişisi tek Save (P5); K9 Access metni (AC8); K10 "Close"; E3-19 eşzamanlı düzenleme (yazılan kaybolmaz, tek satır açıklama); E10 atama uyarısı zamanı; AC4 rol seçici sırası; P4 / P8 telefon maskesi ve yinelenen e-posta uyarısı (BL-503).
- **Touches:** `apps/web/src/employees/EmployeeDrawer.tsx`, `EmployeesPage.tsx` (davranış), ilgili `*.test.tsx`.
- **Bağımlılık:** B1 main'de.
- **Done when:** her madde için web vitest (önce kırmızı); çekmece kapanırken sormaz (P26, KARARLAR K7).
- **Reviewer:** tek bağımsız inceleme.

### C1 — Liste: Sistem 1 + sayfalama (`nf-arayuz`; R2)
- **Ne:** K7 / E3-23 ortak liste dili (Sistem 1; ölçüler KARARLAR Genel); G1 "Add employee" yeşil, filtre satırının sağ ucu; sayfalama görünümü (ortak bileşen EKRAN-02 C3'te — bu dilim kullanır; EKRAN-03 önce giderse bileşeni burada yazar, EKRAN-02 C3 kullanır); G3 "Kadikoy +1"; K6 "No location" seçeneği; L3 `aria-pressed`, L7 sütun seçici Esc, L11, L26 boş sekme; E3-17 satır odağı ve Space; E3-27'nin liste kısmı; telefon listesi G2 seçimiyle (E3-24, BL-599).
- **Touches:** `apps/web/src/employees/EmployeesPage.tsx` (görünüm), `apps/web/src/views/list-page.css` (ortak değer değişmez), `apps/web/src/styles.css` (yalnız `.employees-*`).
- **Bağımlılık:** B2 main'de; masaüstü G1 / G3 seçili; telefon kısmı V (G2).
- **Done when:** önce / sonra ekran görüntüsü 1440 + 390 (owner, müdür) `artifacts/nf-arayuz/EKRAN-03/C1/`; 120 kişide "1 2 3"; `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

### C2 — Çekmece ve pencereler (`nf-arayuz`; R2)
- **Ne:** K8 / E3-06 / T3 "Confirm termination" kırmızı iki tık; E3-15 telefonda Terminate / Restore (BL-407); E3-16 Terminate penceresi klavye; E3-07 odak (BL-478); E3-22 hata rengi; E3-25 telefonda başlık; E3-26 kutucuk ve Access düğmeleri; E3-35 History görünümü; E3-37 metinler (K9, K10; BL-674, BL-408, BL-662, BL-428, BL-430); Restore penceresinin görünümü.
- **Touches:** `EmployeeDrawer.tsx` (görünüm), `apps/web/src/employees/*.css`, `styles.css` (`.employee-drawer-*`, :2745-2747).
- **Bağımlılık:** B2 main'de; C1 ile dosya ayrık ama `styles.css` ortak → sırayla gönderilir.
- **Done when:** ekran görüntüsü 1440 + 390; Tab ile Terminate penceresi baştan sona; telefonda Terminate ve Restore görünür; `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

### D — e2e (`nf-test`; R2)
- **Ne:** E3-30: işten çıkarma (geçmiş tarih dahil), Restore (aynı hesap, yarım onboarding, "Invite to a new email"), Send reminder / Resend, Revoke, rol değişikliği, tercih edilen ad onayı (K5: ilk onay kapatır).
- **Touches:** `e2e/flows/employees-*.spec.ts`, gerekirse `supabase/test-support/builder.sql` (`nf-db` ile sırayla).
- **Bağımlılık:** C2 main'de; `db.lock`; CI boşken.
- **Done when:** main CI e2e'de yeşil; `skip` / `fixme` yok.
- **Reviewer:** koordinatörün okuması.

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | Ortak dosya (başka ekranla) | Büyüklük (puan) |
|---|---|---|---|---|---|
| V G2 | `nf-arayuz` | R1 | yok | — | 1 |
| A1 terminate + Restore | `nf-db` | R3 | yok | `authorization_matrix`, `retired_objects_stay_gone`, `ci-green.txt` (EKRAN-01/02 `nf-db` hattı) | 5 |
| A2 kimlik + görünürlük | `nf-db` | R3 | A1 | `authorization_matrix`, `authz_catalog` | 3 |
| A3 davet + bildirim | `nf-db` | R3 | A2 | bildirim tabloları (EKRAN-02 A2/A3) | 3 |
| A4 liste okuması | `nf-db` | R2 | — (A1 ile paralel) | `ci-green.txt` | 2 |
| B1 API + veri | `nf-backend` | R3 | A1–A4 | `apps/web/src/lib/**` (EKRAN-02 B1) | 3 |
| B2 çekmece davranışı | `nf-backend` | R2 | B1 | — | 3 |
| C1 liste | `nf-arayuz` | R2 | B2, V (telefon) | sayfalama bileşeni (EKRAN-02 C3), `list-page.css`, `styles.css` | 3 |
| C2 çekmece | `nf-arayuz` | R2 | B2 | `styles.css`, `ConfirmDialog.tsx` (EKRAN-02 C3) | 3 |
| D e2e | `nf-test` | R2 | C2 | `builder.sql` | 2 |
| **Toplam** | | **R3** | | | **28** |

**Paralellik:** `nf-db` hattı A1 → A2 → A3 tek sırada, A4 yanında. EKRAN-02'nin `nf-db` hattı (A1–A4) aynı test dosyalarını kullanır: iki ekranın `nf-db` dilimleri **aynı anda yazılmaz**, sırayı koordinatör verir. Sayfalama bileşeni iki ekranın ortak işi: hangi ekran önce C dilimine girerse o yazar.

## Out of scope
1. **S5 Documents adımı** ve OZET §2 "bırak" satırları (C1, C5–C13, C15, P9, X3): Documents ekranı (6) ve belge mimarisi.
2. **Davet kabulü ve onboarding ekranı (16):** resmî ad karşılaştırması, `review_employee_onboarding_service`, askıdaki üyelikte bekleyen davetin ilk ekranda görünmemesi (P10), BL-351, BL-336, BL-434, BL-631, BL-624, BL-382, BL-620–622 (onboarding yarısı), BL-645–649.
3. **Settings:** E3-13'ün lokasyon silme (BL-452) ve iş silme (BL-474) yolları; silinen lokasyon / işin arşivdeki kişilerin atamasını da kapatması (S1 yolda bulunan c).
4. **Account (Security):** askıdaki kişinin hesabını silebilmesi (S1 yolda bulunan d); e-posta değişince listenin eski adresi göstermesi (S1 yolda bulunan b) — A4 görünen adı tek kaynağa alırken e-postaya da bakar, ölçer; değiştirmez.
5. **Availability (4):** BL-153.
6. **A raporunun düşük listesi** (BL-244, 352, 366, 402, 420, 425, 439, 459, 460, 462–465, 472, 473, 477, 479, 482–485, 487, 488, 492, 493, 586, 588, 669, 071, BL-042): dilim sahibi dokunduğu dosyada kapatır; kalanlar adıyla backlog'da.

## Done when (ekranın tamamı)
1. V, A1–A4, B1, B2, C1, C2, D dilimlerinin Done when'i kanıtıyla Notes / Result'ta (komut + sonuç, sha).
2. E3-01…E3-38'in her biri bir dilimde kapandı ya da Out of scope'ta adıyla (eşleme tablosuna "kapandı <sha>" sütunu).
3. Prototip "taşı" listesinin 12 maddesi uygulamada (ekran görüntüsüyle).
4. Ekranın açık backlog maddeleri kapandı ya da Out of scope'ta adıyla.
5. KARARLAR "Employees" ve Genel satırları uygulandı: S1–S4, K1–K12, G1, G3, sayfalama; G2 seçildi ve uygulandı.
6. Tam kapı yeşil (lint, typecheck, test, build, `test:db`, etkilenen e2e); main CI yeşil.
7. Masaüstü 1440 ve telefon 390 ekran görüntüleri (owner, admin, müdür) `artifacts/nf-gorsel-qa/EKRAN-03/kapanis/`; `nf-gorsel-qa` ONAY.
8. Schedule ızgara okuması ≤ 50 ms korundu.

## Test plan (özet)
pgTAP (A1–A4) önce kırmızı, migration rollback denemesi, `test:db` `db.lock` ile; vitest (B1, B2, C1, C2); e2e (D); görsel önce / sonra masaüstü + telefon; ağır işler aynı anda en çok iki.

## Risk
- **R3.** En riskli A1: üyeliği yeniden açmak erişim vermektir. Yarım onboarding'i atlatan, silinmiş hesabı açan, müdürsüz lokasyon bırakan yol pgTAP'te kapalı olmalı (`S1-restore.md` §1'deki iki tehlike).
- **A2 K11:** admin bugün resmî adı değiştirebiliyor; daraltma admin'in ekranını da değiştirir (çekmecede kilit + metin, C2).
- **E-posta tekilliği (A2):** yerelde 2 yinelenen çift var; migration önce temizler (P01), canlıda `select count(*)` ile ölçülür, gerçek satır varsa koordinatöre sorulur (CLAUDE.md §8).
- **Ortak dosyalar:** sayfalama bileşeni ve `styles.css` EKRAN-02 ile; `nf-db` test dosyaları EKRAN-01/02 ile.
- **Canlıya:** OPS-03; nesne silen iş (A1'in ikiz yolu) önce main CI yeşil, sonra yedekli canlı.

## Ultrareview
- **A1** (üyelik ve erişimin geri verilmesi, veri silme): kullanıcıya tek satır öneri — "EKRAN-03 A1 işten çıkarılan kişiye erişimi geri veriyor ve ikiz yolu siliyor; bu worktree'nin oturumunda `/code-review ultra <kısa not>` önerilir." Ücretsiz hak bittiyse dolar tutarıyla; Mert iki iç incelemeyi yeterli bulabilir (P06).

## Açık sorular (CLAUDE.md §13)
**Q1 — İşten çıkarılan kişinin bekleyen izin talepleri ne olsun?** (Mert'e)
1. Bugün: Employees → kişi → Terminate employee; Ali'nin Requests'te bekleyen 20 Ekim izni açık kalıyor, müdür onaylayabiliyor; pencere bunu söylemiyor (E3-12, D O3).
2. Örnek: Ali 10 Ekim'de çıkarılıyor; 20 Ekim izni Kadıköy müdürü Ayşe'nin Requests → Needs review'unda bekliyor.
3. Seçenekler:
   - **(a) Bekleyen izin talepleri işten çıkarmayla birlikte otomatik geri çekilir ("Withdrawn"); Terminate penceresi "Ali has 1 pending time-off request; it will be withdrawn" der. (Önerilen)**
     `Dayanak: ILKELER P09 (düşmesi gereken veri için kullanıcı uyarılır)`
   - (b) Açık kalır; müdür karar verir.
   - (c) Pencere sorar: geri çek / açık bırak.
   - Kaçış: "Claude karar versin".
4. Etki: A1'in E3-12 kısmı ve B2'nin Terminate penceresi.

**Q2 — (koordinatöre) İşten çıkarmanın bildirimi kime gider?** Bugün hiç kimseye; `employee_offboarding_followups` satırı yazılıyor, okuyan yok (E3-05). Öneri: boşalan yayınlanmış vardiya varsa o lokasyonun müdürüne uygulama içi bildirim ("Ali's 2 shifts are unassigned"); işten çıkarılan kişiye bildirim yok. Dayanak: ILKELER P07 (işi doğrudan etkilenen) + S1 satır 10 (Restore bildirimi). Koordinatör kararı yeterli (P07 birebir); tablo ya bu bildirime bağlanır ya silinir.

## Notes / Result
- 2026-10-06: görev dosyası yazıldı (`nf-planlama`, dal `task/plan-ekran-02-03`, taban `28c2b94e`). Tazelik yukarıda (38/38 geçerli). Koordinatöre: (1) "YENİ" bulguların BL numaraları; (2) Q1 Mert'e, Q2 koordinatöre; (3) G2 mobil konuşmasında; (4) EKRAN-PLANI'nda EKRAN-03 durum satırı ("keşif") ve hat sırası güncellenmeli (bu dosya EKRAN-PLANI'nı yazmaz); (5) OZET §5 / §9'daki "G1–G3 açık" bayat — KARARLAR'da G1 ve G3 seçildi.
