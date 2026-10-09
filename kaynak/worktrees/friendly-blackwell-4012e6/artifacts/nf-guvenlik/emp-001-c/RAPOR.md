# EMP-001 C — güvenlik ve kod incelemesi, birinci tur (C1 + C2)

**KARAR: ONAY @661831da** (R3; yalnız C1 + C2. C3 ve C4 ikinci turda, yalnız fark.)

Rol: nf-guvenlik (salt okunur). Tarih 2026-09-30. İncelenen: `git diff origin/main...task/emp-001-c2` (`origin/main` = `ee86c9e8`, ortak taban `a98b0671`), `docs/plan/**` hariç 34 dosya, +1569 / −469.
Kritik ya da Yüksek bulgu yok. Orta bulgu yok. İki Düşük, dört not, bir de birleştirme penceresi için yapılacaklar listesi var.

## 1. Sorulan altı başlığın cevabı

| # | Soru | Cevap | Kanıt |
|---|---|---|---|
| 1 | Migration güvenli mi (başka workspace sızıntısı, SECURITY DEFINER, grant, muafiyet, söküm, veri bölümü) | Evet | 2.1–2.6 |
| 2 | Kayıt kuralını atlayan YENİ yol var mı | Hayır. Bilinen boşluk (BL-474: Settings → Jobs'tan işi alınan kişi işsiz kalır) büyümedi | 2.7 |
| 3 | `is_workspace_owner` yeni sızıntı mı | Hayır | 2.8 |
| 4 | Shared şemadaki zorunlu alan başka okuyucuyu kırıyor mu; ikiz yardımcı kaldı mı | Kırmıyor; ikiz yok | 2.9 |
| 5 | Testler kırmızıdan geçmiş mi, beklenti gevşetilmiş mi, `ci-green.txt` | Kırmızıdan geçmiş; gevşetme yok; listede bir satır yer değiştirdi (silinen kuralın dosyası çıktı, yeni dosya girdi), bekçi 0 | 2.10 |
| 6 | Sıra: main önce mi, canlı önce mi | Main önce girebilir; canlı gönderim sabaha kalabilir, iki şartla | Bölüm 4 |

## 2. Ne bakıldı, ne görüldü

**2.1 Gövdeler tabanla birebir, yalnız istenen satırlar değişmiş.** Migration'ın yeniden tanımladığı sekiz fonksiyonun her biri `origin/main`'deki en son tanımıyla `diff -w` ile karşılaştırıldı. Farklar yalnız şunlar: Manager eklemesi; "Management işi mi" sorusunun "Owner işi mi" (`jobs.system_key = 'owner'`) sorusuna dönmesi; kayıt kuralında Management sorgusunun kalkması; kurulum sayımı; `is_workspace_owner` anahtarı. Araya başka satır girmemiş; eski bir gövdeden türetilip sonradan gelen düzeltmeyi düşüren fonksiyon yok.

**2.2 Başka workspace hakkında bilgi sızdıran dal yok.** `save_employee_service` (`supabase/migrations/20261002000000_manager_is_an_ordinary_job.sql:125-138`) kuralı artık kataloğa hiç bakmıyor: birincil iş boşsa ret. Başka workspace'in iş kimliği gönderilirse cevap uydurma kimlikle aynı (`:167`, "invalid employee job"). Hücre: `supabase/tests/manager_is_an_ordinary_job.test.sql:128-133`. Hücre boşa düşmüyor: öteki workspace'in Manager'ı bulunamazsa iki cevap farklı çıkar ve hücre kırılır.

**2.3 SECURITY DEFINER + `search_path ''`, grant.** Migration'ı geri alınan bir işlemde uygulayıp ölçtüm: sekiz fonksiyonun sekizi `prosecdef = true`, `search_path=""`; `anon` ve `authenticated` hiçbirini çalıştıramıyor; migration öncesi ve sonrası yetki listesi (`proacl`) ve sahip aynı (değişen 0 / 8). Dosyada `grant`, `revoke` ya da dinamik SQL (`execute`, `format`) yok.

**2.4 "Bilgi eksikse izin ver" yok.** Muafiyetler: owner kaydı, Remote, Exclude from schedule — öncekiyle aynı; bir muafiyet kalktı (yalnız Management işi olan kişi birincilsiz kaydolurdu). Yeni kayıt (`target_employee_id` boş) için "owner kaydı mı" sorusu `false` dönüyor (ölçüldü), yani kural atlanmıyor.

**2.5 Söküm.** `jobs.jobs_under_management_are_primary` tetikleyicisi, `management_jobs_are_primary_by_department` ve `is_management_job` düşüyor; üçü de `supabase/tests/retired_objects_stay_gone.test.sql:269-276`'da. Migration sonrası hiçbir fonksiyon gövdesinde ve hiçbir politikada bu adlara atıf kalmıyor (ölçüldü: 0 ve 0).

**2.6 Veri bölümü (`:690-697`).** Management'ı olan her workspace'e bir "Manager" satırı; aynı adda canlı iş varsa atlar. `on conflict` çıkarımı `jobs_workspace_active_name_idx` ile birebir eşleşiyor (`(workspace_id, lower(name)) where archived_at is null`). Yerelde geri alınan denemede: 298 Management departmanı, 298 satır eklendi, Manager'sız Management 0. Yalnız `jobs`'a ekleme; var olan satıra dokunmuyor. Canlıda da aynı biçimde koşar.

**2.7 Kayıt kuralının atlama yolları.** Çekmece kaydı ve "Add employee" (`create_employee_command_service`) aynı fonksiyondan geçiyor (hücre 13–14). Settings → Jobs'tan iş verme, alma ve iş silme: yedek birincil "Owner dışındaki ilk iş"; Owner işine birincil düşmüyor (`management_owner_job` 46–47). Bu iki servis kişiyi işsiz bırakabiliyor — BL-474, önceden de böyleydi, büyümedi. Tarayıcıdan atama tablosuna doğrudan yazma hâlâ 42501 (hücre 17). Yeni yol bulamadım.

**2.8 `is_workspace_owner`.** Çekmecenin okumasını açabilen herkese döner. Aynı bilgi bugün aynı cevapta zaten var: `role_name` ("Owner") ve `jobs` içindeki Owner işi (yalnız owner taşır). Workspace içinde kimin owner olduğu gizli değil. Yeni sızıntı saymıyorum. Hücre: `supabase/tests/employee_drawer_reads.test.sql` (owner `true`, admin ve employee `false`).

**2.9 C2.** `employeeDetailSchema`'yı parse eden iki yer var: API `apps/api/src/employees/employee-directory-service.ts:232` ve web `apps/web/src/employees/employee-data.ts:148`; ikisi de aynı okumanın cevabını alıyor, arada alan süzen bir katman yok. `firstJobOutsideManagement` / `nonManagementPrimaryJobId` → 0. Kuralın tek yardımcısı `firstJobExceptOwner` (`apps/web/src/employees/employee-create-flow.ts:34`); çekmece ve sihirbaz onu çağırıyor. API yalnız ipucuna (hint) bakıyor, veritabanı cümlesine değil; değişen cümleler yalnız testlerde geçiyor. İki ret cümlesi shared'da tek yerde (`packages/shared/src/index.ts:873`, `:885`).

**2.10 Testler.** Migration'sız koşunca `manager_is_an_ordinary_job` 19 hücreden 9'u, `management_owner_job` 56 hücreden 15'i kırmızı; migration'la ikisi de yeşil — yeni kurallar kırmızıdan geçmiş. Silinen `management_only_person_saves_without_primary` (13 hücre) eski kuralı anlatıyordu; yerine gelen dosya 19 hücre ve eski dosyanın her durumunu yeni kuralla yeniden soruyor (beklenti gevşetme değil, kural değişimi: kullanıcı kararı S2). `scripts/ci-green-guard.sh origin/main` → 0.

## 3. Bulgular

### Düşük

**D1. Çekmecenin "birincil iş eksik" cevabını gösterdiği hücre silindi, yerine konmadı.**
`apps/web/src/employees/EmployeeDrawer.test.tsx` — main'deki "saves Deniz and shows the database answer when a primary job is missing" (main `:1277`) kalktı. O hücre iki şeyi kilitliyordu: çekmece, işi olup birincili olmayan kaydı açınca kendiliğinden birincil uydurmaz (okuduğunu gönderir) ve veritabanının cümlesini gösterir.
Bu durum yeni kuralda da gerçek. Örnek: Remote iken birincilsiz kaydedilmiş Emre'nin Remote işareti kaldırılıp Save'e basılırsa veritabanı "Mark one of the jobs as primary, or turn on Remote or Exclude from schedule." der.
Genel "kayıt reddedilince mesaj görünür" hücresi duruyor (`:2257`), o yüzden Düşük. Öneri: aynı hücre yeni cümleyle geri gelsin. Kime: `nf-arayuz` (C3; dosya şu an onda) ya da `nf-backend`.

**D2. Tetikleyicinin adı ve ipucu artık kuralı anlatmıyor.**
`employee_job_assignments` üstündeki `a_owner_job_and_management_primary` ve `employee.management_primary` ipucu "Management" diyor; kural yalnız Owner işi. Done when 18 ipucunun kalmasını istediği için bu işte dokunulmaması doğru. Öneri: backlog'a (leave: low / do: moderate — ipucu adı API ve web sözleşmesi). Kime: kayıt için `nf-planlama`, iş için `nf-db` + `nf-backend`.

### Notlar (düzeltme istemiyor)

- **N1. Kurulum sihirbazının Continue sayımı henüz yok (Done when 19'un ikinci yarısı).** İncelenen dalda ve C3'ün şu anki ucunda (`6539de6e`) sihirbaz hâlâ bütün departman ve işleri sayıyor (`apps/web/src/views/OwnerOnboardingPage.tsx:673-674`, `:759`): yalnız Management + Owner + Manager varken Continue açık, Finish'te veritabanı 23514 ile reddediyor. Main'de de böyle (Management ve Owner zaten sayılıyordu); C3'ün işi. İkinci turda ilk bakacağım yer.
- **N2. Done when 26'nın ilk yarısı C3'te.** `EmployeeDrawer.tsx`'te `role_name === "Owner"` üç yerde duruyor (`:1120`, `:2337`, `:3114`). Alan hazır; okuma C3'te değişecek.
- **N3. Birincilsiz eski kayıtlar.** Yeni kurala göre eksik sayılan kayıt (owner / Remote / excluded değil, işi var, birincili yok) yerelde 0 (ölçüldü). Canlıda sayılmadı. Okumalar böyle bir kaydı taşıyor (liste ve Schedule "ilk iş"e düşüyor; bu Remote kişiler için de gereken canlı kural, eski veri toleransı değil); ilk çekmece kaydında birincil istenir. Canlı gönderimden sonra aynı sayım salt okunur koşturulabilir.
- **N4. `apps/web/src/schedule/components/ScheduleRow.tsx` tip tanımında `departments` prop'u kullanıcısız kaldı** (C2 raporu da söylüyor); C3'te silinmeli.

## 4. Sıra sorusu: main mi önce, canlı migration mı

**Cevap: bu iş için main önce girebilir; canlı gönderim sabaha, kullanıcıya kalabilir.**

Gerekçe:
1. OPS-03'ün koruduğu tehlike "yeni kod + eski veritabanı"dır. Bu işte o tehlike gerçek: API çekmece okumasını `employeeDetailSchema.parse` ile geçiriyor (`employee-directory-service.ts:232`); `is_workspace_owner` zorunlu olduğu için migration'sız bir veritabanında Employees → herhangi bir kişi → çekmece 500 verir.
2. Ama yeni kodun canlı veritabanıyla konuştuğu tek yer Vercel'deki yayın, ve o bu repodan yayın almıyor (BL-426; son yayın 2026-08-05). Main'e girmek canlıda hiçbir kodu değiştirmiyor. OPS-03 satırının kendisi "Vercel main'i yayına alır" varsayımına dayanıyor; bugün doğru değil.
3. Ters sıra (önce canlı) da güvenli, ama kullanıcının bilgisayar başında olmasını ister (yedek + `db push`; ajan yapamaz). Beklemek main'i bir gece tutar, karşılığında bugün hiçbir şeyi korumaz.
4. Alan silen sökümden farkı: o işte eski kod silinen alanı okuyordu, bu yüzden kod önce gitmeliydi. Burada eski kod fazla alanı yok sayar, yeni kod alanı ister — yön OPS-03'ün yönü; sırayı gevşeten tek şey canlıya yayın olmaması.

İki şart:
- **Ş1.** Canlı gönderim yapılmadan Vercel bu repoya bağlanmaz (BL-426). Bağlanırsa ilk yayında canlıda her çekmece 500 verir. "Kullanıcıda bekleyenler"e yazılsın: "canlıya `20261002000000` gönderimi (OPS-03 adımlarıyla); BL-426'dan ÖNCE".
- **Ş2.** Bu arada canlı veritabanı main'in bir migration gerisinde kalır ("canlı = main" kaydı, BL-405, geçici olarak doğru değil); kayıt oturumu not etsin.

Yerel sıra değişmez (CLAUDE.md §7): migration ortak yerel veritabanına `main.lock` penceresinde, main'e göndermeden hemen önce uygulanır.

> **Düzeltme (2026-09-30, sonradan):** bu bölümün dayanağı yanlıştı. Main canlıya yayın alıyor (`newfork-clean-api`, koordinatörün ölçümü); BL-426 kaydı başka bir hesaptaki eski projeye bakılarak yazılmıştı. Doğru cevap OPS-03'tü: önce canlı migration, sonra main. Ş1'in anlattığı kırılma gerçekleşti (EMP-001 C main'e 08:20'de girdi, canlı migration 10:40'ta; arada canlıda Employees çekmecesi 500 verdi). Canlı yayını ölçmeden kayda dayandım; ders rol hafızasına yazıldı (`feedback-live-deploy-claim`).

## 5. Birleştirme penceresi için (koordinatöre)

1. **Rebase gerekli, çakışma beklenir.** Ortak tabandan (`a98b0671`) sonra main'de `EmployeeDrawer.tsx` (+15 / −5), `EmployeeDrawer.test.tsx` (+18) ve `employee-data.ts` değişti; C2 ve C3 aynı dosyalarda. Main'de `supabase/` değişmedi, migration tarafı temiz. Elle çözülen çakışma ikinci turda bana gelsin.
2. Migration uygulanınca test kurucusu yeniden yüklenir: `node scripts/reload-test-builder.mjs` (yoksa `<w>:job:manager` etiketi olmaz, yerel `test:db` düşer).
3. **Migration adı sırası.** Bu dosya `20261002000000`. `task/emp-001-b` ve `-b2` dallarında görünen `20261001000000` ve `20261001010000` main'de zaten var. Bundan sonra yazılacak her migration `20261002000000`'dan büyük olmalı (OPS-05'in yeni eşiği), yoksa canlı `db push` sıra dışı diye reddeder.
4. İkinci tur (C3 + C4 farkı) ve dal CI'ı yeşil olmadan main'e gitmez; bu onay yalnız `661831da` için.

## 6. Kanıt (hepsi 2026-09-30, 07:40–07:50, bu oturumda koştu)

| Komut | Sonuç |
|---|---|
| Sekiz fonksiyon: `origin/main`'deki son tanım ↔ migration, `diff -w` | yalnız istenen satırlar (2.1) |
| Migration + yoklamalar, tek işlem, `rollback` (`db.lock` ile) | çıkış 0; artık atıf 0 / 0; 298 departman → 298 Manager; yetki listesi değişen 0 / 8; sekizi `search_path=""`, `anon` / `authenticated` çalıştıramaz; birincilsiz eski kayıt 0 |
| pgTAP, migration + kurucu dosyanın kendi işleminde, dosya başına ayrı oturum | `manager_is_an_ordinary_job` 19/19, `management_owner_job` 56/56, `reads_know_management_and_owner` 34/34, `employee_drawer_reads` 27/27, `employee_references_ask_the_core` 21/21, `settings_reads_ask_the_core` 28/28, `retired_objects_stay_gone` 15/15, `authz_catalog` 10/10 |
| İlk iki dosya migration'sız | 9 ve 15 kırmızı |
| Kalıcı iz | yok: son migration `20261001020000`, sökülecek iki fonksiyon yerinde, iş sayısı 696 → 696; kilit bırakıldı |
| vitest (C2 worktree, `661831da`, temiz) | shared 2 dosya 76/76; API 4 dosya 114/114; web 6 dosya 188/188 |
| `typecheck` shared / api / web | 0 / 0 / 0 |
| `bash scripts/ci-green-guard.sh origin/main` | 0 |
| `git grep "firstJobOutsideManagement\|nonManagementPrimaryJobId"` (apps, packages, e2e) | 0 |

**Koşturmadıklarım:** tam `test:db` (144 dosya; C1 raporu tabanla aynı kırmızı kümeyi ve yetki matrisini 8294 / 0 ölçmüş), e2e, lint, build. Dal CI'ı dört dilim birleşince koşacak; bu onay onların yerine geçmez. Alt ajan açılmadı.

**Skills:** `supabase:supabase-postgres-best-practices` yüklendi (ilgili kurallar: SECURITY DEFINER + `search_path`, kısmi indeksle `on conflict`; sorun yok). `security-review` yüklendi ama bu worktree'nin boş farkına kuruldu ve alt ajan istiyor; ölçütlerini (enjeksiyon, yetki atlama, veri sızıntısı) hedef farka elle uyguladım, alt ajan açmadım. `superpowers:verification-before-completion` uygulandı: yukarıdaki her iddia bu oturumda koşan bir komuta dayanıyor.

Deneme dosyaları (geçici): oturumun scratchpad'inde `trial/` (`probe.sql`, `probe.out`, `mig.*.out`, `none.*.out`).

---

# İkinci tur — yalnız fark (rebase + C3 + C4 + rol hafızası)

**KARAR: ONAY @62cfd10c** (`origin/task/batch-t11`, taban `origin/main` `ee86c9e8`, 14 commit). Şart: dal CI'ı (e2e dahil) yeşil bitsin; ben koşarken `in_progress` idi (koşu `36733173813`), sonucu koordinatör izliyor.
Kritik, Yüksek, Orta ya da Düşük bulgu yok. Bir not var.

## 1. Rebase
`git range-diff a98b0671..661831da ee86c9e8..ccb4fec4`: yedi commit'in yedisi `=` (yama birebir aynı; bağlam farkı bile yok). Birinci turun onayı yeniden tabanlanmış hâl için de geçerli.

## 2. C3 (`04a97650`, `05c2625a`, `62cfd10c`) — fark `ccb4fec4..62cfd10c`, 12 dosya, +515 / −55

- **Owner kaydının tanınması yalnız sunucu işaretine dayanıyor.** `role_name === "Owner"` okuması web kaynağında 0 (ölçüldü); üç yer de `is_workspace_owner` okuyor (`apps/web/src/employees/EmployeeDrawer.tsx:1120`, `:2337`, `:3148`). İki hücre bunu iki yönden kilitliyor: rolün adı başka olsa da işaret tanır; yalnız adı "Owner" olan rol owner kaydı sayılmaz.
- **İstemci kilidine dayanan yeni güvenlik varsayımı yok.** Kilitler yalnız görünüm: Owner işi kutucuğu herkeste kapalı, owner'ın lokasyonları okunduğu gibi gidiyor. Aynı kurallar veritabanında duruyor ve birinci turda yeşil ölçüldü (owner Owner işini bırakamaz; owner olmayan alamaz — `authz.owner_only`; owner'dan lokasyon alınamaz — `employee.owner_locations`). Kutucuğu araçla açıp gönderen biri aynı retleri alır.
- **Sihirbaz sayımı sunucuyla aynı** (birinci turun N1'i kapandı). Web (`apps/web/src/views/OwnerOnboardingPage.tsx:209-218`): sistem anahtarı olmayan en az bir canlı departman + Management departmanının altında olmayan en az bir canlı iş. Sunucu (`apply_owner_onboarding_update`, migration `:557-576`): aynı iki soru; departmansız iş iki tarafta da sayılıyor. Continue, Finish ve "Add a department" açılışı aynı `structureReady` / `ownDepartmentCount` değerlerinden okuyor.
- **Beklenti gevşetilmedi.** İki test dosyasında silinen `it` 0, silinen `expect` 0; eklenen 17 hücre, 46 beklenti. C2'nin sihirbaz hücresine eklenen ikinci iş "Host" yalnız kurgu: o hücrede tek iş Management'a taşınıyordu, yeni sayımla Continue kapanırdı; hücrenin sorduğu şey (taşınan iş birincil kalır) ve beklentileri aynı.
- **Birinci turun D1'i kapandı:** "sends a job with no primary as it was read and shows the database answer" hücresi geri geldi. N2 (`role_name`) ve N4 (`ScheduleRow` ölü `departments`) da kapandı.
- "Terminate employee" pasif görünümü: yalnız görünüm ve okuyucu metni; yetki sunucuda, değişmedi.

## 3. C4 (`942fee73`, `e8106f76`) — `e2e/flows/scope-and-employee-view.spec.ts`, yalnız test
- Parola ya da sır dosyada yazılı değil: parola `e2e/.world.json`'dan okunuyor, dosya gitignore'da (`.gitignore:46`). `service_role`, anahtar ya da token metni yok.
- Yazdıkları yalnız koşunun kendi test dünyasına (`run` etiketi): bir yönetici daha (`tests.person`), ona ve dünyanın owner'ına parola (`tests.password`, kurucuda var), ve çekmeceden "Exclude from schedule". Uygulama tablolarına test dünyası dışında yazma yok.
- **Not (N5):** senaryo Kadikoy'a rastgele adlı ikinci bir yönetici ekliyor ve koşu boyunca orada kalıyor. Aynı dünyayı paylaşan öteki senaryolardan Kadikoy'daki kişi ya da satır sayısına bakan varsa sıraya göre etkilenebilir. Kanıtı tam e2e koşusu verir (dal CI'ı); tek başına yeşil koşmak yetmez.

## 4. Rol hafızası (`c6ead2aa`, `c4f33704`; birinci turdaki `nf-backend` ve `nf-db` kayıtları dahil)
Sır, parola, anahtar yok. Yanlış kural görmedim: kayıtlar çekmece kalıpları, test ve kapı tuzakları. "Done when ile koordinatör mesajı çelişirse mesaja uy, ölçümü raporla" maddesi CLAUDE.md §3 ile uyumlu.

## 5. Kanıt (2026-09-30, 07:58–08:01, bu oturumda)
| Komut | Sonuç |
|---|---|
| `git range-diff a98b0671..661831da ee86c9e8..ccb4fec4` | 7 / 7 `=` |
| `git grep 'role_name === "Owner"'` (web kaynağı, test hariç) | 0 |
| web vitest, `62cfd10c` (`newfork-wt/merge-account`, temiz): `EmployeeDrawer.test.tsx`, `EmployeeDrawer.create.test.tsx`, `OwnerOnboardingPage.test.tsx`, `ScheduleRow.test.tsx` | 4 dosya, 181 / 181 |
| web `typecheck` | 0 |
| Dal CI (`36733173813`) | koşuyor — sonucunu görmedim |

Koşturmadıklarım: e2e, tam vitest, lint, build, `test:db` (bu turda `supabase/` değişmedi; migration ve pgTAP birinci turdaki hâliyle birebir). Hepsi dal CI'ında.

Birinci turun açık kalanları aynen geçerli: D2 (backlog), Ş1 / Ş2 (canlı gönderim BL-426'dan önce), migration uygulanınca `node scripts/reload-test-builder.mjs`, sonraki migration adları > `20261002000000`.
