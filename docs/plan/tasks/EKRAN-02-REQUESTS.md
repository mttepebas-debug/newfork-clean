# EKRAN-02 Requests — ekranı "bitmiş" tanımına getirmek (FB-6.4 Takas dahil)
Status: draft — 2026-10-05 (`nf-planlama`, koordinatörün görevi; ekran planının 4. adımı, `docs/plan/EKRAN-PLANI.md` "Bir ekranın turu" madde 4).
Session: -   Branch: task/ekran-02-<dilim>   Worktree: newfork-wt/ekran-02-<dilim>   DB: A0–A3 ve D `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). R3 dilimleri (A1, A2, A3, B1) `nf-guvenlik` zorunlu; ekran değişen dilimler (C1, C2, C3) `nf-gorsel-qa`. Ultrareview satırı aşağıda.
Risk sınıfı (toplam): **R3** — yetki çekirdeği, eski yardımcıların silinmesi, katalog sayaçları, "hayır" sözleşmesi (DELEGASYON §3; sınıf en riskli parçaya göre).

**Kaynaklar:** keşif özeti `docs/plan/ekranlar/02-requests/OZET.md` (§1 tek liste R2-01…R2-58, §2 prototip taşı/bırak, §6 plan düzeltmeleri, §7 sınırda, §10 Mert'in seçimleri); raporlar `A-backlog-prototip.md`, `B-guvenlik.md`, `C-gorsel.md`, `D-kod-davranis.md`; KARARLAR "Schedule → Requests" (7 satır, 2026-10-05), "Takas, bırakılan vardiya (pickup), cover — uygunluk", "İzin (time off)", "Müsaitlik" M6 / M8 ve "Tasarım seçimleri"; KK-158; mevcut `docs/plan/tasks/FB-6.4.md`.

**Tazelik 2026-10-05 (`origin/main` `9bb4373a`): geçerli.** Keşif aynı gün `e929abc7` üzerinde yapıldı. O tarihten bu yana `apps/ packages/ supabase/ api/ e2e/` altında commit yok; son kod commit'i `021da39d` (2026-10-05 11:57 -07:00, keşiften önce) — `git log origin/main -1 -- apps packages supabase api e2e` (koordinatör de ölçtü). Bu dosya için elle doğrulananlar: `grep -rn "permissions.includes" apps/web/src | wc -l` = 21; `schedule-requests-routes.ts`'te 2; `ci-not-green.txt`'te 2 dosya (`weekly_exchange_changed_terms` dahil); `--theme-border-control: #aeb9b4` (`apps/web/src/styles.css:85`) hem Schedule üst çubuğunda (`styles.css:3571`) hem liste sayfalarında (`views/list-page.css:91,113`) kullanılıyor. **Uyarı:** `FB-6.4.md`'deki dosya:satır kanıtları 2026-10-03'te (`af488295`) ölçüldü; arada AVAIL-002 (19 commit, `ff422433`) main'e girdi. Çekirdek iddialar 2026-10-05 keşfinde yeniden ölçüldü (altı fonksiyon / 13 çağrı, hint'siz 42501 sayıları, `eligibility` yok — A "Kanıt listesi"), ama satır numaraları kaymış olabilir; A1 ve A2 işe başlarken kendi ölçümünü yapar.

## Goal
Schedule → Requests ekranını (Time off ve Shift changes sekmeleri, inceleme çekmecesi, Approve / Deny / Revoke / Shorten pencereleri, bu taleplerin bildirimleri ve kuralların API/DB katmanı) EKRAN-PLANI'nın "bitmiş sayılır" tanımına getirmek:
keşif bulguları kapandı ya da adıyla ertelendi; Mert'in "taşı" dediği prototip maddeleri gerçek uygulamada; ekranın açık backlog maddeleri kapandı ya da adıyla dışarıda; tam kapı ve main CI yeşil; masaüstü ve telefon ekran görüntüsü alındı.
**FB-6.4 Takas bu ekranın işidir** (EKRAN-PLANI seçim 3); bugünkü hâli aşağıda "FB-6.4 dilimi"nde.

Bir kişi için: Kadıköy müdürü Ayşe Requests'i açar. Ali'nin 51. sıradaki eski izni "Older" ile artık kaybolmaz. Eş müdür Can, Ayşe'nin Cuma vardiyasını Hande'ye devretmesini onaylayamaz; vaka admin'e gider. Garson2'nin Beşiktaş vardiyasıyla arasında yol süresi yetmese de Garson2 Kadıköy'ün 17:30 vardiyasına başvurabilir; Ayşe onay ekranında "Travel 30 min, rule 45 min" işaretini görür ve karar verir. Ayşe bir başvuruyu reddederken son düğme kırmızıdır ve iki tık ister. Belgesi gecikmiş müdür Hande Requests'i açar, talepleri görür, Approve kapalıdır.

## Ürün kuralları (yazıldığı gibi uygulanır, yeniden yorumlanmaz)
Mert'in seçimleri ve KARARLAR satırları (OZET §10, KARARLAR "Schedule → Requests", KK-158):
- **K-S1 Owner'ın takası:** owner'ın kendi vardiyası için açtığı takas, devir ya da devralmayı **o lokasyonun müdürü, owner ya da admin** onaylar; kimse kendi talebini onaylayamaz (Mert, seçenek dışı; "onaysız kaydolsun" reddedildi).
- **K-S2 Belgesi eksik müdür:** Requests'i görür, oy veremez; Requests açılır, talep ve ilerleme görünür, Approve / Deny kapalı ve yanında "belgen eksik" notu; uygulamanın geri kalanında belge yönlendirmesi sürer (KK-158; Mert'in 2026-10-01 kararı, P22). Shift changes sekmesine uygulanışı → Açık soru Q2.
- **K-S3 Time off "View":** özel rolde Time off için "View" seviyesi kalkar; görme, karar verme izniyle gelir; Settings → Roles'tan bu seçenek kalkar (Mert, önerilen). Shift changes'in "View"i → Açık soru Q1.
- **K-S4 Takas bildirim kitlesi:** vardiya değişikliği bildirimi yalnız karar verecek lokasyon müdürüne gider; müdürsüz lokasyonda admin ve owner yedek alıcıdır (KK-158, P07).
- **K-S5 Private manager note:** yalnız o vakaya karar verebilenler (o vakaya karar verebilen müdürler, admin, owner) vakanın geçmişinde görür; çalışan görmez (Mert, önerilen).
- **K-S6 Ortak liste dili:** Requests bu turda liste sayfalarının ortak diline geçer; Time off ve Shift changes ortak iskelete gelir (KK-158; KARARLAR Genel "Liste sayfalarının ortak dili"). Eski dilde kalan Employees, Settings → Locations, Jobs, Acknowledgements, Shift catalog kendi turlarında geçer.
- **K-S7 Arama kutusu / açılır liste kenarı:** görsel karar bekliyor; Mert "ikisini yan yana göster" dedi (bugünkü 1,86:1 ve 3:1). Varyant dilimi.
- **KK-158'in kabul ettiği §6 önerileri:** yıkıcı düğmeler (Decline application, Close search) kırmızı iki tık (R2-04, CLAUDE.md §9); yol / dinlenme engel değil işaret (R2-02, KARARLAR "Yol ve dinlenme süresi"); gerçek çakışmada kabul düşer (R2-16, ILKELER P24); tek karar tek bildirim (R2-13); izin kısaltma bildirimi izni onaylayan herkese (R2-23); metin düzeltmeleri (R2-41, R2-42, R2-45; P21); geçmiş izinde Revoke gizli (R2-43, P25); "Discard request decision?" sarmalayıcısı silinir, Shorten kapanırken sormaz (R2-47, P26); BL-508 bayat.
- **Takas uygunluğu** (KARARLAR "Takas… uygunluk"; FB-6.4 D1–D7): lokasyon + iş ataması ve çift vardiya engel; kendi müsaitliği ve onaylı izni rızayla ezilir (kabulde "emin misin?", onayda "kendi rızasıyla"); cover listesinde onaylı izinli yok, müsait olmayan etiketli var; pickup / cover'ı vardiyanın lokasyonu, iki lokasyonlu takası ikisi onaylar; kimse kendini, eş rütbe birbirini onaylamaz; kısıtlı kişi takas açamaz / başvuramaz (owner muaf).
- **Müsaitlik tasarım seçimleri** (KARARLAR "Müsaitlik → Tasarım seçimleri", Mert 2026-10-04): takas kabulünde çalışanın "emin misin?"i **S4-E** (günün çizelgesi), yöneticinin onayında rıza **S5-B** ("IF APPROVED" bölümünde amber rıza satırı). FB-6.4'te ayrıca varyant hazırlanmaz.

## FB-6.4 dilimi (bugünkü hâliyle)
FB-6.4 bu görevin A1, A2, B1, C2 ve D dilimlerine dağılır: A1 = FB-6.4 A1 (motor), A2 = FB-6.4 A2 (yetki), B1 = FB-6.4 A3 (API + web veri), C2 = FB-6.4 B (ekran), D = FB-6.4 C (akış 9 e2e). Kapsam, Done when ve kararlar (D1–D7, T1, T2) `FB-6.4.md`'deki gibi geçerlidir; **aşağıdaki maddeler hariç**. `FB-6.4.md` silinmedi ve yeniden yazılmadı; koordinatör eşler.

**FB-6.4.md'de geçersiz ya da değişmiş olanlar (madde madde):**
1. **A2.2 (c) geçersiz.** "Owner'ın girdiği vaka kabul edilince onaysız kaydolur, lokasyon müdürlerine bildirim gider" önerisi Mert tarafından reddedildi (2026-10-05, S1). Yeni kural K-S1: o lokasyonun müdürü, owner ya da admin onaylar; kimse kendini onaylamaz. pgTAP hücresi: owner'ın vakasını Kadıköy müdürü onaylar (geçer), owner kendi vakasını onaylayamaz (`authz.*`).
2. **A2.2 (b) değişti.** "Admin her lokasyonda yetkili olduğu için her zaman alıcı" cümlesi K-S4 ile geçersiz: bildirim yalnız karar verecek lokasyon müdürüne; admin ve owner yalnız müdürsüz lokasyonda ya da kişinin rütbesi gereği karar verecek kişi olduklarında (ör. müdürün kendi vakası) alıcıdır. "Eş müdür onaylayamayacağı vakanın bildirimini almaz" kısmı aynen geçerli.
3. **A2.2'ye eklenen:** müdür kendi vakasındaki adayı **reddedemez** de (R2-01'in ret dalı, YENİ; B §2, D Y3). `exchange.approve`'un kendi-vaka kuralı onay ve ret için aynı soruyla ölçülür.
4. **Tazelik maddesi 3 değişti.** "Dinlenme takasta hiç denetlenmiyor" yanlış (D Y2): AVAIL-002'den sonra `weekly_assignment_candidate_base` `assess_weekly_shift_availability` üzerinden dinlenme ihlalini de üretiyor ve kişiyi listeden düşürüyor. A raporu "`minimum_rest` aday fonksiyonlarında 0" diyor (doğrudan geçmiyor); iki rapor yolda ayrışıyor, sonuçta değil. Hedef değişmez (D7: yol ve dinlenme işaret, engel değil); A1 ilk adımda hangi yoldan engellediğini ölçer.
5. **D6 değişti.** "Şart değişince… kabul korunur" bugünkü davranış değil; bugün saat değişince çakışan kabul **düşmüyor** ve ters davranışı kilitleyen test `ci-not-green.txt`'te (`weekly_exchange_changed_terms`, D O8; R2-16). A1.5 "davranış korunur" yerine "davranış düzeltilir": gerçek çakışmada kabul düşer, değilse bildirim + kabul korunur (P24).
6. **A3.5 değişti.** "Header'lı ikinci kopya (`schedule-requests-routes.ts:66`) silinir" — web yalnız o kopyayı çağırıyor (`apps/web/src/schedule/requests-data.ts:38`); `/v1` kopyasını yalnız API testleri çağırıyor (`app.test.ts:845,913`). Tek rota kalır ve web onu çağırır; hangisinin kalacağı `nf-backend`'in teknik kararı (P19). Header'lı kopya silinip web taşınmazsa Requests boş açılır.
7. **Done when 6 genişler.** Eklenen hücreler: kısıtlı (belgesi eksik) müdür takası onaylayamaz (B §2); müdür kendi vakasında reddedemez (madde 3); owner'ın vakası K-S1'e göre (madde 1); bildirim kitlesi K-S4'e göre (madde 2).
8. **B.4 kapandı.** "Mert'in AVAIL tasarım artifact'ında seçeceği varyant" seçildi: kabulde S4-E, onayda S5-B (KARARLAR "Müsaitlik → Tasarım seçimleri"). B.1'de varyant yalnız yol / dinlenme işaretinin görünümü ve yeri için kalır (G2).
9. **Out of scope 6'nın sıra şartı karşılandı.** AVAIL-002 kapandı (main `ff422433`, 2026-10-04); takas aday listesi yeni müsaitlik biçimini okur.
10. **Out of scope 3'ten çıkanlar.** BL-396, BL-364, BL-517, BL-518 ve BL-228 artık bu ekran turunun içinde (EKRAN-PLANI seçim 2: ekranın açık backlog maddeleri o turda yapılır); FB-6.4 dilimine değil, A3 / B1 / C1'e girer. BL-508 bayat (KK-158). BL-362, BL-523 dışarıda kalır (Out of scope).
11. **BL-167 yeniden açık.** `FB-6.4.md:40` "bayat — kapatılır" diyor; aynı dosyanın Notes'u (2026-10-04) ve keşif A §5 "değişmiş, açık" diyor (güncelleme dalı not, `hide_time_on_badge` ve etiketi yayındakine döndürmüyor). Kurtarma fonksiyonu A2'de zaten yeniden yazıldığı için BL-167 A2'ye girer.
12. **B'ye eklenen bulgular:** R2-04 (yıkıcı düğmeler), R2-18 (onay vermiş müdürün vaka durumu, ekran kısmı), K-S5 notunun gösterimi. Bunlar C2'de.
13. **Büyüklük:** FB-6.4'ün 19 puanı aynen; bu görevin toplamı aşağıda.

## Bulgu → dilim eşlemesi (OZET §1, önem sırasıyla)
Kimlikler OZET'teki gibi. Keşifte "YENİ" denen bulgular BL numarasını PLAN-EKRAN-12'de aldı (2026-10-06, BL-724–BL-754; BACKLOG "Requests ekranı keşfi: yeni bulgular"). Yeni numara almayan üç ek mevcut maddeye yazıldı: BL-363, BL-674, BL-602.

| Bulgu | Ne | Backlog | Dilim |
|---|---|---|---|
| R2-01 | Shift changes onayı çekirdeğe sormuyor (eş müdür, kısıtlı müdür, kendi vakasında ret) | BL-276 (1), BL-189; ret dalı BL-726 | A2 (+ D e2e) |
| R2-02 | Yol / dinlenme takası engelliyor | BL-725 (FB-6.4 A1.3) | A1 (veri), C2 (işaret, G2) |
| R2-03 | Time off "Older" her sayfa sınırında bir talep atlıyor | BL-724 | **A0** |
| R2-04 | Shift changes'te yıkıcı onay düğmeleri yeşil, tek tık | BL-748 | C2 |
| R2-05 | Görünür odak halkası yok | BL-657 | C1 |
| R2-06 | Deny/Revoke'tan vazgeçince odak kayboluyor; Esc çekmeceyi kapatmıyor | BL-656 | C3 |
| R2-07 | Kısıtlı çalışan takas açıp başvurabiliyor | BL-727 (FB-6.4 A2.2) | A2 |
| R2-08 | Belgesi eksik müdür Requests'i göremiyor (K-S2) | BL-728 | A3 (okuma), B2 (yönlendirme istisnası, kapalı düğmeler) |
| R2-09 | Bildirimden gelen müdür kapanmış izni açamıyor | BL-740 | B2 |
| R2-10 | Arama / filtre bütün sayfayı yeniden yüklüyor, imleç kayboluyor, 120+ karakter geri dönüşsüz hata | BL-741 | B1 |
| R2-11 | Yükleme / hata hâlinde çerçeve kayboluyor, ham hata, yeniden deneme yok | BL-654 + BL-742 | B1 (hata türü), C1 (çerçeve, Try again) |
| R2-12 | Sıralama yalnız ekrandaki 50 satıra | BL-729 | A3 (sunucu sıralaması), B2 (bağlama) |
| R2-13 | Tek karar aynı kişiye iki bildirim | BL-730 | A3 |
| R2-14 | Takas bildirimleri owner'a ve bütün admin'lere (K-S4) | BL-731 | A2 |
| R2-15 | Özel rolde Time off "View" (K-S3) | BL-732 | A3 (izin anahtarı), B1 (shared + Roles ekranı) |
| R2-16 | Saat değişince çakışan kabul düşmüyor | BL-733 (BL-227 testi) | A1 |
| R2-17 | Onay ekranında "kendi rızasıyla" ve müdür notu işareti yok (M6, M12) | FB-6.4 B.1 / B.4 | A1 (veri), C2 (S5-B) |
| R2-18 | İki lokasyonlu takasta onay vermiş müdür vakayı hâlâ işi sanıyor, tekrar basabiliyor | BL-734 | A2 (oy tekrarı / sayım), B2 (durum) |
| R2-19 | Private manager note hiç gösterilmiyor (K-S5) | BL-735 | A2 (okuma), B2 (gösterim) |
| R2-20 | Vakaya tıklamak bütün ekranı iskelete çeviriyor | BL-743 | B1 |
| R2-21 | Okuma API'si rota içinde yetki soruyor; iki rota; 403/404; ikinci istek yardımcısı, 401 | BL-363 (+ ek 2026-10-06: ikinci istek yardımcısı, 401, 403/404), BL-176 | B1 |
| R2-22 | "Entire shift released…" satırlarını eski yardımcı süzüyor | BL-179 | A2 |
| R2-23 | İzin kısaltma bildirimini yalnız son onaylayan alıyor | BL-736 | A3 |
| R2-24 | Shorten formu çekmeceyi kaplıyor, stilsiz | BL-658 (1) | C1 |
| R2-25 | Açılan vardiya listesi kelime kelime kırılıyor | BL-658 (3) | C1 |
| R2-26 | Arama kutusu iki çerçeve | BL-658 (2) | C1 |
| R2-27 | Time off ile Shift changes iki tasarım dili; 30 px kayma | BL-658 (4)(5)(6)(7) + BL-749 (kayma) | C2 (Shift changes kısmı), C1 (kayma, Time off kısmı) |
| R2-28 | Tarih / saat dört biçimde; 12/24 ayarı yok sayılıyor | BL-674 (+ ek 2026-10-06: Time off saatleri) | C1 (Time off), C2 (Shift changes, `ExchangeShiftCard`) |
| R2-29 | Ortak liste dili taşınmamış (K-S6) | BL-604 | C1 (Time off), C2 (Shift changes) |
| R2-30 | Arama / açılır liste / beyaz düğme kenarı (K-S7) | BL-255, BL-600 | V (varyant), C3 (uygulama) |
| R2-31 | Ortak çekmece açıkken toast tıklanamıyor | BL-515 | C3 |
| R2-32 | Takas onayı bildirim dağıtımını 2 sn bekliyor | BL-200 | B1 |
| R2-33 | İzin süre işinin hataları yalnız Postgres günlüğünde | BL-507 | A3 |
| R2-34 | Takas testi seed lokasyonunun saat dilimini değiştiriyor | BL-217 | A1 |
| R2-35 | Telefonda başlıklar sütunlarla eşleşmiyor | BL-513 | C1 |
| R2-36 | Telefonda Shift changes filtre boşlukları | BL-400 | C2 |
| R2-37 | Aynı durum çipi iki renkte | BL-750 | C1 (Time off), C2 (Shift changes) |
| R2-38 | Deny / Revoke düz beyaz | BL-256 + BL-399 | C1 |
| R2-39 | Sıralı sütun oku yalnız fareyle | BL-663 | C3 |
| R2-40 | Takas retleri "Hayır" sözleşmesine uymuyor | BL-375 + FB-6.4 A3.1 | A2 (hint), B1 (API + `NoAccessState`) |
| R2-41 | Kapanmış iptalde yanlış metinler; owner'a "View-only access" | BL-653 + BL-751 | C1 |
| R2-42 | Geri çekilen talep "Revoked" görünüyor | BL-737 | A3 (okuma modeli), C1 (etiket) |
| R2-43 | Revoke geçmiş izinde de görünüyor; pencere açık kalan vardiyaları söylemiyor | BL-744 | B2 |
| R2-44 | Eşzamanlı kararda ikinci müdürün çekmecesi açıklamasız kapanıyor | BL-745 | B2 |
| R2-45 | Çalışana karar bildirimi sonucu söylemiyor | BL-738 | A3 |
| R2-46 | Roles'taki izin açıklaması olmayan "return"ı sayıyor | BL-746 | B1 |
| R2-47 | Ölü kod (sarmalayıcı, `conflict_count`, `.request-sr-only`, parametre, 4 karanlık tema kuralı, 30 ham renk) | BL-747 | B2 (TS), C2 (`shift-exchanges.css`) |
| R2-48 | Ekran okuyucu: `aria-pressed`, satır adı, sekmeler ok tuşuyla | BL-752 + BL-602 (+ ek 2026-10-06: sekmeler) | C1 |
| R2-49 | "Cancel swap request" / "Close search" ad uyuşmazlığı | BL-753 | C2 |
| R2-50 | Tek tıkla onay başarısız olunca odak kayboluyor | BL-754 | C1 |
| R2-51 | "All 1 active applications will close." | BL-661 | C2 |
| R2-52 | Sistemin kısaltma satırı düz "Leave cancellation" | BL-364 | A3 (okuma modeli), V (G3), C1 |
| R2-53 | Kısaltma bildirimi onaylayana "is back on the schedule" | BL-396 | A3 |
| R2-54 | Kısaltma / iptal formunda ham renkler, mavi odak | BL-398 | C1 |
| R2-55 | Küçük API / şema kusurları | BL-411, BL-509, BL-506, BL-517, BL-518, BL-110 + BL-739 (`segment_id` 500, yorumdaki izin adı) | A3 (DB), B1 (API + shared) |
| R2-56 | Takas test / yarış boşlukları | BL-227, BL-228, BL-229 | A1 |
| R2-57 | 850/900 ağırlık ortak onay kutusu başlığında | BL-589 | C3 |
| R2-58 | Test boşlukları listesi | — | her dilim kendi testini getirir; D e2e'leri |

Prototip "taşı" listesi (OZET §2; hepsi yukarıdaki bulgularla aynı backlog maddesi): R9 → C1, R10 → C3, R25 → C1, R28 → C1, R33 → C3, R45 / R48 / R51 → C2 (G4 teyidi), R52 / R59 → C2, R78 / R79 → C1, R84 → C2, R85 → C1. "Bırak": R42, R16, R76, R77, R86.

Backlog'dan ekranın içinde kalan ve yukarıda bulguya bağlı olmayanlar: BL-041 (şemsiye; tur kapanınca kapanır), BL-167 (A2), BL-189 (A2), BL-512'nin Requests kalemleri (bayat; (1) ve (3)), BL-602 (C1, sekmeler), BL-397 ve BL-110'un hub yarısı (C2), BL-519 (A1 motoru o testlere dokunursa ham `set status` düzelir; dokunmazsa Out of scope'a adıyla).

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri ve sözleşme önce (`nf-db`, `nf-backend`; çalışan ekran dahil), main'e girer; sunum sonra (`nf-arayuz`) yeni `origin/main`'den. Aynı dosyaya iki oturum aynı anda konmaz.

### V — Görsel varyantlar (`nf-arayuz`; R1)
- **Ne:** gerçek uygulamada, DEV'de query param ile (ör. `?variant=g1-a`) açılan varyantlar; Mert ekranda seçer (ILKELER P04). Dal `task/ekran-02-varyant`, **main'e girmez**; seçilen varyant C1 / C2 / C3'te yazılır, ötekiler hiç main'e girmez.
  - **G1:** müdürün onaylayamadığı vakada Approve / Confirm transfer kapalı mı, gizli mi (Shift changes → vaka). İki varyant.
  - **G2:** onay ekranında yol / dinlenme işaretinin ("Travel 30 min, rule 45 min", "Rest 8 h, rule 10 h") görünümü ve yeri; S5-B'nin "IF APPROVED" bölümüyle birlikte. 2–3 varyant.
  - **G3:** sistemin yazdığı izin kısaltma satırının etiketi ve yeri (Time off → Closed; BL-364). 2–3 varyant.
  - **G4:** Shift changes'in Time off denetimini alması (R45, R48, R51). Varyant değil, tek ekran görüntüsüyle teyit (OZET §5).
  - **S7:** arama kutusu ve açılır liste kenarı: bugünkü (`#aeb9b4`, 1,86:1) ve 3:1 hâli **yan yana**, Requests ve bir ortak liste sayfasında (ör. Notifications). Mert'in sözü: "Bana ikisini yan yana göster karar vereyim".
- **Touches:** dal üzerinde `apps/web/src/views/ScheduleRequestsPage.tsx`, `apps/web/src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx`, `apps/web/src/views/requests-catalog.css`, `apps/web/src/views/list-page.css`, `apps/web/src/styles.css` (yalnız DEV varyant sınıfları). Veri taklit (G1 için onaylayamayan müdür, G2 için ihlal), çünkü A1/A2 henüz yok.
- **Bağımlılık:** yok; ilk gün başlayabilir. Main'e girmediği için öteki dilimlerle dosya çakışması yok.
- **Done when:** beş karar için ekran görüntüsü `artifacts/nf-arayuz/EKRAN-02/varyant/` altında, masaüstü 1440 + telefon 390; Mert'in seçimi KARARLAR "Schedule → Requests"e yazıldı (koordinatör); dal silindi.
- **Test plan:** yok (main'e girmiyor). Reviewer: yok; koordinatör ekran görüntülerini okur.

### A0 — Time off sayfalaması (`nf-db`; R2) — ilk iş
- **Ne:** R2-03. `get_schedule_requests_service`'in imleci (`supabase/migrations/20261003040000_time_off_forgets_location_and_parts.sql:915-925`: `limit target_limit + 1` içinden `min(created_at)`, sonraki sayfa `< cursor`) her sayfa sınırında bir satırı atlıyor. Düzeltme yeni migration'la (uygulanmış migration değişmez). `leave: high / do: safe`.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/schedule_requests.test.sql` (ya da yeni `schedule_requests_paging.test.sql`), `supabase/tests/ci-green.txt`.
- **Bağımlılık:** yok. A1–A3'ten önce, ayrı küçük dal ve ayrı main gönderimi (Older'daki kayıp sessiz veri kaybı; P09).
- **Done when:** 51 talepli bir kuyrukta "Newest" + "Older" sayfalarının birleşimi 51 farklı talep (pgTAP; önce kırmızı); aynı `created_at`'li iki talepte de kayıp yok; main CI `db` yeşil.
- **Test plan:** kırmızı pgTAP → migration (tek transaction + rollback denemesi) → `pnpm.cmd test:db` (`db.lock`).
- **Reviewer:** tek bağımsız inceleme (`/code-review` yeter; yetki değişmiyor).

### A1 — FB-6.4 A1: uygunluk motoru (`nf-db`; R3)
- **Ne:** `FB-6.4.md` A1.1–A1.8, yukarıdaki değişikliklerle (madde 4, 5, 9). Bulgular: R2-02, R2-16, R2-17 (veri: `approval_flags` içinde rıza ve müdür notu), R2-34 (BL-217), R2-56 (BL-227, BL-229; BL-228 için yarış testi yazılır, kırmızıysa aynı dalda düzeltilir). BL-519 motor o testlere dokunursa.
- **Touches:** `FB-6.4.md` Touches A1 + `supabase/tests/weekly_assignment_candidates.test.sql` (BL-519, dokunulursa).
- **Bağımlılık:** A0 main'de (aynı test listeleri: `ci-green.txt`). A2 ile aynı dal olabilir, ayrı commit.
- **Done when:** `FB-6.4.md` Done when 1, 2, 3 ve 12; ek olarak: (a) yol ya da dinlenme ihlali olan aday listede `eligible` ve `approval_flags`'te (pgTAP, Block seçiliyken de); (b) saat değişince gerçek çakışmada kabul düşer, çakışma yoksa kalır (pgTAP; `weekly_exchange_changed_terms` yeşil, `ci-not-green.txt` 2 → 1 satır); (c) BL-228 yarış testi `ci-green.txt`'te.
- **Test plan:** `FB-6.4.md` A1/A2 test planı (önce bugünkü davranışı kilitleyen hücreler, sonra değişiklik hücreleri); `schedule_grid_read_budget` ≤ 50 ms.
- **Reviewer:** `nf-guvenlik` zorunlu (A1 + A2 tek ONAY, `FB-6.4.md` Reviewer satırı).

### A2 — FB-6.4 A2: takas yetkisi çekirdeğe (`nf-db`; R3)
- **Ne:** `FB-6.4.md` A2.1–A2.4, yukarıdaki madde 1, 2, 3, 7 ve 11 ile. Bulgular: R2-01 (ret dalı dahil), R2-07, R2-14 (K-S4), R2-18 (DB: aynı müdürün tekrar oyu yeni bildirim üretmez, "eksik onay" sayımı oy verenin yetkisiyle), R2-19 (K-S5 okuma: not yalnız o vakaya karar verebilenlere döner), R2-22 (BL-179), R2-40 (hint'ler), BL-189, BL-167.
- **Touches:** `FB-6.4.md` Touches A2 (`authorization_matrix`, `authorization_coverage`, `authz_catalog`, `schedule_asks_the_core`, `retired_objects_stay_gone`, `approved_exchange_*`, yeni migration'lar).
- **Bağımlılık:** A1 ile aynı dal ya da hemen sonrası.
- **Done when:** `FB-6.4.md` Done when 4, 5 (DB yarısı), 6 (genişletilmiş: madde 7); ek olarak: (a) owner'ın vakasını o lokasyonun müdürü ya da admin onaylar, owner kendi vakasını onaylayamaz (pgTAP); (b) takas bildirimi alıcıları = karar verecek lokasyon müdürleri; müdürsüz lokasyonda admin + owner; owner ve admin müdürlü lokasyonun sıradan vakasında alıcı değil (pgTAP, alıcı sayımı); (c) private note okumada karar veremeyen müdüre ve çalışana dönmüyor (pgTAP); (d) aynı müdürün ikinci oyu bildirim sayısını artırmıyor (pgTAP); (e) BL-167: kurtarma güncelleme dalı not, `hide_time_on_badge` ve etiketi yayındakine döndürüyor (pgTAP).
- **Test plan:** `FB-6.4.md` A1/A2; yetki matrisi hücreleri önce kırmızı.
- **Reviewer:** `nf-guvenlik` zorunlu (A1 ile tek ONAY).

### A3 — Time off kuralları ve okuma modeli (`nf-db`; R3: K-S2 ve K-S3 yetki)
- **Ne:**
  - R2-08 / K-S2: belgesi eksik müdür `requests.read` ile Time off (ve Q2'nin cevabına göre Shift changes) okur; `time_off.decide` kapalı kalır. Kuralın KARARLAR "Kısıtlı kişi" satırıyla ilişkisi: S2 daha yeni ve özel (P22), yalnız Requests okumasını açar.
  - R2-15 / K-S3: `schedule.time_off_requests.read` özel rolde ayrı seviye olarak kalkar; görme `…manage` ile gelir. Eski rollerde kalan "View" satırları silinir (P01; geriye uyumluluk dalı yok).
  - R2-12: sunucu tarafı sıralama (imleç sıralama anahtarıyla).
  - R2-13: tek karar → kişi başına tek bildirim (vardiya açan onay, iptal onayı, bekleyen iptali olan izinde revoke).
  - R2-23: izin kısaltma bildirimi izni onaylayan bütün müdürlere; sistem onayladıysa karar verebilecek müdürlere.
  - R2-45: çalışana giden karar bildirimi sonucu söyler (approved / denied).
  - R2-53 (BL-396): kısaltma bildiriminin onaylayana giden metni.
  - R2-42: çalışanın geri çektiği bekleyen talep okuma modelinde "Withdrawn" durumuyla döner.
  - R2-52 (BL-364): okuma modeline "sistemin kısaltması" ayrımı (`time_off_event_is_shortening`).
  - R2-33 (BL-507): süre işinin hatası kalıcı bir kayda yazılır.
  - R2-55 DB kısmı: BL-411 (üyelik önce sorulur, kilit sonra), BL-506 (süre işi tur başına sınır / kilit süresi), BL-517'nin DB yarısı (önce ölçülür: çakışan saatleri reddediyor mu), BL-110'un DB yarısı (`time_off_assignment_impact` sabit `false` dalı), kısaltmada bozuk `segment_id` 500 yerine 22023, yorumdaki izin adı.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/time_off_seen_by_who_decides.test.sql`, `time_off_voting.test.sql`, `time_off_shortens_for_a_shift.test.sql`, `time_off_cancellation_requests.test.sql`, `schedule_requests.test.sql`, `authorization_matrix.test.sql` (S2, S3 hücreleri), `ci-green.txt`.
- **Bağımlılık:** A2 main'de (aynı matris ve katalog test dosyaları). Q1 ve Q2 cevaplanmadan K-S2'nin Shift changes kısmı ve Shift changes "View"ine dokunulmaz; geri kalanı beklemez.
- **Done when:** (a) belgesi gecikmiş müdür bekleyen ve kapanmış izni okur, `decide` 42501 + `authz.*` alır (pgTAP); (b) özel rolde Time off "read" seviyesi verilemez, verilmiş satır yok (pgTAP + SELECT sayımı 0); (c) yerel kuyrukta çift bildirim ölçümü (D O4: 5 talep) yeniden yapılınca 0 (SELECT, komut + sonuç Notes'a); (d) R2-23, R2-45, R2-53 alıcı / metin hücreleri (pgTAP); (e) sıralama: 120 talepte "Decide by" sırası sayfalar boyunca kesintisiz (pgTAP); (f) BL-507: süre işi hatası tabloya yazılıyor (pgTAP); (g) R2-55 hücreleri; `authz_catalog` sayaçları yalnız azaldı.
- **Test plan:** kırmızı pgTAP → migration (rollback denemesi) → `test:db`.
- **Reviewer:** `nf-guvenlik` zorunlu.

### B1 — FB-6.4 A3 + Requests API, shared ve web veri katmanı (`nf-backend`; R3: "hayır" sözleşmesi, izin anahtarları)
- **Ne:** `FB-6.4.md` A3.1–A3.6 (A3.5 yukarıdaki madde 6 ile). Bulgular: R2-21 (BL-363, BL-176, ikinci istek yardımcısı tek yardımcıya iner ve 401'de çıkışa yönlendirir, üye olmayana 404), R2-40 (BL-375, `isNoAccess` + ortak `NoAccessState`), R2-32 (BL-200), R2-10 (arama / filtre değişince önceki veri ekranda kalır, `placeholderData`; arama uzunluk sınırı şemada ve ekran hata yazısına düşmez), R2-20 (aynı kök, Shift changes), R2-11'in veri yarısı (hata türü: erişim yok / bağlantı / sunucu), R2-15'in shared + ekran yarısı (`packages/shared/src/role-permissions.ts`'te Time off yalnız "Manage"; Settings → Roles'ta "View" seçeneği kalkar), R2-46 (izin açıklaması), R2-55'in API / shared yarısı (BL-411 eşlemesi, BL-509: yalnız gerçek "bayat" 409, BL-517 shared şeması, BL-518 saat dilimi zorunlu, BL-110 shared `time_unknown`).
- **Touches:** `apps/api/src/schedule/schedule-requests-routes.ts`, `schedule-requests-service.ts`, `apps/api/src/shift-exchanges/**`, `apps/api/src/time-off/time-off-voting-service.ts`, `time-off-shorten-*.ts`, `apps/api/src/app.test.ts` (Requests satırları), `packages/shared/src/shift-exchanges.ts`, `employee-hub.ts`, `time-off.ts`, `role-permissions.ts`, `apps/web/src/schedule/requests-data.ts`, `apps/web/src/employee-hub/shift-exchanges/exchange-data.ts`, `apps/web/src/auth/**`, `apps/web/src/lib/no-access.ts`, `apps/web/src/views/ScheduleRequestsPage.tsx` (yalnız kapı ve sorgu), `ShiftExchangeHub.tsx` (yalnız veri ve `isNoAccess`), `apps/web/src/settings/RolesSettingsPage.tsx` (yalnız seçenek listesi).
- **Bağımlılık:** A1 + A2 + A3 main'de (A3.2 shared şeması motorun şeklini izler; K-S3 DB'de önce kalkar).
- **Done when:** `FB-6.4.md` Done when 5, 8, 9; ek olarak: (a) Requests okuması için tek rota var, web onu çağırıyor, `schedule-requests-routes.ts`'te `permissions.includes` 0 (grep); (b) üye olmayan 404, yetkisiz 403 + `authz.*` (API vitest); (c) oturum düşünce (401) Requests çıkışa yönlendiriyor (web vitest); (d) aramaya harf yazarken sayfa yükleme yazısına dönmüyor ve kutu odağı koruyor; 200 karakterlik arama hata ekranı üretmiyor (web vitest); (e) Settings → Roles → Requests → Time off'ta "View" yok (web vitest + shared test); (f) `grep -rn "permissions.includes" apps/web/src | wc -l` 21 → ≤ 20.
- **Test plan:** API vitest, web vitest (`ScheduleRequestsPage.test.tsx`, `ShiftExchangeHub.test.tsx`, `RolesSettingsPage.test.tsx`), shared test; tam kapı (lint, typecheck, test, build).
- **Reviewer:** `nf-guvenlik` zorunlu (A3 ayrı ONAY, `FB-6.4.md`).

### B2 — Requests'in çalışan davranışları (`nf-backend`; R2)
- **Ne:** ekran mantığı (görünüm değil):
  - R2-09: bildirimden `?request=<id>` ile gelen kapanmış talep, doğru kuyruğu (Closed) seçip çekmeceyi açar; görülemeyen talepte Shift changes'teki "outside your list filters" bandının Time off karşılığı.
  - R2-08 / K-S2 ekranı: `apps/web/src/documents/DocumentAccessRoute.tsx`'te Requests için yönlendirme istisnası; Approve / Deny kapalı, yanında "belgen eksik" notu (metin C1'de cilalanır).
  - R2-12: sıralama parametresinin sunucuya bağlanması.
  - R2-43: geçmiş izinde Revoke yok; Revoke penceresi açılmış vardiyaların açık kalacağını söyler (KARARLAR "İzin": iptal / revoke'ta açılan vardiyalar açık kalır).
  - R2-44: eşzamanlı kararda ikinci müdüre tek satır açıklama ("Ayşe already decided this request").
  - R2-18: onay vermiş müdür vakayı "kendi işi" olarak görmez, düğme bir daha basılamaz.
  - R2-19 / K-S5: notun vaka geçmişinde gösterilmesi (karar verebilenlere).
  - R2-47 (TS kısmı): "Discard request decision?" sarmalayıcısı silinir (Shorten kapanırken sormaz, P26), `conflict_count`, `.request-sr-only`, yok sayılan parametre.
- **Touches:** `apps/web/src/views/ScheduleRequestsPage.tsx`, `TimeOffShorten.tsx` (yalnız sarmalayıcı), `TimeOffProgressPanel.tsx`, `apps/web/src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx` (R2-18, K-S5), `apps/web/src/documents/DocumentAccessRoute.tsx`, ilgili `*.test.tsx`.
- **Bağımlılık:** B1 main'de (aynı dosyalar).
- **Done when:** her madde için en az bir web vitest (önce kırmızı); bildirime tıklayan müdür kapanmış talebin çekmecesini görüyor (vitest + C'nin bakamadığı akış için D'de e2e); `grep -c "Discard request decision" apps/web/src` 0.
- **Test plan:** web vitest; tam kapı.
- **Reviewer:** tek bağımsız inceleme (`nf-guvenlik` ya da `/code-review`; DocumentAccessRoute istisnası yönlendirmeyi değiştirdiği için `nf-guvenlik` önerilir).

### C1 — Time off görünümü ve ekran geneli (`nf-arayuz`; R1/R2)
- **Ne:** K-S6 Time off kısmı (R2-29 BL-604: `list-page` iskeleti; ölçüler KARARLAR Genel "Liste sayfalarının ortak dili"), R2-27'nin 30 px kayması, R2-26 (BL-658 (2)), R2-24 (BL-658 (1), R85), R2-25 (BL-658 (3)), R2-05 (BL-657), R2-35 (BL-513), R2-37 (Time off çipi), R2-38 (BL-256 + BL-399), R2-28 Time off kısmı (Activity, onay saati, Shorten "GMT+3"; workspace 12/24 ayarı), R2-41 (BL-653 + "View-only access" yerine "karar verilecek bir şey yok" anlamı), R2-42 etiketi, R2-54 (BL-398), R2-11 görünüm (başlık ve sekmeler kalır, "Try again"), R2-48 (`aria-pressed`, satır adı, sekmeler ok tuşuyla — BL-602), R2-50 (başarısız tek tık onayında odak), G3 seçimi (R2-52), K-S2 notunun metni.
- **Touches:** `apps/web/src/views/ScheduleRequestsPage.tsx` (görünüm), `requests-catalog.css`, `list-page.css` (yalnız Requests'e özgü ek gerekirse; ortak değer değişmez), `TimeOffShorten.tsx`, `TimeOffProgressPanel.tsx`, `apps/web/src/employee-hub/time-off.css`, `apps/web/src/styles.css` (yalnız `.request-*` satırları, ör. `:13037-13041`).
- **Bağımlılık:** B2 main'de (aynı dosya `ScheduleRequestsPage.tsx`), V'de G3 seçildi. C2 ile paralel olabilir (dosyalar ayrık; `styles.css`'te ikisi farklı satırlar — yine de aynı anda yazılmaz, sırayla gönderilir).
- **Done when:** her bulgu için önce/sonra ekran görüntüsü (masaüstü 1440 + telefon 390, owner ve tek lokasyon müdürü) `artifacts/nf-arayuz/EKRAN-02/C1/`; `requests-catalog.css`'te `outline: none` 0 (grep; bugün 1, `:218`); ham hex sayısı Requests CSS'lerinde 0 (grep); Tab ile her satır ve düğmede görünür odak (C'nin klavye senaryosu yeniden koşuldu); `nf-gorsel-qa` ONAY.
- **Test plan:** web vitest (metinler, `aria-pressed`, sekme ok tuşu); tam kapı.
- **Reviewer:** `nf-gorsel-qa` (ekran teslim edilen şey); güvenlik incelemesi yok (veri / yetki değişmiyor).

### C2 — Shift changes görünümü + FB-6.4 B (`nf-arayuz`; R2: ekran Shift Hub ile ortak)
- **Ne:** `FB-6.4.md` B.1–B.4 (madde 8: kabulde S4-E, onayda S5-B; G1 ve G2 seçimleri), R2-02 / R2-17 işaretleri, R2-04 (Decline application ve Close search kırmızı iki tık, `ConfirmButton` / `useConfirmClick`), R2-27 Shift changes kısmı (BL-658 (4)(5)(6)(7): Time off denetimi, arama simgesi, başlık satırı, X 17×17, boş hâlde tek çerçeve, "Try another date range" metni; G4 teyidi), K-S6 Shift changes kısmı, R2-28 Shift changes kısmı (`ExchangeShiftCard.tsx:44` sabit `"12h"`, ham ISO tarih; R52, R59), R2-36 (BL-400), R2-37 Shift changes çipi, R2-47 CSS kısmı (4 karanlık tema kuralı, 30 ham renk), R2-49, R2-51 (BL-661), BL-397 (rıza metni tek görünüm), BL-110 hub metni ("Unconfirmed"), `EmployeeDashboard.tsx:325` ölü çapa.
- **Touches:** `apps/web/src/employee-hub/shift-exchanges/ShiftExchangeHub.tsx` (görünüm), `shift-exchanges.css`, `ExchangeShiftCard.tsx`, `apps/web/src/views/EmployeeDashboard.tsx` (yalnız çapa).
- **Bağımlılık:** B2 main'de (aynı dosya), V'de G1 + G2 seçildi.
- **Done when:** `FB-6.4.md` Done when 11; ek olarak: Decline application ve Close search kırmızı ve iki tık (web vitest); `shift-exchanges.css`'te ham hex 0 ve `prefers-color-scheme: dark` 0 (grep); Shift changes ile Time off'un başlık satırı, arama ve sekme yüksekliği aynı (ekran görüntüsü, piksel ölçümü); Shift Hub (çalışan) ekranında regresyon yok (`nf-gorsel-qa`, ekran 13'ün bugünkü hâli).
- **Test plan:** web vitest; tam kapı.
- **Reviewer:** `nf-gorsel-qa` zorunlu; ekran yetki sonucunu gösteriyor (G1) ama yetki kodu değişmiyor → güvenlik incelemesi yok.

### C3 — Ortak bileşenler (`nf-arayuz`; R2) — EKRAN-01 ile sırayla
- **Ne:** R2-06 (BL-656: `ConfirmDialog` kapanınca odak açan düğmeye döner; Esc önce pencereyi, sonra çekmeceyi kapatır), BL-580 (`ConfirmDialog` telefonda 8 px kayma; sınırda, Schedule'da da var), R2-31 (BL-515: `CatalogDrawer` açıkken toast tıklanır ve okunur), R2-39 (BL-663: sıralı sütun oku hep görünür — Settings katalog listeleri de değişir), R2-57 (BL-589: `.app-confirm h2` 850/900), R2-30 / K-S7'nin seçimi (BL-600 + BL-255: `--theme-border-control` ve beyaz düğme kenarı).
- **Ortak değer kuralı:** sıralı sütun oku ve kenar rengi ortak değerdir. Önce kural KARARLAR'a yazılır (koordinatör), değişen öteki ekranlar adıyla söylenir: oku → Settings → Locations, Jobs, Acknowledgements, Shift catalog, Employees; kenar → bütün liste sayfaları ve Schedule üst çubuğu (aynı token, `styles.css:85`, `:3571`). Uyuşmayan ekranları düzeltmeden önce sorulur (bu dilimde yalnız token değişir; ekranlar zaten token'ı okuyor).
- **Touches:** `apps/web/src/shell/ConfirmDialog.tsx`, `apps/web/src/settings/CatalogDrawer.tsx`, `apps/web/src/views/CatalogSortButton.tsx`, `apps/web/src/styles.css` (`:85`, `:1298-1310`, `:7361`, `:7394`), `packages/ui/**` (beyaz düğme kenarı orada ise).
- **Bağımlılık:** V'de S7 seçildi; **EKRAN-01'in aynı dosyalardaki dilimi** main'e girdi ya da başlamadı (aşağıdaki tablo).
- **Done when:** odak dönüşü ve Esc sırası web vitest'te (`ConfirmDialog.test.tsx`); toast çekmece açıkken tıklanıyor (vitest); ok her zaman görünür ve yönü çizili (ekran görüntüsü); seçilen kenar kontrastı ölçülmüş oran ile Notes'ta; BL-580 telefonda 0 px kayma (ekran görüntüsü); `nf-gorsel-qa` ONAY (Requests + bir Settings liste sayfası + Schedule üst çubuğu).
- **Test plan:** web vitest; tam kapı.
- **Reviewer:** `nf-gorsel-qa`; birden çok ekran değiştiği için tek bağımsız kod incelemesi (`/code-review`).

### D — Akış 9 e2e ve Requests e2e boşlukları (`nf-test`; R2)
- **Ne:** `FB-6.4.md` C (a)–(e) ve ek: (f) owner'ın takasını Kadıköy müdürü onaylar (K-S1); (g) müdür kendi vakasında reddedemez; (h) R2-58 e2e listesi: müdürün iptal onayı, Shorten, iki müdür yarışı (R2-44), Shift changes reddi (kırmızı iki tık); (i) bildirimden kapanmış talebe gelme (R2-09).
- **Touches:** `e2e/flows/shift-hub-*.spec.ts`, `e2e/flows/time-off-*.spec.ts` (yeni ya da mevcut), `supabase/test-support/builder.sql` gerekirse (`nf-db` ile sırayla).
- **Bağımlılık:** C2 main'de (ekran metinleri ve düğmeler son hâlinde); `db.lock`; CI boşken (`gh run list --limit 3`).
- **Done when:** `FB-6.4.md` Done when 10 + (f)–(i) main CI e2e'de yeşil; `skip` / `fixme` yok.
- **Test plan:** `pnpm.cmd e2e` (`db.lock`, 5565/5566).
- **Reviewer:** koordinatörün okuması (yalnız test dosyası, R0/R1).

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | EKRAN-01 ile ortak dosya | Büyüklük (puan) |
|---|---|---|---|---|---|
| V varyant | `nf-arayuz` | R1 | yok | `styles.css` (yalnız dalda, main'e girmez) | 2 |
| A0 sayfalama | `nf-db` | R2 | yok | `ci-green.txt` | 1 |
| A1 motor | `nf-db` | R3 | A0 | `ci-green.txt`, `ci-not-green.txt`, `retired_objects_stay_gone` | 5 |
| A2 yetki | `nf-db` | R3 | A1 (aynı dal olabilir) | `authorization_matrix`, `authorization_coverage`, `authz_catalog`, `retired_objects_stay_gone`, `ci-green.txt` | 6 (FB-6.4'ün 5'i + K-S1, K-S4, K-S5, ret dalı) |
| A3 izin kuralları | `nf-db` | R3 | A2 | `authorization_matrix`, `ci-green.txt` | 4 |
| B1 API + veri | `nf-backend` | R3 | A1 + A2 + A3 | `apps/web/src/lib/no-access.ts`, `apps/web/src/auth/**` (Schedule B-5 / BL-395 dokunursa) | 4 |
| B2 ekran davranışı | `nf-backend` | R2 | B1 | yok | 3 |
| C1 Time off görünüm | `nf-arayuz` | R1/R2 | B2, V (G3) | `styles.css` (`.request-*` satırları) | 3 |
| C2 Shift changes + FB-6.4 B | `nf-arayuz` | R2 | B2, V (G1, G2) | yok | 3 |
| C3 ortak bileşenler | `nf-arayuz` | R2 | V (S7), EKRAN-01 sırası | `ConfirmDialog.tsx`, `styles.css` (`:85`, `:7361`, `:7394`), `packages/ui/**` | 2 |
| D e2e | `nf-test` | R2 | C2 | `supabase/test-support/builder.sql` (gerekirse) | 3 |
| **Toplam** | | **R3** | | | **36** |

Puan ölçütü ILERLEME "Büyüklük ölçütü" (FB-6.4'ün 19 puanı A1 5 + A2 5 + A3 3 + B 3 + C 3 burada A1, A2, B1, C2, D'ye dağıldı). Takvim tahmini: paralel iki hatla (`nf-db` hattı ve V) ~2,5–3 kişi-hafta.

**Paralellik:** V ve A0 hemen başlar. `nf-db` hattı (A0 → A1 → A2 → A3) tek sırada (aynı test dosyaları). B1 → B2 tek sırada. C1 ile C2 aynı anda yürüyebilir (ayrı dosyalar), ama main'e sırayla gider. C3, EKRAN-01'le ortak dosyalar yüzünden sıraya girer.

## EKRAN-01 (Schedule) ile ortak dosyalar
İki ekran paralel yürüyebilir; aşağıdaki dosyalarda aynı anda iki oturum yazmaz. Sıra: hangi ekranın dilimi önce başlarsa o bitirip main'e alır, öteki yeni `origin/main`'den başlar. EKRAN-01'in görev dosyası bu yazıldığında repoda yoktu (`docs/plan/tasks/EKRAN-01-SCHEDULE.md` henüz main'de değil); liste EKRAN-01 OZET'inden çıkarıldı, o dosya yazılınca koordinatör eşler.

| Dosya | EKRAN-02'de | EKRAN-01'de | Not |
|---|---|---|---|
| `apps/web/src/styles.css` | C1 (`.request-*`), C3 (`:85` token, `:1298-1310` ok, `:7361` / `:7394` onay kutusu) | çok sayıda (BL-450 kenar `:3571`, C-D3 odak, cila listesi) | en sıcak ortak dosya |
| `--theme-border-control` (`styles.css:85`) | K-S7 (Mert varyantla seçecek) | BL-450 (EKRAN-01 OZET: "kenar 3:1'e koyulaştırılır", koordinatör kararı P19) | **aynı token** → Açık soru Q3 |
| `apps/web/src/shell/ConfirmDialog.tsx` | C3 (BL-656, BL-580) | Schedule pencereleri (C-D3 odak, BL-580 Unpublish 8 px) | BL-580 iki ekranın listesinde; tek yerde yapılır |
| `supabase/tests/authorization_matrix.test.sql`, `authz_catalog`, `authorization_coverage`, `retired_objects_stay_gone`, `ci-green.txt`, `ci-not-green.txt` | A0–A3 | B-1 / B-3 (BL-276 parça 3), B-2 canlı kanal, B-5 Export | `nf-db` hattında sıra; yeni migration'ların zaman damgası rebase'de kontrol edilir |
| `apps/web/src/lib/no-access.ts`, ham hata yardımcıları | B1 (R2-11, R2-40) | D-O7 / BL-395 (ham hata metni 15+ yer) | ortak hata gösterimi tek biçim olmalı |
| `apps/web/src/auth/**` | B1 (`PermissionRoute` → `can()`) | B-5 (Export yetkisi) | |

## Out of scope
1. **Shift Hub'ın (ekran 13) kendi işleri:** BL-652 (geçmiş ertesi gün kayboluyor — müdürün Shift changes → History'sini de etkiliyor; karar ekran 13 ile ortak), BL-057 (Shift Hub bilgi mimarisi). C2'de Shift Hub yalnız FB-6.4 B'nin ve ortak bileşenin gerektirdiği kadar değişir.
2. **Workspace (ekran 5):** BL-410 ("Pending requests" kutusu; Shift changes sayısı onaylanamayacak vakaları da sayıyor). Rütbe kuralı A2'de gelince sayı da aynı kurala geçmeli; Workspace turunda yapılır, o zamana kadar sayı fazla gösterir (adıyla bırakıldı).
3. **Schedule (ekran 1):** BL-362 ("izni kısalt ve ata"), BL-544 (izin ve kapalı gün vardiyayı ayrı ayrı açıyor; Important Dates ile ortak), BL-519 (A1'in dokunmadığı kısım), izin onayı ile ızgara yazımının aynı kilidi alıp almadığı (B §5, ölçülmedi).
4. **Settings (ekran 10):** BL-523 (onaylı izin anahtarı). Settings → Roles'ta yalnız K-S3 ve R2-46 bu turda.
5. **Employee Hub ortak dosyaları:** `TimeOffPeriods`, `TimeOffReleasedAssignments`, `time-off-split`, `TimeOffCancellationHours` — R2-28 ve R2-42 iki ekranı da etkiler; çalışan tarafının talep açma ve iptal fonksiyonları ekran 11–12'nin. BL-512 (2), (4), (5).
6. **FB-6.4 Out of scope 1, 2, 4, 5:** Schedule'ın kendi atama denetimi (`assign`) ve `assess_weekly_shift_availability`'nin 16 okuyucusu (rafta); belge mimarisi (rafta); yeni "release" vaka türü; Line Up.
7. **Canlı kanal** `shift-exchanges:<workspace>` (talep ve vaka id'si duyuruluyor, içerik yok; B bulgu saymadı). EKRAN-01'in B-2'si (canlı kanal çekirdeğe) aynı tasarımla bunu da kapsayabilir; orada karar verilir.
8. **Bakılamayanlar** (OZET §8): arşivli lokasyonda takas onayı, personelsiz lokasyon müdürünün "View-only" görmesi, silinmiş lokasyonda ham hata, performans. Uygulama sırasında rastlanırsa backlog'a yazılır.
9. **BL-508** bayat (KK-158) ve **BL-041** şemsiye: kayıt işi, koordinatörün.

## Done when (ekranın tamamı)
1. A0, A1, A2, A3, B1, B2, C1, C2, C3, D dilimlerinin her birinin Done when'i kanıtıyla bu dosyanın Notes / Result'ında (komut + sonuç, sha).
2. OZET §1'in 58 bulgusunun her biri bir dilimde kapandı ya da Out of scope'ta adıyla duruyor (yukarıdaki eşleme tablosuna "kapandı <sha>" sütunu eklenir).
3. Prototip "taşı" listesinin 14 maddesi gerçek uygulamada (ekran görüntüsüyle).
4. Ekranın açık backlog maddeleri (A raporunun 39'u) kapandı ya da Out of scope'ta adıyla; BL-041 kapandı.
5. `FB-6.4.md` Done when 1–12 (yukarıdaki değişikliklerle) tamam.
6. V'nin beş kararı KARARLAR'da; seçilmeyen varyantlar hiçbir dalda kalmadı.
7. Tam kapı yeşil (lint, typecheck, test, build, `test:db`, etkilenen e2e); main CI check + db + e2e yeşil.
8. Masaüstü 1440 ve telefon 390 ekran görüntüleri (owner, tek lokasyon müdürü, belgesi eksik müdür) `artifacts/nf-gorsel-qa/EKRAN-02/kapanis/`; `nf-gorsel-qa` ONAY.
9. Schedule ızgara okuması ≤ 50 ms korundu (`schedule_grid_read_budget`).

## Touches (özet)
- `nf-db`: `supabase/migrations/**` (yeni), `supabase/tests/**` (A0–A3'te adıyla), `ci-green.txt`, `ci-not-green.txt`.
- `nf-backend`: `apps/api/src/schedule/**`, `apps/api/src/shift-exchanges/**`, `apps/api/src/time-off/**`, `packages/shared/src/{shift-exchanges,employee-hub,time-off,role-permissions}.ts`, `apps/web/src/schedule/requests-data.ts`, `apps/web/src/employee-hub/shift-exchanges/exchange-data.ts`, `apps/web/src/auth/**`, `apps/web/src/lib/**`, `apps/web/src/documents/DocumentAccessRoute.tsx`; `ScheduleRequestsPage.tsx`, `ShiftExchangeHub.tsx`, `RolesSettingsPage.tsx` yalnız veri, kapı ve davranış.
- `nf-arayuz`: `ScheduleRequestsPage.tsx`, `ShiftExchangeHub.tsx` (görünüm), `requests-catalog.css`, `shift-exchanges.css`, `list-page.css`, `time-off.css`, `TimeOffShorten.tsx`, `TimeOffProgressPanel.tsx`, `ExchangeShiftCard.tsx`, `EmployeeDashboard.tsx` (çapa), `ConfirmDialog.tsx`, `CatalogDrawer.tsx`, `CatalogSortButton.tsx`, `styles.css`, `packages/ui/**`.
- `nf-test`: `e2e/flows/**`.
- Sıcak noktalar: `ScheduleRequestsPage.tsx` (B1 → B2 → C1), `ShiftExchangeHub.tsx` (B1 → B2 → C2). Hiçbirinde iki rol aynı anda yok.

## Test plan (özet)
- **pgTAP** (A0–A3): önce kırmızı hücre (`superpowers:test-driven-development`), migration tek transaction + rollback denemesi, `pnpm.cmd test:db` `db.lock` ile; yeni dosyalar `ci-green.txt`'e.
- **vitest** (B1, B2, C1–C3): API, shared ve web; her bulgu kendi testini getirir (R2-58 listesi: arama, filtre, sıralama, sayfa, bağlantı, 409).
- **e2e** (D): akış 9 (a)–(e) + (f)–(i).
- **Görsel:** V'de varyant ekran görüntüleri; C1–C3'te önce/sonra, masaüstü + telefon; kapanışta `nf-gorsel-qa`.
- Ağır işler aynı anda en çok iki; başlamadan `gh run list --limit 3` (CLAUDE.md §3).

## Risk
- **R3.** En riskli nokta A1 + A2: motor beş aday kontrolünün davranışını birebir taşımazsa takas sessizce açılır ya da kapanır. Önce bugünkü davranışı kilitleyen hücreler, sonra değişiklik hücreleri (`FB-6.4.md` Risk).
- **Bildirim kitlesi daralıyor (K-S4):** owner ve admin bugün aldığı takas bildirimlerini almayacak. Müdürsüz lokasyonda yedek alıcı kuralı pgTAP'te kilitlenmezse talep sahipsiz kalır.
- **K-S2 bir kısıt istisnası açıyor:** belgesi eksik kişi için `requests.read` açılırken `time_off.decide` ve öteki yönetim eylemleri kapalı kalmalı; `restricted_ok` eylem başına (KARARLAR DATA-08), genelleme yazılmaz.
- **Ortak değerler (C3):** kenar token'ı ve sıralama oku birçok ekranı aynı anda değiştirir; EKRAN-01'in BL-450 kararıyla çakışma (Q3).
- **Dosya çakışması:** `ScheduleRequestsPage.tsx` ve `ShiftExchangeHub.tsx` üç dilimden geçiyor; sıra bozulursa rebase çatışması ve inceleme yenilemesi.
- **Canlıya:** OPS-03 (main → canlı); nesne silen iş (A2) önce main, main CI yeşil, sonra yedekli canlı (CLAUDE.md §8 sürekli yetki).

## Ultrareview
- **A2** (yetki çekirdeği, üç yardımcının silinmesi, katalog sayaçları; CLAUDE.md §5 "en riskli iş"): kullanıcıya tek satır öneri — "EKRAN-02 A2 takas onayının yetkisini çekirdeğe taşıyor ve eski yardımcıları siliyor; bu worktree'nin oturumunda `/code-review ultra <kısa not>` önerilir." Ücretsiz hak bittiyse açılış penceresindeki dolar tutarıyla. Not: Mert FB-6.3.7 ve FB-6.7 A'da "iki inceleme yeter" dedi (ILKELER P06); öneri yine yazılır, karar Mert'in.
- A1, A3, B1: önerilmez (A1 + A2 tek `nf-guvenlik` ONAY'ı ve A3 / B1'in kendi ONAY'ı yeter; ücretsiz hak bittiyse yalnız en riskli iş).

## Açık sorular (CLAUDE.md §13)
**Q1 — Özel rolde Shift changes için "View" (yalnız görme) seviyesi kalsın mı?**
1. Bugün: Settings → Roles → bir rol → Requests → Shift changes: "View" seçilebiliyor (`packages/shared/src/role-permissions.ts:75-79`, `schedule.shift_change_requests.read`). Bu rol karar veremediği takas vakalarını görüyor. Mert'in 2026-10-05 kararı (K-S3) yalnız Time off için verildi.
2. Örnek: owner "Shift lead" rolü açıp Shift changes'i "View" yapıyor. Can, Kadıköy'ün bütün bekleyen devir ve cover vakalarını görüyor, hiçbirine karar veremiyor.
3. Seçenekler:
   - **(a) Kalır (Önerilen).** Can vakaları görür, Approve / Decline düğmesi yoktur. Takas vakaları zaten çalışanlara Shift Hub'da açık (cover ve açık vardiya herkese görünür); izin gibi kişisel bir talep değil. Engel yok; ayar değişmez.
     `Dayanak: yok — yeni karar`
   - (b) Time off gibi kalkar: görme, karar verme izniyle gelir. Settings → Roles'tan Shift changes "View" kalkar.
   - (c) Kalır ama yalnız kapanmış vakaları gösterir.
   - Kaçış: "Claude karar versin", "Önce sohbette konuşalım" (yetki modeli, P18).
4. Etki: A3 ve B1'in Shift changes kısmı bu cevabı bekler; geri kalanı beklemez.

**Q2 — Belgesi eksik müdür Shift changes sekmesini de görsün mü?**
1. Bugün: belgesi gecikmiş müdür uygulamayı açınca Account → Documents'a yönleniyor (`apps/web/src/documents/DocumentAccessRoute.tsx:32`); Requests'in iki sekmesini de görmüyor. KK-158 (S2) "Requests'i görür, oy veremez" diyor; gerekçesi Mert'in 2026-10-01 S3 kararı ve o karar yalnız izin talebi içindi.
2. Örnek: Kadıköy müdürü Hande'nin gıda sertifikasının süresi geçti. Ali'nin Salı izni ve Veli'nin Cuma cover talebi bekliyor.
3. Seçenekler:
   - **(a) İki sekme de açılır; Time off'ta ve Shift changes'te kararlar kapalı, yanında "belgen eksik" notu (Önerilen).** Hande Ali'nin iznini ve Veli'nin cover vakasını görür, ikisine de karar veremez. Takas kararı vardiyanın lokasyonundaki öteki müdüre ya da admin'e gider (A2 Done when 6: kısıtlı müdür onaylayamaz).
     `Dayanak: KARARLAR "Schedule → Requests" (belgesi eksik müdür Requests'i görür, oy veremez; KK-158, 2026-10-05)`
   - (b) Yalnız Time off açılır; Shift changes sekmesinde "belgen tamamlanınca görebilirsin" yazısı.
   - (c) Yalnız Time off açılır; Shift changes sekmesi hiç görünmez.
   - Kaçış: "Claude karar versin".
4. Etki: A3'ün `requests.read` / `exchange.read` istisnası ve B2'nin yönlendirme istisnası bu cevabı bekler.

**Q3 — (koordinatöre, süreç) Kenar rengi token'ı iki ekranın kararında: hangisi önce?**
- `--theme-border-control` (`styles.css:85`, `#aeb9b4`) hem Schedule üst çubuğunun kenarı (EKRAN-01 BL-450, `styles.css:3571`) hem liste sayfalarının arama / açılır liste kenarı (`list-page.css:91,113`). EKRAN-01 OZET'i BL-450 için "3:1'e koyulaştırılır" kararını koordinatör kararı olarak yazdı (ILKELER P19); EKRAN-02'de Mert aynı renk için "ikisini yan yana göster" dedi (K-S7, P04).
- Öneri: token değişikliği S7'nin varyant seçimine bağlanır ve tek yerde (C3) yapılır; EKRAN-01'in BL-450'si ya C3'ü bekler ya da ayrı bir token alır. Karar koordinatörün (iki ekranın sırası); Mert'e giden S7 varyantında Schedule üst çubuğu da gösterilir.

**Cevaplar (2026-10-06, KARARLAR "Schedule → Requests"):** Q1 (a) Mert: Shift changes "View" kalır · Q2 (a) koordinatör kararı (KK-162): iki sekme açık, kararlar kapalı · Q3 koordinatör kararı (KK-162): kenar rengi token'ı tek yerde (C3) değişir, S7 varyant seçimine bağlı; varyantta Schedule üst çubuğu da gösterilir; EKRAN-01 BL-450 C3'ü bekler.

## Notes / Result
- 2026-10-05: görev dosyası yazıldı (`nf-planlama`, dal `task/ekran-02-taskfile`). Ölçümler yukarıdaki Tazelik satırında. Koordinatöre: (1) `FB-6.4.md`'nin eşlenmesi (yukarıdaki 13 madde), (2) OZET §3'teki 31 yeni bulgunun BL numaraları ve eşleme tablosuna işlenmesi, (3) Q1–Q3.
