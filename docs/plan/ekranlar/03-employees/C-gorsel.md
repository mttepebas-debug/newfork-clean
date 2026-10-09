# C — Employees: görsel QA (EKRAN-03, 2026-10-06, 31649359)
KARAR: BULGU VAR (kritik 0, yüksek 5, orta 9, düşük 11)

## Özet
- **En büyük sorun klavye kullanıcısı için.** Listede bir kişiyi açınca odak çekmeceye geçmiyor; Tab önce arkadaki 14 satırı dolaşıyor. Satırın kendisinde de görünür odak halkası yok.
- **İşten çıkarma penceresi buton dilini bozuyor.** Son düğme "Confirm termination" Approve gibi yeşil. Gerekçe boşsa tarayıcının kendi uyarı balonu çıkıyor. Odak pencereye girmiyor, Esc'ten sonra sol menüye düşüyor.
- **ABD form kuralları çekmecede yok (BL-503).** "Iğdır Şule" yazılabiliyor. Ali'nin iki telefonu iki ayrı biçimde duruyor: "+14155550123" ve "4155550100"; maske de, sabit "+1" de yok. Ali'nin e-postasıyla ikinci kişi eklenirken uyarı çıkmıyor.
- KARARLAR'daki 2026-10-05 kararı uygulanmamış: telefonda "Terminate employee" ve "Restore employee" hâlâ yok (BL-407).
- Liste eski liste dilinde (BL-604). Hemen altındaki Employees → Documents sayfası yeni dilde, iki komşu sayfa farklı görünüyor.
- Yeni bulgular: yeşil yıkıcı onay, satır odağı, doğrulama hatasının gri çıkması, çekmecede mavi tarayıcı kutucukları, ham "Failed to fetch", telefonda çekmecede kişinin adının olmaması, Access düğmelerinin üç ayrı ölçüsü.
- Çekmecenin KARARLAR'daki ekran kararlarının çoğu yerinde: Remove iki tık, müdürün kilitli Terminate'i ve açıklama satırı, Esc'in katman katman kapatması, kapanırken sormama, e-posta işaretleri, ad yerleşimi.

## Nasıl bakıldı
- **Sunucular:** web 5638, api 5639 (`nf-planlama` portları). Dal `task/ekran-03-employees` @ `31649359`.
- **Tarayıcı:** gerçek Chrome, Playwright, başsız. Tarayıcı bağlamı `en-US` ve `America/New_York` ile açıldı.
- **Yazma engeli:** API'ye ve Supabase'e giden GET, HEAD ve OPTIONS dışındaki her istek tarayıcıda 500 ile kesildi. İki istek kesildi, ikisinde de veri yazılmadı:
  - bir HEAD isteği (`account_organization_history`; sonra HEAD serbest bırakıldı);
  - bekleyen tercih edilen adda "Use it" denemesinin POST'u (`…/preferred-names/…/decision`).
- **Yerel DB:** yalnız SELECT (`docker exec supabase_db_newfork-clean psql`).
- **Hesaplar:** World `e2e1790876179369`, parola `e2e/global-setup.ts`'deki dünya parolası.
  - Owner Olcay (`owner.4f81cbfa`).
  - Tek lokasyonlu müdür Ayşe (`ayse.1be2994c`, yalnız Kadıköy).
- **Genişlikler:** masaüstü 1440×900, telefon 390×844 (dokunmatik açık, `hasTouch`).
- **Gerçek veriyle görülenler:** 16 kişilik liste; Ali'nin çekmecesinin altı bölümü; davetli Farmpfgu (bekleyen davet); onboarding'deki Invlgl74; owner'ın kendi kaydı; müdür Ayşe'nin Emre'si ve kendi kaydı; boş sekme, boş arşiv, sonuçsuz arama.
- **Taklitle görülenler (yalnız GET cevabı değiştirildi):**
  - Yükleniyor hâli (cevap 4 sn geciktirildi).
  - Ağ hatası (istek kesildi).
  - Bozuk cevap.
  - "Needs Attention" çipi, uzun ad, lokasyonsuz kişi ("No location" çipi).
  - Arşivli liste ve arşivli çekmece.
  - Bekleyen tercih edilen ad ("Alex").
- **Çevre notu:** başsız Chrome'un arayüz dili Türkçe. Bu yüzden tarih alanı "gg.aa.yyyy", doğrulama balonu "Lütfen bu alanı doldurun." gösterdi. ABD tarayıcısında "mm/dd/yyyy" ve "Please fill out this field." çıkar; bulgular bunu hesaba katıyor.
- **Skill:** `design:design-critique` ve `design:accessibility-review` çerçeve olarak kullanıldı. Kontrast her öğede bilgisayarlı stil ölçümüyle hesaplandı.

## 1. Bulgular (önem sırasıyla)

**1. Yüksek — Çekmece açılınca klavye odağı arkada kalıyor; Tab önce 14 satırı dolaşıyor, sonra çekmeceden arkaya kaçıyor.** `leave: high / do: safe` — **BL-478 (değişmiş: kayıtlı hâlinden geniş)**
- **Nerede:** Employees → bir satırda Enter → kişi çekmecesi.
- **Örnek:** Owner klavyeyle Ali'nin satırında Enter'a basıyor. Çekmece açılıyor ama odak Ali'nin satırında kalıyor. Tab, çekmece kapalıymış gibi Ayse, Both7vf6k … Zeynep satırlarından geçiyor. On beşinci Tab'da çekmeceye giriyor. Son düğmeden (Cancel) sonra sol menüye kaçıyor.
- **Kanıt:**
  - Ölçülen sıra: "focus after open: TR Ali Person … inDrawer=false", ardından 14 × `OUT:TR`, sonra `D:BUTTON:Profile` … `D:BUTTON:Cancel | OUT:BODY | OUT:BUTTON:Collapse menu`.
  - Çekmece `aria-modal="true"` taşıyor (`EmployeeDrawer.tsx:922-923`). Tab tuzağı yalnız Add employee kipinde (`EmployeeDrawer.tsx:886`).
- **BL-478 ne eksik yazıyor:** madde yalnız "son düğmeden arkaya kaçıyor" diyor. Açılışta odağın hiç taşınmadığını yazmıyor. WCAG 2.4.3.

**2. Yüksek — İşten çıkarmanın son düğmesi yeşil.** `leave: high / do: safe` — **YENİ**
- **Nerede:** Employees → kişi → alt çubuk "Terminate employee" → "Terminate employee" penceresi → "Confirm termination".
- **Örnek:** Owner Ali'yi işten çıkarıyor. Geri alınamayan son düğme Approve ve Save ile aynı yeşil. Aynı çekmecedeki "Remove access" ve "Revoke invitation" kırmızı.
- **Kanıt:**
  - Ölçülen zemin `rgb(23,105,84)`, yani aksiyon yeşili.
  - `EmployeeDrawer.tsx:1620-1622`: kırmızı sınıfı olmayan düz `Button`.
  - Görüntü: `20-owner-1440-terminate-dialog.png`.
- Buton dili kuralı (yıkıcı = kırmızı) ihlali. Prototip denetimi P2 T3 bunu "polished" diye düzeltmişti; gerçek uygulamada duruyor ve backlog'da yok.

**3. Yüksek — İşten çıkarma penceresi klavyeyle doğru çalışmıyor ve tarayıcının uyarı balonunu kullanıyor.** `leave: medium / do: safe` — **YENİ**
- **Nerede:** aynı pencere.
- **Örnek:** Owner pencereyi açıyor; odak arkadaki "Terminate employee" düğmesinde kalıyor. İlk Tab doğrudan Cancel'a gidiyor; tarih, saat dilimi ve gerekçe alanları atlanıyor. İki Tab sonra odak sayfanın gövdesine ve sol menüye çıkıyor. Esc pencereyi doğru kapatıyor ve çekmece açık kalıyor, ama odak sol menüdeki "Employees" bağlantısına düşüyor.
- **Gerekçe boşken:** "Confirm termination" uygulamanın satır içi hatası yerine tarayıcının kendi balonunu açıyor.
- **Kanıt:**
  - Ölçüm: "focus in dialog: BUTTON Terminate employee"; Tab sırası "Cancel → Confirm termination → BODY → Collapse menu"; Esc sonrası "focus A Employees".
  - Balon: `validationMessage` = "Lütfen bu alanı doldurun." (ABD'de "Please fill out this field.").
  - `EmployeeDrawer.tsx:1521-1626`: odak taşıma ve tuzak yok; gerekçe kutusunda `required minLength` `:1590-1596`.
  - Görüntü: `21-owner-1440-terminate-empty-reason.png`.
- WCAG 2.4.3. CLAUDE.md §9 "tarayıcı diyaloğu yok" kuralının ruhuna aykırı (P2 T2).

**4. Yüksek — Liste satırına klavyeyle gelince görünür odak yok.** `leave: medium / do: safe` — **YENİ**
- **Nerede:** Employees listesi, satırlar.
- **Örnek:** Ayşe Tab ile Ali'nin satırına geliyor. Satır yalnız beyazdan `#f3f7f5`'e dönüyor; fareyle üzerine gelmekle aynı görünüm, 1,06:1 fark. Hangi kişiyi açacağını göremiyor.
- **Ek kusurlar:**
  - Space satırı açmıyor; yalnız Enter açıyor.
  - Lokasyon ve iş hücreleri yalnız fareyle Employment'ı açıyor.
- **Kanıt:**
  - `styles.css:1428-1432`: `tr:focus-visible { background:#f3f7f5; outline:0 }`.
  - Yeşil halka yalnız altı yeni liste sayfasında (`list-page.css:236-241`, `.list-page` kapsamı). Employees bu sınıfı almıyor.
  - Görüntü: `04-owner-1440-focus-row.png`.
- Not: sekmeler, sıralama başlıkları ve düğmeler yeşil halkayı doğru alıyor (`02-owner-1440-focus-tab*.png`). WCAG 2.4.7.

**5. Yüksek — ABD form kuralları çekmecede uygulanmıyor.** `leave: high / do: risky` — **BL-503**
- **Nerede:** Employees → Add employee → Profile; var olan kişide Profile → Contact.
- **Örnekler:**
  - "Iğdır Şule" ve "Ayşe" ad alanına yazılabiliyor.
  - Ali'nin Phone alanı "+14155550123", Emergency phone alanı "4155550100": iki biçim, maske ve sabit gri "+1" yok.
  - Add employee'de Ali'nin e-postası (`…ali.63375e85@world.test`) yazılınca hiçbir uyarı yok; Next açık.
- **KARARLAR'da ne diyor:** Türkçeye özgü harfler yasak; telefonda (xxx) xxx-xxxx maskesi ve sabit "+1" (2026-10-05 kararı); e-posta çakışması "çekmeceye yazıldığı anda" uyarılır.
- **Kanıt:** `10-owner-1440-ali-profile.png`, `32-owner-1440-create-duplicate-email.png`, `34-owner-1440-create-blur-errors.png`.

**6. Orta — Telefonda "Terminate employee" ve "Restore employee" yok; 2026-10-05 kararı uygulanmamış.** `leave: medium / do: safe` — **BL-407**
- **Nerede:** telefonda (390) Employees → kişi → alt çubuk.
- **Örnek:** Owner telefonda Ali'yi açıyor; alt çubukta yalnız Cancel ve Save changes var.
- **Kanıt:**
  - Düğme DOM'da ama 0×0 ölçüldü.
  - `styles.css:2667-2669` (BL-407'de kayıtlı) duruyor.
  - Görüntü: `20-owner-390-drawer-footer-no-terminate.png`.

**7. Orta — Alan altındaki doğrulama hatası kırmızı değil gri; hatalı alanın kenarı değişmiyor.** `leave: medium / do: safe` — **YENİ**
- **Nerede:** Add employee → Profile; var olan kişinin Profile alanları.
- **Örnek:** Owner Last name'i boş geçiyor, e-postaya "jose@" yazıyor. "Last name is required." ve "Enter a valid email address." küçük gri yazıyla çıkıyor; alanlar aynı görünüyor.
- **Kanıt:**
  - Ölçülen renk `rgb(102,113,108)`.
  - Kök neden CSS önceliği: `.employee-field small { color: var(--theme-muted) }` (`styles.css:1991-1994`) kırmızıyı veren `.employee-field-error` (`:2441-2443`) kuralını eziyor.
  - Görüntü: `34-owner-1440-create-blur-errors.png`.

**8. Orta — Çekmecede tarayıcının mavi kutucukları ve radyo düğmeleri.** `leave: low / do: safe` — **YENİ**
- **Nerede:** Employees → kişi → Employment → Jobs kutucukları ve bütün "Primary" radyoları.
- **Örnek:** Owner Ali'nin Employment'ında "Cook" kutucuğunu ve Kadikoy'un "Primary"sini parlak mavi görüyor. Aynı ekrandaki Remote ve Exclude kutucukları koyu yeşil, sütun seçicideki kutucuklar uygulama yeşili.
- **Kanıt:**
  - Ölçülen `accent-color`: Jobs ve radyolar `auto`, Remote ve Exclude `rgb(33,79,63)`.
  - `styles.css:2032-2040` yalnız toggle kartlarına renk veriyor.
  - Görüntüler: `11-owner-1440-ali-employment-controls-zoom.png`, `82-owner-1440-column-picker.png`.
- `--theme-*` token kuralına aykırı; tek çekmecede üç kutucuk rengi var.

**9. Orta — Liste yüklenemezse ham teknik metin; yeniden deneme yok.** `leave: medium / do: safe` — **YENİ**
- **Nerede:** Employees listesi, tablo alanı.
- **Örnek:** Bağlantı kopunca tabloda kırmızı "Failed to fetch". Bozuk cevapta ham zod JSON'u: `[{"expected":"string","code":"invalid_type","path":[0,"id"]…`.
- **Kanıt:**
  - `EmployeesPage.tsx:430-436` `error.message`.
  - Görüntüler: `72-owner-1440-error-network.png`, `73-owner-1440-error-malformed.png`.
- Requests'teki eşi BL-742; Employees için madde yok. P21 (geliştirici mesajı gibi yazmasın).

**10. Orta — Liste eski liste dilinde, hemen altındaki Employees → Documents yeni dilde.** `leave: medium / do: moderate` — **BL-604** (+ `aria-pressed` için **YENİ**)
- **Nerede:** Employees listesi.
- **Ölçülen farklar:**
  - Başlıkta büyük yeşil "Add employee" (42 yüksek, 16 px). Ortak dil başlıkta düğme istemiyor.
  - Gri kutulu sekmeler, alt çizgili değil.
  - Açılır liste yazısı 12 px, kenarı `#d5dad7`: beyazda 1,42:1, WCAG 1.4.11'in 3:1'inin altında. Arama kenarı da benzer.
  - Başlık satırı zemini `#f3f5f3`, yazısı 800 kalın.
  - Çipler 11 px, 800 kalın.
  - Boş hâl beyaz zeminde, dairesiz simgeyle.
  - Sütun ayarı düğmesi 40 yüksek ve köşesiz (`border-radius: 0`); yanındaki filtreler 36 yüksek ve 6 px köşeli.
- **Örnek:** Ayşe Employees'ten sol menüde Documents'a geçince sekme, filtre ve tablo başlığı bambaşka görünüyor.
- **Ekran okuyucu:** sekmelerde `aria-pressed` ve `aria-current` yok; hangisinin seçili olduğu söylenmiyor. Requests'teki eşi BL-752.
- **Kanıt:**
  - `EmployeesPage.tsx:250-314`.
  - Görüntüler: `01-owner-1440-list.png`, `90-owner-1440-boundary-employees-documents.png`.

**11. Orta — Telefonda liste: 256 px'lik bir pencere, sütunlar gizli yana kayıyor.** `leave: medium / do: moderate` — **BL-599 (Employees adı yok, genişlemeli)**
- **Nerede:** telefonda (390) Employees.
- **Örnek:** Owner telefonda listeyi açıyor:
  - 844 px ekranda tablo yalnız 256 px yüksek, içinde dikey kaydırma var.
  - Tablo 780 px; Primary location, Primary job, Access ve Start date ipucusuz sağda.
  - Sütun ayarı düğmesi tek simgeyle tam genişlik (298×40) bir kutu.
  - Başlık 38 px; öteki liste sayfaları telefonda 28.
- **Kanıt:**
  - Ölçüm "wrapSW 780".
  - `styles.css:2689-2706`.
  - Görüntüler: `40-owner-390-list.png`, `86-owner-390-no-location-chip.png`.
- KARARLAR'daki "telefonda liste kart satırı" kararı Employees'i saymıyor; bu yüzden soru olarak koordinatöre.

**12. Orta — Telefonda çekmecede kişinin adı ve durumu hiç görünmüyor.** `leave: medium / do: safe` — **YENİ**
- **Nerede:** telefonda Employees → kişi → çekmece.
- **Örnek:** Owner telefonda Ali'yi açıyor. Ekranın tepesinde yalnız bölüm seçici ("Profile") ve X var. Ad, kod ve "Active" çipinin durduğu sol sütun telefonda tümüyle gizli. Employment ya da Access'te kimin kaydında olduğunu gösteren hiçbir şey yok.
- **Kanıt:** `41-owner-390-ali-employment.png`, `41-owner-390-ali-access.png`.

**13. Orta — Access bölümünde aynı türden düğmeler üç ayrı ölçüde; davette iki benzer gönderme düğmesi.** `leave: low / do: safe` — **YENİ**
- **Nerede:** Employees → kişi → Access.
- **Örnek:** Owner davetli Farmpfgu'nun Access'inde şunları görüyor:
  - "Send reminder", "Copy link" ve "Revoke invitation" 42 px yüksek ve 16 px; alt çubuktaki düğmeler 38 ve 13.
  - İki yeşil ana düğme yan yana.
  - Alt çubukta bir de yeşil "Resend" var.
- **Yıkıcı düğmelerin üç görünümü:** "Remove access" dolgun kırmızı ve büyük; lokasyondaki "Remove" açık kırmızı ve 30 px; "Terminate employee" kırmızı yazı.
- **Kanıt:**
  - Ölçüm: `h42 fs16px` / `h38 fs13px`.
  - Görüntüler: `61-owner-1440-invited-access.png`, `10-owner-1440-ali-access.png`.
- CLAUDE.md §9: aynı işlevdeki bileşenler aynı ölçüde olmalı.

**14. Orta — Form alanlarının ve işten çıkarma penceresi alanlarının kenarı soluk.** `leave: low / do: safe` — **BL-259**
- **Nerede:** çekmece alanları; işten çıkarma penceresinin tarih, saat dilimi ve gerekçe kutuları.
- **Kanıt:** kenar `#cbd2ce`, beyazda 1,54:1 (ölçüldü).

**15. Düşük — Add employee'de atama uyarısı Profile adımında; rol sırası iki seçicide farklı.** — **BL-669**
- **Örnek:** Owner daha ad yazarken altta kırmızı "Choose at least one location…" çubuğu çıkıyor.
- **Rol sırası:** alt çubukta Employee / Manager / Admin, Access'te Admin / Manager / Employee.
- **Kanıt:** `31-owner-1440-create-validation.png`.

**16. Düşük — Boş sekme "henüz yok" diyor.** — **BL-662**
- **Örnek:** Needs Attention boşken "No employees yet / Add the first employee…".
- **Kanıt:** `70-owner-1440-empty-tab.png`.

**17. Düşük — Sütun seçici Esc ile kapanmıyor.** — **BL-670**
- **Kanıt:** ölçüm "picker open after Esc: 1".

**18. Düşük — Sıralı sütunun oku yalnız fareyle görünüyor.** — **BL-663**
- **Kanıt:** Status'a göre sıralıyken ok `opacity` 0 ile 0,68 arası (`83-owner-1440-sorted-status.png`).

**19. Düşük — Owner satırı "Unassigned +1".** — **BL-428**
- **Kanıt:** `01-owner-1440-list.png`.

**20. Düşük — Müdürde tek seçenekli "Workspace role" açık duruyor.** — **BL-430**
- **Kanıt:** Ayşe'nin Emre'sinde seçenekler yalnız ["Employee"] (`51-manager-1440-emre-access.png`).

**21. Düşük — History ve davet ayrıntılarında saniyeli zaman.** — **BL-674 (ek)**
- **Örnek:** "10/1/2026, 1:36:19 PM", "Expires 10/8/2026, 1:37:02 PM".
- **Kanıt:** `10-owner-1440-ali-history.png`, `61-owner-1440-invited-access.png`.

**22. Düşük — Telefonda Add employee alt çubuğunda rol seçici kesiliyor.** — **BL-425 (davet akışına ek olarak ekleme akışında da)**
- **Örnek:** "Select a…" sağ kenarda yarım.
- **Kanıt:** `87-owner-390-create-footer.png`.

**23. Düşük — Bekleyen tercih edilen ad kutusu sıkışık; hata sunucunun ham metnini basıyor.** — **YENİ**
- **Örnek:** "Asked to be called Alex here." 287 px'lik amber kutuda üç satıra kırılıyor; düğmeler 42 px.
- **Hata:** "Use it" başarısız olunca sunucunun gövde metni olduğu gibi yazıyor; bu QA'de "blocked by QA" göründü.
- **Kanıt:** `80-owner-1440-preferred-name-pending.png`, `81-owner-1440-preferred-name-error.png`.

**24. Düşük — İşten çıkarma penceresinde saat dilimi ham kimliğiyle.** — **YENİ**
- **Örnek:** "Worksite timezone: Europe/Istanbul" — kod adı, kişi diline çevrilmemiş.
- **Kanıt:** `20-owner-1440-terminate-dialog.png`.

**25. Düşük — Salt okunur çekmecede tek düğmenin adı "Cancel".** — **BL-408 (değişmiş)**
- **Örnek:** Müdür Ayşe kendi kaydını ve owner arşivli kişiyi açınca vazgeçilecek bir şey yokken "Cancel" görüyor; "Close" olmalı.
- **Kanıt:** `52-manager-1440-self-profile.png`, `76-owner-1440-mock-archived-drawer.png`.

### Öneri (zevk, engel değil)
- Telefonda Add employee bölümleri sekme, var olan kişide açılır liste: aynı çekmecede iki gezinme biçimi.
- Etiketlerde "Required" büyük harfle, "optional" küçük harfle.
- "Copy link" → "Link copied" olunca düğme genişliyor, "Revoke invitation" 16 px sağa kayıyor.

## 2. KARARLAR ekran kararlarının durumu
| Karar | Durum |
|---|---|
| Telefonda Terminate / Restore görünür (2026-10-05) | **Uygulanmamış** (bulgu 6, BL-407) |
| Remove lokasyon satırında, iki tık kırmızı; kilitli kutucuk | Uygulanmış ("Confirm remove", Esc ile kurulum çözülüyor; `12-…-remove-armed.png`) |
| Müdürde Terminate kilitli ve soluk + "Only an admin or the owner can terminate… use Remove." satırı | Uygulanmış (`51-manager-1440-emre-employment.png`) |
| "No location" uyarı çipi; telefonda adın altında | Çip DOM'da `display:flex` ölçüldü (taklitle); masaüstünde lokasyon sütunu var |
| Çekmece başlığında açıklama satırı yok | Uygulanmış |
| Add employee → Documents adımı | Kararda "uygulama bekliyor"; bugün iki adım (beklenen) |
| Profile: üç ad tek satır, Preferred + DOB aynı satır, telefonda alt alta, alan altında yardım yazısı yok, kilit nedeni yazılmıyor | Uygulanmış (`10-…-profile`, `41-owner-390-ali-profile`) |
| E-mail durumu alanın içinde (Verified / Invitation pending), davette adlar kilitli | Uygulanmış (`85-…-invited-profile-email.png`) |
| Jobs departmana göre, Management en altta | Uygulanmış |
| Access'te açıklama yazısı yok, owner rolü kilitli | Uygulanmış (`61-owner-1440-owner-self-access.png`) |
| Kapanırken sormaz (K7) | Uygulanmış (Esc yazılı formu sormadan kapattı) |
| Kaydedilmemiş değişiklikte Terminate kilitli, "Save your changes before terminating the employee" | Uygulanmış (`84-…-dirty-terminate-locked.png`) |
| Nedenle kilitli satır soluk (Owner işi) | Uygulanmış |
| Owner'da Locations "Required" yok | Uygulanmış; Jobs'ta hâlâ var (BL-482, bilinen) |
| Listede iş adı: birincil → Owner → … → "Unassigned" | Uygulanmış (owner "Owner") |
| Rol "Save changes" ile; kapsam dışına çıkınca kapanma | Bakılamadı (yazma gerekir) |
| Form kuralları (harf, +1 maskesi, e-posta tekil, legal name) | **Uygulanmamış** (bulgu 5, BL-503) |
| Liste sayfalarının ortak dili | Employees'e taşınmamış (bulgu 10, BL-604) |

## 3. Temiz çıkanlar
- Yıkıcı iki tık düğmeler (Remove, Revoke invitation): ilk tıkta "Confirm …" oluyor, Esc kurulumu çözüyor, istek gitmiyor.
- Esc katman katman kapatıyor: işten çıkarma penceresi açıkken Esc yalnız onu kapatıyor, çekmece kalıyor (P2 K1).
- Sekmeler, sıralama başlıkları, düğmeler ve sütun ayarı yeşil 2 px odak halkası alıyor; aramada kenar yeşile dönüyor.
- Metin kontrastları AA'yı geçiyor:
  - hücre 8,25:1, kod "E-0015" 5,07:1;
  - başlık satırı 4,54:1 (sınırda);
  - çipler 5,5–6,2:1;
  - lokasyon "Remove" 5,95:1.
- Tarayıcının onay ya da uyarı penceresi (`confirm`, `alert`) hiç açılmadı; işten çıkarma uygulamanın kendi penceresi. İstisna yalnız gerekçe balonu (bulgu 3).
- Metinde "business" yok; "workspace" ve "team" doğru. Kod adı ekrana çıkmıyor; istisna saat dilimi kimliği (bulgu 24).
- 390'da sayfada yatay kaydırma yok (`scrollWidth` 390); taşma yalnız tablo çerçevesinin içinde.
- Arşivde "Add employee" gizli. Arşivli kişide "Restore employee" yeşil, tek tık.

## 4. Sınırda
- **Employees → Documents:** sayfa yeni dilde (alt çizgili sekmeler, yeşil-gri başlık satırı, daireli boş hâl). Çekmecedeki Documents bölümü ise eski gri kutulu sekmelerle çiziliyor. Aynı liste iki görünümde; tek kişilik listede "EMPLOYEE" sütunu ve "Search employee or document" yer tutucusu da var.
- **Çekmecedeki Availability:** "Employee availability / Manager reminders" alt sekmeleri ve haftalık tablo düzgün. "Submitted" çipsiz düz yazı.
- **Davet kabulü (`/invite/accept`, belirteçsiz):** "This link doesn't work anymore / … Ask your manager for a new one." metni sade (`91-…png`).
- **Onboarding sayfası:** açılmadı (bekleyen davetli hesapla giriş gerekir).

## 5. Bakılamayanlar ve nedeni
- Kaydetme, davet gönderme, işten çıkarma sonucu, rol değişikliği, başarı toast'ları ve kapsam dışına çıkınca kapanma: hepsi yazma gerektiriyor; salt okuma kuralı.
- Erişim-yok kartı (BL-402) ve çalışan rolüyle `/app/employees`: görevin rol kapsamı owner ve tek lokasyon müdürüydü; denenmedi.
- Arşivli ve hesabı bağlı kişinin "Onboarding in progress" kusuru (BL-669 (1)): taklit `display_status`'u "active" bıraktığı için doğrulanamadı.
- Gerçek ekran okuyucu (NVDA ya da VoiceOver) kullanılmadı; yalnız ARIA nitelikleri ve odak sırası ölçüldü.
- Admin rolü ayrıca gezilmedi.

## Ekran görüntüleri (yol listesi)
Klasör: `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-03\artifacts\nf-gorsel-qa\EKRAN-employees\`

- **Liste:** `01-owner-1440-list.png`, `02-owner-1440-focus-tab1|8|10|12.png`, `03-owner-1440-focus-search.png`, `04-owner-1440-focus-row.png`
- **Ali'nin çekmecesi (masaüstü):** `10-owner-1440-ali-{profile,employment,availability,documents,access,history}.png`, `11-owner-1440-ali-employment-controls-zoom.png`, `12-owner-1440-ali-remove-armed.png`
- **İşten çıkarma:** `20-owner-1440-terminate-dialog.png`, `21-owner-1440-terminate-empty-reason.png`, `20-owner-390-drawer-footer-no-terminate.png`
- **Add employee:** `30-owner-1440-create-empty.png`, `31-owner-1440-create-validation.png`, `32-owner-1440-create-duplicate-email.png`, `33-owner-1440-create-employment.png`, `34-owner-1440-create-blur-errors.png`
- **Telefon:** `40-owner-390-list.png`, `40-owner-390-list-full.png`, `41-owner-390-ali-{profile,employment,availability,documents,access,history}.png`
- **Müdür:** `50-manager-1440-list.png`, `51-manager-1440-emre-{profile,employment,access}.png`, `52-manager-1440-self-profile.png`, `54-manager-1440-create-employment.png`
- **Davetli, onboarding, owner:** `60/61-owner-1440-{invited,onboarding,owner-self}-{profile,access}.png`, `62-owner-1440-owner-self-employment.png`, `63-owner-1440-invited-revoke-armed.png`, `64-owner-1440-invited-copy-link-blocked.png`
- **Boş, yükleniyor, hata ve taklit hâller:** `70-owner-1440-{empty-tab,archived-empty,search-empty}.png`, `71-owner-1440-loading.png`, `72-owner-1440-error-network.png`, `73-owner-1440-error-malformed.png`, `74-owner-1440-mock-rich.png`, `75-owner-1440-mock-archived-list.png`, `76-owner-1440-mock-archived-drawer.png`, `77-owner-1440-mock-archived-access.png`
- **Diğer:** `80-owner-1440-preferred-name-pending.png`, `81-owner-1440-preferred-name-error.png`, `82-owner-1440-column-picker.png`, `83-owner-1440-sorted-status.png`, `84-owner-1440-dirty-terminate-locked.png`, `85-owner-1440-invited-profile-email.png`, `86-owner-390-no-location-chip.png`, `87-owner-390-create-footer.png`
- **Sınırda:** `90-owner-1440-boundary-employees-documents.png`, `91-owner-1440-boundary-invite-accept-no-token.png`
- **Sunucu günlükleri:** `web.log`, `api.log`
- **Sürücü betikleri** (geçici, repo dışında): `C:\tmp\qa-emp\lib.cjs`, `measure.cjs`, `t1.cjs`…`t20.cjs`

## Durdurulan süreçler (PID)
- **Web (5638):** pnpm 51740 → cmd 51828 → vite 30600 (+ alt süreç 35816).
- **API (5639):** pnpm 42544 → cmd 76464 → `tsx watch` 31920 → node 36104 (+ alt süreç 84072).
- Hepsi 2026-10-05 19:54'te bu inceleme için başlatıldı; `taskkill /PID <kök> /T /F` ile ağaç olarak durduruldu. İsimle toplu durdurma yapılmadı.
- Sonrasında "ports 5638/5639 free" doğrulandı.

## Hafıza notu (dosyaya yazılmadı)
`employees-qa-paths-and-traps` (reference) için önerilen içerik:
- **Dünya:** World `e2e1790876179369`. Owner `owner.4f81cbfa`, Kadıköy müdürü Ayşe `ayse.1be2994c`. Ali'nin id'si `a1fce148-…6749`. Davetli Farmpfgu (bekleyen davet), onboarding'de Invlgl74. Arşivli kişi ve bekleyen tercih edilen ad yok; taklit gerekir.
- **Taklit adresleri:** liste GET `…/employees?archived=…` (`u.searchParams.has("archived")` ile seç), ayrıntı `…/employees/<uuid>`, bekleyen ad `…/preferred-names/pending`.
- **Tuzaklar:**
  - Alan doğrulaması yalnız odak çekmece içinde başka bir öğeye geçerse tetikleniyor. `.blur()` yetmez, Tab kullan.
  - Telefonda çekmece bölümleri `select[aria-label="Employee section"]`.
  - "Use it" gibi düğmeler POST atar. GET, HEAD ve OPTIONS dışını 500'le kesen kural şart.
  - Başsız Chrome Türkçe arayüzle açılıyor: tarih yer tutucusu ve doğrulama balonu Türkçe çıkar.
- **Tekrar eden tutarsızlık türü:** yeni liste dili (odak halkası dahil) yalnız `.list-page` sınıflı altı sayfada. Eski listelerde (Employees, Requests) satır odağı ve `aria-pressed` eksik. Önce bunu ölç.
