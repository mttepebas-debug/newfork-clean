# Ekran 3 — Employees: kabul listesi (EKRAN-03)

## Mert için özet
- **En ağır 5 hata (bugün, 2026-10-07):**
  1. Admin işten çıkarma tarihini yanlışlıkla 1 Eylül seçerse Ali'nin çalışılmış Eylül vardiyaları "Unassigned" olur; Restore da geri getirmez (#2).
  2. Ayşe yeni garsona "Alex" yazar, "Employee saved." görür, ad kaydolmaz (#16).
  3. Owner Mert, arşivdeki Ali'yi Restore edince Ali'nin hesabı kayıttan kopar; yeniden davet gerekir (#9).
  4. Owner, son lokasyonundan çıkarılan Ali'yi işten çıkaramaz: düğme kapalı, oysa sunucu kabul ediyor (#1).
  5. Davetli Emre'ye "Send reminder" her basışta hata verir (#28).
- **Görsel karar bekleyen yok.** Masaüstü "Add employee" yeşil, arama satırının sonunda (6 · C); telefon listesi kişi başına kart (Mert, 2026-10-07, bu oturumda); owner'ın Location hücresi "Kadikoy +1". Görünen her değişiklik size önce/sonra görüntüsüyle gelecek.
- **Kapandı:** 120 kişilik işletmede 20 kişinin görünmemesi (EMP-LIMIT, main'de).

---

- **Durum: taslak** (`EKRAN-PLANI.md` "Bir ekranın turu" madde 4). Hata düzeltmeleri KARARLAR'da doğru davranışı yazılı olduğu için Mert onayı beklemez (koordinatörün görev mesajı, 2026-10-07); görsel maddeler önce/sonra görüntüsüyle gider.
- **Yazan:** Employees'in tek sahip oturumu (`oturum/ekran-03`), 2026-10-07. Taban `origin/main` `d57be38c`. Dal `task/ekran-03`, worktree `newfork-wt/ekran-03`.
- **Kaynaklar:** `OZET.md` (E3-01…E3-38, prototip taşı listesi, K1–K12, S1–S5) · `S1-restore.md` · `tasks/EKRAN-03-EMPLOYEES.md` (dilimler; bu dosya onun yerini alır, kayıt olarak kalır) · KARARLAR "Employees" ve Genel → "Liste sayfalarının ortak dili" · BACKLOG "Employees ekranı keşfi" (BL-765…786) ve eski Employees maddeleri.
- **Örnek kişiler:** owner Mert, admin Zeynep, Kadıköy müdürleri Ayşe ve Hande (eş rütbe), garson Ali, davetli Emre.

## Nasıl okunur
- **Durum:** ⏳ açık · ✅ `<main sha>` · ⏭ BL-xxx (Mert'in onayı, tarih). "dalda hazır" = bir dalda yapıldı ve incelendi, main'de değil.
- **Sınıf** (CLAUDE.md §4.3): R0 belge / yalnız test · R1 tek ekran · R2 paylaşılan parça · R3 yetki, satır erişimi, silme, canlı DDL. İnceleme iş sınırında, en yüksek sınıfa göre; bu listede R3 var → `nf-guvenlik` zorunlu.
- **Ne zaman:** her maddenin sonunda köşeli parantezde: **[şimdi]** yalnız Employees dosyaları (`apps/web/src/employees/*`), ortak dosyaya dokunmaz · **[css]** `styles.css`'e dokunur, sırayı koordinatör verir · **[C3]** Requests'in ortak parçaları (sayfalama, onay penceresi) main'e girince · **[veri]** EKRAN-02 veri paketi (yetki matrisi, katalog, `ci-green.txt`) main'e girince.

## 1. Tazelik (2026-10-07, `origin/main` `d57be38c`)
Keşif tabanı `31649359`'dan bu yana Employees'e dokunan değişiklik yalnız iki tane: EMP-LIMIT (`52683bcb`, `30e76c60`; API listeyi boş sayfaya kadar okuyor) ve LIST-YESIL (`529d6e98`; liste sayfalarının ekleme düğmesi yeşil). Employees DB fonksiyonlarını yeniden tanımlayan migration yok (`terminate_employee_service` son tanım `20260930130000`); `apps/web/src/employees/` hiç değişmedi. İki `nf-okur` ölçümü + elle doğrulama:

| Madde | Hüküm | Bugün ne oluyor (kanıt) |
|---|---|---|
| BL-765 lokasyonsuz kişi işten çıkarılamıyor | **değişmiş** | Sunucu artık lokasyonsuz kişide herhangi geçerli saat dilimini kabul ediyor (`schema.sql:25161-25177`, elle okundu). Engel yalnız pencerede: saat dilimi seçenekleri kişinin lokasyonlarından (`EmployeeDrawer.tsx:1489-1500`), boşsa "An active employee location with a timezone is required." (`:1594`) ve düğme kapalı. Düzeltme yalnız web. |
| BL-766 geçmiş tarihli çıkarma | geçerli | Boşaltma `>= resolved_effective_at` (`schema.sql:25207`), `now()` sınırı yok; pgTAP `employee_termination_offboarding.test.sql:103-117` davranışı kilitliyor. Lokasyondan çıkarma ise `>= now()` kullanıyor. |
| BL-768 boş "manager follow-ups" | geçerli | Tek yazan terminate (`schema.sql:25238`); okuyan kod yok, SELECT politikası ve yetkisi yok; bildirim yok. |
| BL-771 bekleyen izin açık kalıyor | geçerli | Terminate gövdesinde time off'a dokunan satır yok. Taslak vardiya yarısı (BL-388) da geçerli: yalnız yayınlanmış vardiya boşalıyor. |
| BL-772 ikiz arşiv yolu | geçerli | `PATCH …/archive` `archived: true` (`employee-directory-routes.ts:547-578`) vardiya boşaltmadan arşivliyor; web yalnız Restore için `false` gönderiyor. |
| BL-778 "Confirm termination" yeşil | geçerli | `EmployeeDrawer.tsx:1608-1610` sınıfsız `Button` (yeşil), tek tık. |
| BL-779 Terminate penceresi klavye | geçerli | Pencerede odak yönetimi yok; çekmece odak tuzağı yalnız Add employee'de (`:895-921`); gerekçe `required` (`:1583-1589`) → tarayıcı balonu. |
| BL-407 telefonda Terminate / Restore yok | **değişmiş** | Gizleme eşiği 640 px (`styles.css:2745-2747`, `@media (max-width: 640px)`); 641–720 px'te görünüyor, telefonda (390) yok. |
| BL-777 Preferred name kaydolmuyor | geçerli | `save_employee_service` eklemede `''`, güncellemede hiç yazmıyor (`schema.sql:21014`, `:21038`); alan yeni, davetsiz ve davetli kişide yazılabilir (`EmployeeDrawer.tsx:2028-2034`). |
| BL-767 Send reminder hata | geçerli | `load_employee_invitation_retry_service` `delivery_status <> 'failed'` ise "failed invitation not found" (`schema.sql:14172`); "Send reminder" ve "Retry" aynı ucu çağırıyor. 2026-10-07'deki e-posta migration'ı bu yola dokunmuyor. |
| KK-177 / BL-282 Employees kalemi (100 kişi tavanı) | **kapandı** (EMP-LIMIT `52683bcb` + `30e76c60`) | API kişileri 200'lük sayfalarla boş sayfaya kadar okuyor, 450 kişi testli. Web'de sayfalama yok (bütün liste tek sayfada); sayfalama c1a dalında. |
| BL-770 Restore hesabı koparıyor | geçerli | Çekmece `restoreAccess` göndermiyor (`EmployeeDrawer.tsx:472-473`); `set_employee_archived_service` `user_id = null` (`schema.sql:23195-23198`); `archived_at` durumunu kontrol etmiyor. |
| BL-769 resmî ad API'den | geçerli | Güncellemede yalnız `employee.save` (`schema.sql:20962-20964`). |
| BL-436 / K6 lokasyon süzgeci | geçerli | Yalnız birincil lokasyon (`EmployeesPage.tsx:202-222`); "No location" seçeneği yok. |
| BL-428 / G3 "Unassigned +1" | geçerli | `EmployeeLocationParts.tsx:115-117`. |
| BL-773, BL-774 | geçerli | Kod değişmedi; özel bilgi ve davet bölümü izin anahtarına bakıyor (`EmployeeDrawer.tsx:157`, `:219-223`). |
| BL-776 ad bildirimi alıcıları | **değişmiş, büyük olasılıkla kapanmış** | Alıcılar "ad kararını verebilen herkes" (`schema.sql:18843-18849`, 2026-09-29 migration'ı): owner, admin'ler ve kapsamında olan müdür (yerleşik Manager rolünde `employees.manage` var, yerel DB SELECT); ilk karar bekleyeni kapatıyor. K5 ile örtüşüyor; müdür alıcısı testle kanıtlanmadı → #24. |
| Öteki açık maddeler (BL-779…786, BL-244…BL-674 listesi) | geçerli | Dokundukları dosyalar `31649359`'dan bu yana değişmedi (`git diff --stat`); BL-042 zaten kapalı. |

## 2. Kabul listesi
### 2.1 İşten çıkarma ve Restore
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 1 | Owner Mert, son lokasyonundan çıkarılmış ya da Remote olan Ali'yi işten çıkarabilir; pencere workspace'in saat dilimini sunar (E3-01 · BL-765 · K4) [şimdi] | R1 | `EmployeeDrawer.test.tsx` "terminates somebody with no location in the workspace time zone" (önce kırmızı) | ⏳ |
| 2 | Zeynep işten çıkarma tarihini geçmişe (1 Eylül) alsa da Ali'nin şimdiden önceki yayınlanmış vardiyaları Ali'de kalır; yalnız şimdiden sonrakiler boşalır (E3-02 · BL-766 · K1, P09) [veri] | R3 | `employee_termination_offboarding` (103-117 bugünkü kurala göre yeniden yazılır, önce kırmızı) | ⏳ |
| 3 | Ali çıkarılınca bekleyen izin talepleri "Withdrawn" olur, Ayşe'nin Requests → Needs review'undan düşer; pencere bundan söz etmez; Restore geri getirmez (E3-12 · BL-771 · Mert Q1) [veri] | R3 | pgTAP `employee_termination_offboarding` (izin satırı) | ⏳ |
| 4 | Ali çıkarılınca taslak programdaki (yayınlanmamış hafta, açık düzenleme) vardiyaları da Ali'de kalmaz (E3-12 taslak yarısı · BL-388) [veri] | R3 | pgTAP | ⏳ (Schedule düzenleme oturumuna dokunur: sıra koordinatörde) |
| 5 | Terminate penceresi açığa düşecek yayınlanmış vardiyaları söyler: "Ali's 2 published shifts will become unassigned: Sat Oct 11, Sun Oct 12"; boşalacak vardiya yoksa uyarı yok (Mert Q1) [veri] | R2 | pgTAP önizleme okuması + web vitest | ⏳ |
| 6 | Ali'nin vardiyası boşalırsa Kadıköy müdürü Ayşe uygulama içi "Ali's 2 shifts are unassigned" bildirimini alır; Ali'ye bildirim yok; boşalan yoksa bildirim yok. Penceredeki "create manager follow-ups" sözü buna göre yazılır (E3-05 · BL-768 · KK-174) [veri] | R3 | pgTAP alıcı sayımı | ⏳ |
| 7 | "Confirm termination" kırmızı ve iki tık (E3-06 · BL-778 · K8 · T3) [şimdi] | R1 | web vitest (ilk tık göndermez) + ekran görüntüsü | ⏳ |
| 8 | Terminate penceresi klavyeyle: açılınca odak ilk alanda, Tab pencerenin içinde döner, Esc'te odak "Terminate employee"a döner; gerekçe hatası alanın altında, tarayıcı balonu yok (E3-16 · BL-779 · T2) [şimdi] | R1 | web vitest | ⏳ |
| 9 | Owner Mert, arşivdeki Ali'yi "Restore employee" ile geri alır: Ali aynı girişle döner; onboarding'i yarımsa kaldığı adımdan sürer (kısıtlı), bitmişse tam erişim (E3-10 · BL-770 · S1) [veri] | R3 | yeni `employee_restore` pgTAP + web vitest | ⏳ |
| 10 | Eski bir ekrandan gelen Restore, aktif kaydı bozmaz: komut kaydın o anki durumuna bakar ve reddeder (E3-10 · S1 teknik) [veri] | R3 | `employee_restore` | ⏳ |
| 11 | Lokasyonu ya da birincil işi kalmamış Ali'nin Restore penceresi lokasyon ve iş seçtirir; geri dönen müdürse en az bir lokasyon şart (E3-13 · BL-456 Restore yolu · S1) [veri] | R3 | `employee_restore` | ⏳ |
| 12 | Ali Newfork hesabını silmişse pencere bunu söyler, yol "Invite to a new email" (S1 satır 6) [veri] | R3 | `employee_restore` | ⏳ |
| 13 | Eski e-postasına ulaşamayan Ali için "Invite to a new email": yeni adrese davet gider, bilgiler dolu gelir; belge yükleme ve politika imzası baştan, süresi dolmamış onaylı belge sayılır (S1 Q1 · KK-170) [veri] | R3 | `employee_restore`, `bl052_document_rehire` | ⏳ |
| 14 | Restore sonrası Ali'nin eksik ya da süresi dolmuş belgesi için süre Restore anından başlar; pencere hâlâ boş vardiyaları ve eksik belgeleri yazar ("1 of Ali's shifts is still unassigned: Tue Oct 14, 5–11 PM") (S1 Q2, Q3) [veri] | R3 | `employee_restore` + web vitest | ⏳ |
| 15 | Restore'u owner ve admin yapar (rütbe kuralıyla); müdür yapamaz, admin başka admin'i yapamaz. Ali'ye e-posta + uygulama içi, Ayşe'ye uygulama içi bildirim; owner ve admin'lere yok (S1 satır 9–10) [veri] | R3 | `authorization_matrix` hücreleri, `employee_restore` alıcı sayımı | ⏳ |

### 2.2 Kişi kaydı, kimlik ve görünürlük
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 16 | Add employee'de ve henüz aktif olmayan kişide "Preferred name" salt okunur; Ayşe yazıp kaybedemez (ad talep ve cevapla değişir) (E3-04 · BL-777 · K2) [şimdi] | R1 | web vitest | ⏳ |
| 17 | Bağlı ya da aktif kayıtta resmî adı yalnız owner değiştirir; Zeynep ve Ayşe API'den de değiştiremez. Onboarding düzeltme önerisini alt rütbe için admin de onaylar (E3-09 · BL-769 · K11) [veri] | R3 | `employees_on_the_core`, `authorization_matrix` | ⏳ |
| 18 | Admin olarak davet edilmiş ama kabul etmemiş Emre'nin kaydını Ayşe düzenleyemez: rütbe davetteki rolle (E3-31 · BL-773 · K12) [veri] | R3 | `employees_on_the_core` | ⏳ |
| 19 | Hande hakkındaki internal note'u yalnız owner ve admin görür; eş müdür Ayşe görmez (S3) [veri] | R3 | `employee_directory_rls` | ⏳ |
| 20 | Özel bilgi (adres, doğum tarihi, acil durum kişisi) yalnız alt rütbe için okunur; Ayşe'ye rolünde izin verilse de Hande'ninkini ve owner'ınkini görmez; kapı çekirdekte (S4 · E3-32 · BL-774) [veri] | R3 | `employee_directory_rls`, `authz_catalog` | ⏳ |
| 21 | Ad alanlarında Türkçe harf kabul edilmez; telefon "+1 (609) 551-8909" maskesiyle, +1 sabit; owner'ın acil durum telefonu +1 ve 10 hane, hata alanın altında (E3-08 · BL-503 · P4, P5) [şimdi] | R1 | web vitest | ⏳ |
| 22 | Aynı workspace'te aynı e-postayla ikinci kişi açılamaz; Ayşe yazarken uyarılır (E3-08 · BL-503 · P8; yerelde 2 yinelenen çift önce temizlenir) [veri] | R3 | pgTAP tekillik + web vitest | ⏳ |
| 23 | Owner'ın acil durum kişisi çekmecenin tek "Save changes"ine bağlı; ayrı "Save emergency contact" yok (K3 · P5) [şimdi] | R1 | web vitest | ⏳ |
| 24 | Ali "Alex" adını isteyince owner, admin'ler ve Ali'nin lokasyon müdürü Ayşe bildirim alır; ilk onay talebi kapatır (E3-36 · BL-776 · K5) [veri] | R0 | pgTAP alıcı sayımı (kod zaten böyle görünüyor; yeşilse kod değişmez) | ⏳ |
| 25 | İki yönetici aynı anda Ali'yi düzenlerse ikincisinin yazdığı kaybolmaz; tek satır açıklama ve yeniden yükle (E3-19 · BL-781) [şimdi] | R1 | web vitest | ⏳ |
| 26 | Lokasyondan çıkarma Schedule'ı, ad onayı listeyi yeniler; arama her harfte listeyi boşaltmaz (E3-34 · BL-785) [şimdi] | R1 | web vitest | ⏳ |
| 27 | Ekrana ham teknik metin çıkmaz ("employee revision conflict", "Failed to fetch", zod JSON); liste yüklenemezse "Retry" (E3-18 · BL-620, BL-621 Employees yarısı · BL-488) | R2 | API + web vitest | ⏳ |

### 2.3 Davet
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 28 | Ayşe, Pazartesi davet ettiği Emre'ye Perşembe "Send reminder" basar: aynı bağlantıyla yeni e-posta gider, davet yine Pazartesi+7'de biter. Ayrı "Resend" yeni bağlantı açar, süreyi 7 gün yeniler, eski bağlantı geçersiz olur (E3-03 · BL-767 · S2) [veri] | R3 | pgTAP (`expires_at` aynı / +7 gün, eski token reddi) + web vitest (sahte API'nin yanlış yeşili kalkar) | ⏳ |
| 29 | Kurulumu bitmemiş workspace'te API'den de davet gönderilemez (E3-14 · BL-419) [veri] | R3 | pgTAP | ⏳ |
| 30 | Bekleyen müdür daveti kabul edilirken de "her müdürün en az bir lokasyonu" kuralı uygulanır (E3-13 · BL-456 davet yolu) [veri] | R3 | pgTAP | ⏳ |
| 31 | Davet bağlantısı, olmayan davette ve verilemeyen rolde aynı cevabı verir; üst rütbeli davetin varlığı belli olmaz; bağlantı hatası "yetkin yok"u ayırır (BL-401, BL-420) [veri] | R3 | pgTAP + web vitest | ⏳ |

### 2.4 Liste (Employees, Archive)
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 32 | Liste ortak dilde (Sistem 1): Documents ile aynı sekme çizgisi, filtre satırı, tablo; "Add employee" yeşil, filtre satırının sağ ucunda; sekmelerde `aria-pressed`; sütun seçici Esc ile kapanır; seçili lokasyon seçenek olarak kalır; boş sekme "No matching employees"; Space ve Enter satırı açar, satırda görünür odak (K7 · E3-23 · BL-604 · G1 · L3, L7, L11, L26 · E3-17 · BL-780 · BL-662 · BL-670) [C3] | R2 | `EmployeesPage.test.tsx` 13/13; `nf-gorsel-qa` ONAY @`8cc2fbec`; `artifacts/nf-arayuz/EKRAN-03/C1/` | ⏳ dalda hazır: `task/ekran-03-c1a` @`8cc2fbec` |
| 33 | Altta 25 / 50 / 100 satır seçimi (varsayılan 50) ve sayfa numaraları; 120 kişide "1 2 3"; süzgeç ve sıralama bütün listede (Genel → sayfalama) [C3] | R2 | c1a vitest + 120 kişilik ekran görüntüsü (yeniden çekilir: eski görüntüler 100 kişi tavanı varken) | ⏳ dalda hazır (c1a) |
| 34 | 120 kişilik işletmede herkes listede (KK-177 · BL-282 Employees kalemi) | R2 | `employee-directory-routes.test.ts` (450 / 400 / 450-100) | ✅ `52683bcb` + `30e76c60` |
| 35 | Owner Mert'in Location hücresi "Kadikoy +1"; ilk lokasyon API'den (G3 · BL-428) [veri] | R2 | pgTAP + web vitest + görüntü | ⏳ |
| 36 | Kadıköy süzgeci Kadıköy'de çalışan herkesi getirir (owner ve ikincil lokasyonlu kişi dahil); "No location" seçeneği lokasyonsuzları getirir (E3-21 · BL-436 · K6) [veri] | R2 | pgTAP + web vitest | ⏳ |
| 37 | Telefonda her kişi bir kart: ad, altında "Kadikoy +1 · Cook", sağda durum çipi; sayfa boyunca uzar (E3-24 · BL-599 · BL-586 · BL-588 Employees yarısı; Mert 2026-10-07: varyant 1) [C3] [css] | R1 | görüntü 390 (owner, müdür) | ⏳ |
| 38 | Çalışan kaydı olmayan owner listede görünür; görünen ad tek kaynaktan okunur (E3-28 · BL-338 · BL-079) [veri] | R3 | pgTAP | ⏳ |
| 39 | Sıralı sütunun oku hep görünür (BL-663) [C3] | R1 | C3 dalında | ⏳ dalda hazır: Requests C3 |

### 2.5 Çekmece görünümü ve metinler
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 40 | Telefonda (390) "Terminate employee" ve arşivli kişide "Restore employee" görünür; kırmızı iki tık; müdürde kilitli-soluk (E3-15 · BL-407) [css] | R1 | görüntü 390 | ⏳ |
| 41 | Çekmece açılınca odak çekmecede; Tab arkadaki listeye ve sol menüye kaçmaz; lokasyondan çıkarıp çekmece kapanınca odak listeye döner (E3-07 · BL-478 · BL-479) [şimdi] | R1 | web vitest | ⏳ |
| 42 | Alan altındaki doğrulama hatası kırmızı, hatalı alanın kenarı kırmızı; alan kenarı kontrastı AA (E3-22 · BL-782 · BL-259) [css] | R1 | görüntü + kontrast ölçümü | ⏳ |
| 43 | Telefonda çekmecenin başında kişinin adı ve durumu (E3-25 · BL-783) [css] | R1 | görüntü 390 | ⏳ |
| 44 | Kutucuk ve radyolar ortak görünümde (tarayıcının mavisi değil); Access düğmeleri aynı ölçüde (E3-26 · BL-784 · BL-483 · BL-484) [css] | R1 | görüntü | ⏳ |
| 45 | History'de kim ve hangi lokasyon yazar; "shift(s)" yok; 50 kayıttan fazlası kesilmez (E3-35 · BL-786) [veri] | R2 | pgTAP + web vitest | ⏳ |
| 46 | Kilitli "Terminate employee" ve kilitli kutucukların nedeni klavyeyle ve dokunarak da okunur (BL-429, BL-485) [şimdi] | R1 | web vitest | ⏳ |
| 47 | Metinler: arşivli ama hesabı bağlı kişinin Access'i arşiv durumunu söyler (K9 · AC8); salt okunur çekmecede tek düğme "Close" ve fotoğraf satırı yok (K10 · BL-408); süresi dolmuş davet listede ve çekmecede aynı adla; saat dilimi okunur adla ("Eastern Time", "Europe/Istanbul" değil); saniyesiz zaman (BL-674 Employees yarısı); tek seçenekli rol seçici kilitli (BL-430); fotoğraf grubunda tek metin, fotoğrafsızda düğme yok (BL-472, BL-473); müdür lokasyon cümlesi Locations'ın altında (BL-459); owner'da Jobs "Required" yok (BL-482) (E3-37) [şimdi] | R1 | web vitest + görüntü | ⏳ |
| 48 | Yeni kişide atama uyarısı yalnız Employment'tan sonra (E10 · BL-669-3); iki rol seçicisinde aynı sıra (AC4 · BL-669-2) [şimdi] | R1 | web vitest | ⏳ |
| 49 | Var olan kişi düzenlenirken lokasyon / iş / rol listesi yüklenemezse "Couldn't load … Retry" (BL-244); form ilk karede dolu, hızlı tıklama atamaları silmez (BL-366); erişim-yok kartında sol sütun ve sekmeler yok (BL-402); uzun e-posta kesilmez (BL-439); telefonda davet alt çubuğu sığar (BL-425) [şimdi] | R1 | web vitest | ⏳ |
| 50 | Rol kaydedilip yeniden okuma düşerse çekmece rolün kaydolduğunu söyler; yalnız rol kaydında ekran okuyucu duyar (BL-463, BL-477); yeni kişi isteği cevapsız kalırsa çekmece sonsuza dek kilitlenmez (BL-465) [şimdi] | R1 | web vitest | ⏳ |

### 2.6 Sunucu temizliği ve test
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 51 | API'nin vardiya boşaltmadan arşivleyen yolu (`archived: true`) silinir; tek yol Terminate (E3-20 · BL-772) [veri] | R3 | `retired_objects_stay_gone`, API vitest | ⏳ |
| 52 | Employees rotaları önce yetkiyi, sonra gövdeyi doğrular (E3-29 · BL-383 Employees kalemi) | R3 | API vitest (yetkisiz + bozuk gövde → 403/404) | ⏳ |
| 53 | Workspace fotoğraf yolu ölü kod değil; okuma tarafında yol doğrulanır (E3-33 · BL-775) [veri] | R3 | pgTAP / API vitest | ⏳ |
| 54 | Ölü ve ikiz kod yok: iki oluşturma yolu teke iner, çalışmayan `onCreated` dalı, kullanılmayan `restore_access` DB dalı (Restore ana yol olunca), bayat yorumlar (E3-38) | R2 | `retired_objects_stay_gone` | ⏳ |
| 55 | Müdürü Employee yapıp aynı kayıtta son lokasyonunu çıkarmak tutarlı sonuç verir (BL-462); arşivli lokasyondaki atamadan kişi çıkarılabilir (BL-493); tetikleyici adı ve ret ipucu kuralı anlatır (BL-487); "yalnız Owner işiyle owner kaydı" için DB testi (BL-492) [veri] | R3 | pgTAP | ⏳ |
| 56 | e2e: işten çıkarma (geçmiş tarih dahil), Restore (aynı hesap, yarım onboarding, "Invite to a new email"), Send reminder / Resend, Revoke, rol değişikliği, ad onayı; `getByLabel("E-mail")` belirsizliği yok (E3-30 · BL-438) | R2 | `e2e/flows/employees-*.spec.ts`, main CI | ⏳ |
| 57 | `EmployeeDrawer.test.tsx` her blokta mock'ları temizler (BL-460); EMP-001 B4'ün üç test boşluğu (BL-464) | R0 | web vitest | ⏳ |
| 58 | Davet bağlantısı (`invitation_token`) düz metin durmaz (BL-352); kullanılmayan `invited` üyelik etiketi (BL-071) | R3 | pgTAP | ⏳ |
| 59 | Tam kapı ve main CI yeşil; Schedule ızgara okuması ≤ 50 ms korunur; kapanışta 1440 + 390 görüntüler (owner, admin, müdür) | — | `pnpm.cmd lint/typecheck/test/build`, `test:db`, e2e | ⏳ |

## 3. Bu listede olmayanlar (başka ekranın turu)
- **Documents (6):** Add employee'deki Documents adımı (S5; prototip C1, C5–C13, C15), BL-560, BL-561, BL-673, BL-557, BL-554, BL-585.
- **Davet kabulü ve onboarding (16):** resmî ad karşılaştırması, BL-351, BL-336, BL-434, BL-631, BL-624, BL-382, BL-620–622 onboarding yarısı, BL-645–649.
- **Settings (10):** BL-452 (lokasyon silme), BL-474 (iş silme), Roles'ta müdüre özel bilgi izni.
- **Account (15):** askıdaki kişinin hesabını silmesi; e-posta değişince listenin eski adresi.
- **Availability (4):** BL-153.
- **Prototip "bırak":** P9, X3.

## 4. c1a dalının durumu (`task/ekran-03-c1a`)
- **İçerik:** kendi iki commit'i (`34cf3747` liste ortak dilde + sayfalama + klavye, `8cc2fbec` telefonda sütun seçici yok) Requests'in ortak parçalarının (EKRAN-02 C3: sayfalama bileşeni, onay penceresi, sıralama oku; 6 commit, uç `74fffb2e`) üstünde. C3'ün yamaları `task/ekran-02`'de de var (`git cherry`); yani c1a, C3 main'e girmeden tek başına gidemez.
- **Çakışma:** `git merge-tree --write-tree origin/main task/ekran-03-c1a` temiz (2026-10-07, `d57be38c`). Dal 70 commit geride; LIST-YESIL tabanında var, EMP-LIMIT yok.
- **İnceleme:** `nf-gorsel-qa` ONAY @`8cc2fbec` (Sistem 1 ölçüleri referansla aynı). Kod incelemesi (`/code-review` ya da `nf-guvenlik`) yok; C3'ünki var (`/code-review` + `nf-gorsel-qa` ONAY @`74fffb2e`).
- **Görüntüler** (`artifacts/nf-arayuz/EKRAN-03/C1/`, 2026-10-06 08:02–09:26; owner Zeynep + müdür Ayşe, 1440 + 390, önce/sonra): **bayat.** 100 kişi tavanı varken çekildi ("1 2"; bugün 120 kişide "1 2 3" olur) ve telefon hâli Mert'in 2026-10-07 kart seçiminden önce (bugün tablo yana kayıyor). Rebase'den sonra yeniden çekilir; telefon kartı (#37) eklenince Mert'e önce/sonra gider.

## 5. Uygulama sırası (öneri; koordinatör onaylar)
1. **[şimdi], yalnız `apps/web/src/employees/*`:** #1, #7, #8, #16, #21, #23, #25, #26, #41, #46–#50. Ortak dosyaya dokunmaz; #7 hazır `ConfirmButton`'u kullanır. Görünenler (#1, #7, #8) önce/sonra ile.
2. **C3 main'e girince:** c1a rebase → #32, #33, #39, sonra #37 (telefon kartı, `styles.css`'in `.employees-*` kısmı).
3. **[css] sırası gelince:** #40, #42, #43, #44.
4. **EKRAN-02 veri paketinden sonra:** veri maddeleri, R3 tek inceleme turunda (`nf-guvenlik`), önce #2, #3, #6, #9–#15 (iş kaybı ve Restore), sonra kimlik (#17–#22), davet (#28–#31), liste okuması (#35, #36, #38, #45), temizlik (#51–#55). Migration adları o paketin son numarasından büyük seçilir.
5. **En son:** e2e (#56), kapanış (#59).
