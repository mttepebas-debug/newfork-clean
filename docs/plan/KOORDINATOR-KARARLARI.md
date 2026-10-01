# Koordinatör kararları

Koordinatörün Mert yerine verdiği her süreç ve teknik kararı, ve bir KARARLAR satırının ya da onaylı
bir ilkenin birebir kapsadığı ürün/ekran kararı burada (CLAUDE.md §13; kullanıcı kararı 2026-10-01,
KARARLAR OPS-04). Mert orada olsun olmasın yazılır. Başlangıç, kullanıcı talimatı 2026-09-29: "Karar
vermen gereken yerde benim vizyonuma, uygulamamızın planına göre karar ver ve verdiğin kararları tek tek
ayrı bir md'ye logla. Ben gelince bana raporlayacaksın." (o zaman yalnız kullanıcı yokken geçerliydi).
Dayanak sırası (2026-09-30, KARAR-001; önceden "SaaS mantığı" en üstteydi): `docs/plan/ILKELER.md` başındaki sıra: Mert'in en güncel açık kararı > `KARARLAR.md` > ILKELER > bu dosya > sektör emsali. Ürün bağlamı: çok kiracılı, çok
lokasyonlu, çok rollü; çalışan birden fazla lokasyonda çalışabilir; yönetici hem yönetir hem vardiya alır;
lokasyonlar farklı saat dilimlerinde olabilir. Uygulamanın yönünü değiştiren kritik kararda önce alt
ajanlarla tartışılır.

Her madde: kimlik, tarih, karar, uygulamada etkisi, dayanak, geri almanın maliyeti, durum. "Uygulamada etkisi" 2026-09-30 akşamından (KK-38) itibaren zorunludur (kullanıcı talimatı: "kararın sonucunu app'te hangi özellik nasıl çalıştı/değişti diye nokta atışı anlat"): ekran adı ve yolu; kim ne yapınca önce ne oluyordu, şimdi ne oluyor; isimli örnek; ekran adı koddan ölçülür. Kullanıcı düzeltirse maddenin
altına "Kullanıcı: …" yazılır ve madde uygulanır. 2026-09-30'dan (KARAR-001) itibaren her maddenin son satırı **Mert:** durumudur: onaysız (varsayılan; yazılmamışsa onaysızdır) / onaylandı <tarih> / değişti <tarih> / ters <tarih>. Koordinatör kararları iş raporunda "Senin yerine verdiğim kararlar" listesiyle Mert'e gösterilir; sessizlik onay sayılmaz. Ters çevrilen karar ILKELER'deki ilgili ilkeyi düzeltir. Başka oturumların kendi karar dosyaları:
`docs/plan/tasks/ACCOUNT-REDESIGN-kararlar.md` (Account yeniden tasarımı, K-P1…K-8; `task/account-redesign` dalında).

## Çalışma biçimi (kullanıcının koyduğu, 2026-09-29)
- Backlog önem sırasına ve yakınlığa göre gruplanır, gruplar sırayla düzeltilir; her grup önce tazelik
  kontrolü ve kısa plan alır.
- Aynı anda TEK iş ("2 paralel" aynı gün geri alındı). `CLAUDE.md` §11.4 değişmedi.
- Testler her işten sonra değil, toplu turlarda. Uzun koşular ertelenir.
- Bağlamı dolan oturum hemen devir raporu yazar; koordinatör onu boş bir oturuma verir, kart onayı beklenmez.

## Kararlar

### KK-1 (2026-09-29) Tek iş = Account yeniden tasarımı; backlog programının kod işleri ondan sonra
- **Karar:** Şu an yürüyen tek iş, zaten başlamış olan Account yeniden tasarımı (Account → Profile,
  Security, Preferences, Notifications, Workspaces, Documents; `task/account-redesign`, nf-arayuz oturumunda).
  Backlog gruplarının kod işleri o iş main'e girince başlar. nf-planlama'nın gruplama planı (yalnız
  `docs/plan`, kod yok) bu sırada hazırlanır.
- **Dayanak:** tek hat kuralı — başlamış iş bitene kadar başka iş açılmaz (`CLAUDE.md` §11.4); iki iş
  aynı anda koşmasın (kullanıcı, 2026-09-29).
- **Geri alma:** kolay; sıra değişir, kod etkilenmez.
- **Durum:** uygulanıyor.

### KK-2 (2026-09-29) Settings menüsü düzeltmesi (BL-332) ilk toplu test turuyla main'e
- **Karar:** Schedule → Settings'te Unassigned satırlarının view kipinde pasif olması (`task/settings-view-passive`
  @ea837e93) kendi başına tam kapı koşmaz; Account işinin tam kapısıyla aynı turda main'e girer.
- **Dayanak:** kullanıcı: testleri toplu koş, aynı şey için tekrar tekrar test yapma. Değişikliğin kendi
  testi yazılıp kırmızı→yeşil kanıtlandı, typecheck temiz.
- **Geri alma:** kolay (tek commit).
- **Durum:** bekliyor.

### KK-3 (2026-09-29) Account yeniden tasarımının main'e giriş kapısı
- **Karar:** DELEGASYON R2 (tek Save bütün workspace kayıtlarına yazıyor; kısmi kayıt riski). Beş sekme
  bitince: bir bağımsız inceleme (nf-guvenlik), ekran teslim edilen şey olduğu için görsel QA
  (nf-gorsel-qa, masaüstü + telefon), rebase, tek tam kapı (lint, typecheck, test, build) + Account ile
  ilgili e2e (`owner-legal-name-setup.spec.ts` dahil) — bu tur KK-2'yi ve KK-7'yi (telefon tetikleyicisi,
  nf-db, R3 → nf-guvenlik incelemesi + test:db) de taşır.
- **Dayanak:** `DELEGASYON.md` §3 R2; kullanıcı: testler toplu.
- **Geri alma:** orta (inceleme atlanırsa geri dönüş pahalı; bu yüzden atlanmıyor).
- **Durum:** bekliyor.

### KK-4 (2026-09-29) G1 ve G14, stil B mockup dalını beklemez
- **Karar:** Backlog programının G1 (Schedule taslak/yayın pencereleri, davranış) ve G14 (Schedule üst çubuk ve pencereler, görsel) grupları `task/schedule-dialog-mockups` dalını beklemeden, program sırasıyla yürür.
- **Dayanak:** o dal yalnız yerel DEV mockup (`0b2f998c`); seçilen stil B zaten main'de (`228ff3b7`). Beklemek bir şey kazandırmaz. nf-planlama'nın açık sorusu (devir §4).
- **Geri alma:** kolay; mockup dalı yerinde kalır, kullanıcı silmeyi seçmedi.
- **Durum:** uygulanıyor.

### KK-5 (2026-09-29) G7 (yetki çekirdeği ailesi A), FB-6.2.1'in kapsamı olarak yürür
- **Karar:** G7'nin 17 maddesi ayrı bir iş olarak açılmaz; sırası gelince FB-6.2.1'in görev dosyası açılır ve bu maddeler onun kapsamına girer (nf-db yazar, R3, nf-guvenlik zorunlu, ultrareview önerisi kullanıcıya).
- **Dayanak:** G7 ile park edilmiş FB-6.2 aynı migration/yetki dosyalarına dokunuyor; iki ayrı iş aynı dosyaları iki kez açar (`CLAUDE.md` §9 ikiz sistem yok, tek hat). FOUNDATION-B sırası da korunmuş olur.
- **Geri alma:** orta; görev dosyası bölünebilir, kod yazılmadan önce ucuz.
- **Durum:** sırası gelince (program sırası 7).
- **Ad düzeltmesi (2026-09-29, devralan koordinatör):** bu kayıtta "FB-6.2.1" FB-6.2 diliminin tamamı (.1–.7) anlamında kullanıldı. `FB-6.2.md`'de ".1" yalnız matris adımı. G7 = FB-6.2 dilimi; plan dosyası `docs/plan/tasks/FB-6.2.md` (ayrı dosya açılmaz).

### KK-6 (2026-09-29) BL-238: "bu hafta" sınırı vardiyanın lokasyonunun saat dilimine göre
- **Karar:** Seçenek (a), bir düzeltmeyle: belirleyici olan yöneticinin değil, **vardiyanın lokasyonunun** saat dilimi (`locations.timezone`, yeni sütun yok). Kilit hücre/lokasyon düzeyinde; taslak bütün olarak ancak hedeflediği bütün lokasyonlar kapanınca "geçmiş" sayılır. `schedule_current_week_start_service` lokasyon alır ve tek yardımcı olur; acquire, save, yayın ve yayından kaldırma önizlemeleri ondan geçer; web "geçmiş hafta"yı kendisi hesaplamaz, okuma modelinden okur. Program yeri: G10 (Schedule kayıt/yayın kuralları, nf-db, R3).
- **Dayanak:** vizyon (lokasyonlar farklı saat dilimlerinde); KARARLAR FB-6.3 izin saat dilimi emsali; alt ajan tartışması (7shifts lokasyon başına; When I Work workplace başına). "En erken kapanan" yanlış: Los Angeles'ı 3 saat boşuna kilitler. Tek saat dilimli workspace'lerde (a) ile (b) aynı sonuç, ek maliyet yok.
- **Karşı argüman:** (b) daha basit, yarı kilitli taslak doğmaz. Yarı kilitli taslağın arayüz dili gerekir; ertelenebilir cila.
- **Geri alma:** düşük (kilit saklanmıyor, hesaplanıyor; (a)→(b) kolay, tersi zor — bu yüzden ince taneli olan seçildi).
- **Durum:** G10'da uygulanacak. Canlı kullanıcı olmadığı için öne çekilmedi; o zamana kadar Pazar akşamı CI kuralı (ILERLEME §7) geçerli.

### KK-7 (2026-09-29) BL-335: telefonun tek kaynağı hesap; workspace kaydı sunucu tarafında kopyalanır
- **Karar:** Hesap (`user_profiles.phone_e164`) tek kaynak. Çalışan kaydındaki telefon (`employee_private_profiles.phone`) salt okunur kopya; kopyayı tek bir SECURITY DEFINER tetikleyici, hesap güncellemesiyle aynı işlemde, yalnız kişinin kendi aktif (arşivli olmayan) kayıtlarına yazar. Onboarding'de hesap telefonu boşsa girilen numara E.164'e çevrilip hesaba yazılır. Müdür yolu açılmaz, RLS değişmez. Eski `user_profiles.phone` sütunu sonra kaldırılır (BL-072 ailesi). Canlı veri olmadığı için mevcut kayıtlar bir kerelik doldurulabilir (CLAUDE.md §9 "eski veri korunmaz"). İleride yöneticinin girdiği numara eklenirse hesaba kişinin onayı olmadan asla taşınmaz (kiracılar arası yazma açığı).
- **Dayanak:** telefon kişinin kendi verisi; müdür bugün zaten yazamıyor (`EmployeeDrawer.tsx:1939-1942`, tablo authenticated'a salt okur); Account yeniden tasarımı workspace başına telefon alanını ekrandan kaldırıyor — tek başına girerse numarayı kimse düzeltemez. Alt ajan tartışması.
- **Sıra:** Account yeniden tasarımıyla **aynı test turunda**, hemen ardından (nf-db; R3 — kullanıcı adına kiracı tablosuna yazan tetikleyici; nf-guvenlik incelemesi KK-3'e eklenir; pgTAP zorunlu).
- **Geri alma:** kod ucuz (tetikleyiciyi kaldıran migration); veri tarafı kopyanın üzerine yazdığı numaralar — canlı veri yok, önemsiz.
- **Durum:** Account işi bitince nf-db'ye verilecek.

### KK-8 (2026-09-29) BL-317: owner (ve aynı lokasyondaki diğer yöneticiler) Employees'te görünür — yeni kural değil, M2'nin uygulanması
- **Karar:** (a). Ölçüm: owner'ı bir süzgeç değil eski yardımcı `can_access_employee` düşürüyor (manager'a yalnız `access_class='employee'` açıyor); yetki çekirdeği (`employee.list`/`employee.read`, M2 `person/read = any`) zaten "görür" diyor ve matriste `manager-hidden-peers` known_gap olarak kayıtlı. Düzeltme: `list_employees(_service)`, `get_employee_detail(_service)`, `get_employee_avatar_path_service` çekirdeğe taşınır (= FB-6.2.3), liste ve detay birlikte; `can_access_employee` gevşetilmez (28 yazma yolu kullanıyor); çekmecedeki salt okunurluk rol adından değil sunucudaki rütbe kuralından gelir; manager kendi satırını salt okunur görür.
- **Program yeri:** G7 / FB-6.2 (KK-5). Çalışan kaydı olmayan owner'lar ayrı madde (backlog'a yazılır).
- **Dayanak:** KARARLAR M2 ve "Çalışan kaydı"; Schedule'da planlanan kişinin Employees'te bulunamaması iki ekranı çelişkili yapar. Alt ajan ölçümü (yerel DB, salt okunur).
- **Geri alma:** düşük (fonksiyon gövdeleri, forward migration).
- **Durum:** FB-6.2 sırası gelince.
- **Bilgi notu (D4, `nf-guvenlik` T5a incelemesi (ONAY @`9d376ce8`), koordinatör aktardı, 2026-09-29):** `employees.private.read` izni verilmiş özel bir yönetici rolü, T5a'dan sonra lokasyondaki eş yönetici, admin ve owner'ın özel iletişim bilgisini de görür (BL-317 ile eşler görünür oldu). Varsayılan manager rolünde bu izin yok; kural değişmedi, yalnız etkisi genişledi.

### KK-9 (2026-09-29) BL-121: haftalık saat özeti yalnız bilgi amaçlı, 40 saat sabit
- **Karar:** (a). Izgaradaki kişi toplamı diğer lokasyonların yayınlanmış (ghost) vardiyalarını da sayar; yayın penceresinde "40+ scheduled hours" listesi. Metin tarafsız ("scheduled", yaklaşık ise "~"); "overtime/violation" denmez. Engel, onay, ayar, günlük/eyalet kuralı yok (onlar BL-067, MVP sonrası). Kapsam dışı lokasyonların taslakları toplama girmez. Yayın penceresinde ızgaradan farklı taslak seçilirse saat bloğu gizlenir. Migration yok. Program yeri: G14.
- **Dayanak:** ABD restoranında 40 saat eşiği temel beklenti (Homebase ücretsiz planında var); ROADMAP "sınırlama" MVP sonrası — "göster" kapsam içi. Alt ajan tartışması.
- **Geri alma:** çok düşük (yalnız arayüz).
- **Durum:** G14'te.

### KK-10 (2026-09-29) Diğer bekleyen kararlar: nf-planlama'nın önerileri kabul
- **Karar:** BL-255 (a) tek beyaz düğme → G15; BL-309 (a) ölü kaynak-taslak kodu silinir → G1; BL-318 (a) diğer Schedule pencereleri stil B → G14; BL-330 (a) zamanlanmış dışa aktarmada notlar gitmez, elle indirmede kalır → G4; BL-088 (a) müsaitlik modu dönüşümü bekleyen istekleri işaretler → G21; BL-126 (a) çapraz lokasyon davet yok, MVP sonrası → GS; BL-147 (a) Account main'e girdikten sonra tazelikle → G15; BL-169 (a) durum mesajları token'a → G15.
- **Kullanıcıya kalan:** BL-073 (hesap düğmesi ile workspace değiştiricinin birleşmesi) saf görsel karar; varyantlar hazırlanıp kullanıcıya gösterilir.
- **Dayanak:** her birinin vizyon gerekçesi `docs/plan/tasks/BACKLOG-PROGRAM.md` → "Karar bekleyen".
- **Geri alma:** hepsi düşük-orta; kod yazılmadan önce ücretsiz.
- **Durum:** gruplarına taşınacak.

### KK-11 (2026-09-29) G6 yalnız bildirim teslimi; tercih edilen ad kararının yetkisi G7'ye. Kurtarma bağlantısı açığı "high"
- **Karar 1:** G6 (bildirim teslimi) yalnız alıcılı kuyruk, üretici kaydı ve testi yapar. `decide_*` ve `list_pending_preferred_names_service` fonksiyonlarının `authorize`'a geçmesi G7 = FB-6.2.1 kapsamına gider (KK-5).
- **Dayanak:** çekirdekte doğru kural (no_self, rank_below) hazır; aynı yetki dosyalarını iki ayrı işte açmamak (tek hat, ikiz yok).
- **Karar 2:** BL-279'a eklenen yan bulgu — hesap kurtarma e-postasını yeniden gönderme ucu sınırsız ve her gönderimde `recovery_token_digest`'i eziyor; kurbanın e-postasını bilen biri geçerli kurtarma bağlantısını sürekli geçersiz kılabilir — **leave: high** sayılır, G5'te BL-162 ile aynı desenle (hesap başına sınır + eski token'ı ezmeme) kapanır. Canlı kullanıcı olmadığı için G5 sırasının önüne çekilmedi; ücretli lansman öncesi şart.
- **Geri alma:** düşük.
- **Durum:** G5 ve G6 sırası gelince.

### KK-12 (2026-09-29) KK-5'in düzeltmesi: G7 FOUNDATION-B dilimlerine bölünür
- **Karar:** Seçenek (a). FB-6.2.1 yalnız kendi kapsamını ve ona yakın işleri alır: BL-129, BL-270 (+ fail-open hücresi), BL-317 (KK-8), BL-242 (owner onboarding'in dört servisi dahil), BL-130, BL-133'ün `.6` etiketi, BL-176 ve BL-243'ün `.7` kısmı, BL-155, BL-099'un yetki kısmı (KK-11). Geri kalanlar ilgili dilime: BL-179 → FB-6.3 (izin); BL-189 ve BL-276(1) → FB-6.4 (takas); BL-264 ve BL-276(2) → FB-6.6 (belgeler); BL-178, BL-232 → FB-6.8 (ayarlar); BL-224 ve BL-276(3) → takvim; BL-261 → hesap. BL-071 (bütün üyelik türlerine dokunuyor) hiçbir dilime girmez, ayrı ve riskli madde olarak GS'de bekler.
- **Dayanak:** nf-planlama ölçümü (G7'nin 18 maddesinden yalnız 4'ü FB-6.2 kapsamında); (b) FB-6.2.1'i iki katına çıkarır ve aynı dosyaları dilimlerin sırası gelince yeniden açar; (c) FOUNDATION-B'nin kendi dilimleriyle ikiz bir iş sırası kurar.
- **Geri alma:** düşük (kod yazılmadı).
- **Durum:** program dosyasına işlenecek.
- **Ad düzeltmesi:** KK-5'teki nota bakın — "FB-6.2.1 kapsamı" = FB-6.2 diliminin G7'ye düşen alt adımları (`FB-6.2.md`).

### KK-13 (2026-09-29) BL-132: arşivli lokasyon yazma ve kapsamda silinmiş gibi sayılır
- **Karar:** İlke: arşivlenmiş (archived_at dolu) lokasyon, yetki çekirdeğinin kapsam ve yazma hesaplarında (scope_set, authz_check, live_location_ids; Schedule, şablon, zamanlanmış dışa aktarma) silinmiş lokasyonla aynı muameleyi görür — Q-C'nin genişletilmesi. Geçmişin okunması (yayınlanmış vardiya geçmişi, kayıtlar) bugünkü okuma kurallarıyla kalır. İki kolonun tek kolona indirilip indirilmeyeceği teknik karardır; G8'de nf-db ölçüp seçer (Q-C ile çelişen "tek kolon" önerisi, bu ilkeyi bozmadığı sürece serbest).
- **Dayanak:** bugün arşivli lokasyon çekirdekte kapsamda sayılıyor ama Schedule'da görünmüyor — iki ekran çelişkili; kullanıcı kararı Q-C silinmiş lokasyon için aynı yönde. SaaS mantığı: arşiv = pasif, yeni iş almaz, geçmişi korunur.
- **Geri alma:** orta (yetki çekirdeği fonksiyonları, forward migration).
- **Durum:** G8'de (nf-db, R3).

### KK-14 (2026-09-29) U43: eski belge kayıtları doldurulmaz; kural veritabanına konur
- **Düzeltme 2026-09-30 (KK-50 K1):** kural veritabanına konmuyor: kurala uymayan satırı üretecek yol yok, U43 kapandı. BACKLOG'daki "`-` dalı ölü olur, silinir" notu yanlıştı; "-" taslak belgede de görünüyor.
- **Karar:** Documents'ta migration öncesi yayımlanmış kayıtların `published_at`'i boş (listede "-"). Geriye dönük doldurma yazılmaz. G18'de (nf-db) veritabanı bu şekli reddeder: yayımlanmış belgede `published_at` zorunlu (CHECK). Yerel veride kurala uymayan satırlar DB yeniden kurulurken gider; bunun için ürüne tolerans kodu yazılmaz.
- **Dayanak:** kullanıcı kuralı "eski veri korunmaz" (CLAUDE.md §9, global kurallar): canlı veri yok; kurala uymayan kayıt, ona tolerans gösteren kod ve onu kuran test silinir.
- **Geri alma:** düşük.
- **Durum:** G18'de.

### KK-15 (2026-09-29) G2 Account turuyla paralel, çakışmasız
- **Karar:** Kullanıcının isteğiyle ("çakışma olmayacak 1 taski delege et boş bir session'a") G2 (Schedule hızlı düzenleyici; BL-293, BL-290, BL-294, BL-295, BL-291) Account turuyla aynı anda, havuzdaki bir işçi oturumunda (nf-arayuz kurallarıyla, dal `task/g2-quick-editor`) yürür. Dokunduğu dosyalar yalnız `apps/web/src/styles.css` (hızlı düzenleyici bloğu) ve `ShiftQuickEditor.tsx`; Account turu (`merge/account` + `task/bl335-phone`) bunlara dokunmuyor (ölçüldü). G1 değil G2 seçildi: G1 `SchedulePage.tsx`'e dokunuyor, o dosya Account turunda (BL-332).
- **Dayanak:** kullanıcı talimatı; KK-1'in tek-iş kuralı bu açık izinle bir paralel iş için esnetildi.
- **Test:** G2 kendi odaklı testlerini koşar; tam kapı ve e2e Account turundan sonraki toplu turda (T1: G1 + G2).
- **Durum:** yürüyor.

### KK-16 (2026-09-29) G4 ve G6 da paralel, işçi oturumlarında
- **Karar:** Kullanıcının isteğiyle ("aynı şekilde 2 tane daha") G4 (zamanlanmış dışa aktarma ve e-posta; `task/g4-scheduled-export`) ve G6 (bildirim teslimi; `task/g6-notification-delivery`) havuzdaki iki işçi oturumunda, Account turu ve G2 ile aynı anda yürür. Dosya kümeleri ölçüldü ve ayrık: G4 `apps/api/src/schedule/**`, shared şema, `vercel.json`, BL-163 e-posta dosyaları, yeni migration; G6 yeni migration + `preferred_name_approval.test.sql`. Ortak tek dosya `supabase/tests/ci-green.txt` (yalnız satır eklenir, birleşmesi kolay). Migration zaman damgaları ayrı aralıklarda (G4 ≥ 20260929150000, G6 ≥ 20260929160000). G3 atlandı (Account dosyalarına dokunuyor), G5 G4'ten sonra (iki ortak dosya).
- **Kapı:** G4 ve G6 R3 → nf-guvenlik incelemesi zorunlu; migration'lar kalıcı olarak yalnız main'e alma penceresinde uygulanır; test:db ve tam kapı toplu turda.
- **Durum:** yürüyor.

### KK-17 (2026-09-29) Owner'ın kendi tercih edilen ad talebi kendiliğinden geçer; BL-342 ve BL-343 G6'ya eklenir
- **Karar 1:** G7 (FB-6.2.1) `no_self`'i getirdiğinde, "manager" modunda owner'ın kendi tercih edilen ad talebi onaylanmayı beklemez, kendiliğinden geçer (owner'ın üstünde onaylayacak kimse yok; bugün eski kapıyla kendini onaylıyor, sonuç aynı). G7 görev dosyası bu kalemi taşır.
- **Karar 2:** BL-342 (onayda kişiye bildirim, ret sessiz kalır) ve BL-343 (`availability.status_changed` için eksik üretici kaydı; bir testi yeşile çevirir) G6 işçisine, aynı dala (`task/g6-notification-delivery`) eklenir; nf-guvenlik G6'yı son commit üzerinden inceler.
- **Dayanak:** ikisi de G6'nın dosya ailesinde (bildirim üretici kaydı, şablon), küçük ve güvenli; ayrı tur açmak test turunu çoğaltır (kullanıcı: testler toplu).
- **Geri alma:** düşük.
- **Durum:** Karar 2 yürüyor; Karar 1 G7'de.
- **Bilgi notu (D-b, `nf-guvenlik` FB-6.2 T5b raporu (`artifacts/nf-guvenlik/fb62-t5b/RAPOR.md`), koordinatör aktardı, 2026-09-29):** "kimse yoksa beklemez" kuralı genel çalışıyor: owner'ın kendisi `document_blocked` olursa bir admin'in tercih edilen ad talebine karar verebilecek kimse kalmaz ve talep kendiliğinden geçer. Kenar durum; kural değişmedi, yalnız etkisi owner dışına da uzanıyor.

### KK-18 (2026-09-29) G2 onaylı; G4'ün saatlik cron sorusu kullanıcıya; boşalan işçilere G5 ve G22; ikinci inceleme oturumu
- **G2:** R1; koordinatör diff okuması tamam (`task/g2-quick-editor` @a0ac7ea9; 4 dosya, emoji kesme düzeltmesi + odak/kenar/boyut CSS'i, 42 test). Komşu etki kabul: Schedule'ın eski stil pencerelerinde klavye odak halkası artık görünüyor (erişilebilirlik kazancı). Toplu turda main'e.
- **G4 K7 — saatlik cron:** `vercel.json`'da iç cron yok; saatlik tetik Vercel ücretli plan ya da dış tetikleyici ister (hosted + ücret) → **kullanıcı kararı**, park. Kod tarafı bitti; tetik gelene kadar zamanlanmış dışa aktarma yalnız dış çağrıyla çalışır.
- **Paralel işçiler (kullanıcının "2 tane daha" isteğinin devamı):** G4 işçisi → G5 (G4 ile iki ortak dosya; aynı elde sırayla, dal G4'ün üstünde). G2 işçisi → G22 (G2'nin devamı, dal G2'nin üstünde). G4 incelemesi için havuzdan ikinci bir nf-guvenlik oturumu ("İnceleme: G4") açıldı; tek bağımsız inceleme kuralı korunur (her işe bir incelemeci).
- **Ultrareview önerisi (kullanıcıya):** G4 (yetki yolu değişti) ve G6 (bildirim alıcı seçen `*_service`) — riskli yüzey.
- **Durum:** yürüyor.

### KK-19 (2026-09-29) İzin kısaltma anı = yönetici onayı; G9 ikiye bölündü; nf-guvenlik yenilendi
- **Karar 1 (BL-182/BL-127):** Yönetici çakışan izni kısaltıp vardiyayı atadığında izin, **yöneticinin onayladığı anda** kısalır (sistemin yazdığı, anında onaylı iptal parçası; ikinci bir kısaltma yolu yok). Başvuru anında kısaltmak, reddedilen başvuruda izni boşa yakardı. Takas/atama engelinin dört okuyucusu (kabul, atama tetikleyicisi, aday listesi, önizleme) aynı "etkin izin" kuralını okur. Gerekirse yeni çekirdek eylemi `time_off.shorten` yalnız `authz_actions` satırı olarak eklenir (G7 gövdelerine dokunulmaz).
- **Karar 2:** G9, bağlam sınırında ikiye bölündü: G9a (BL-247, BL-220, BL-109; `task/g9-timeoff-exchange` @78fa6fc3, incelemede) ve G9b (BL-182 + BL-127; yeni işçi, `task/g9b-shorten-time-off`, G9a'nın üstünde). BL-200 (önce ölçüm) ve BL-110 (Schedule kısmı Schedule turundan sonra) backlog'da kalır.
- **Karar 3:** Bağlamı dolan nf-guvenlik arşivlendi; devir notu main'de (d5c2bb5a); yerine havuzdan yeni nf-guvenlik. İnceleme sonuçları: Account ONAY @a3a7b3e9; BL-335 DB ONAY + web şartı (onboarding'de hesapta telefon varken alan salt okunur — nf-arayuz'da); G6 ONAY @6b681623 (ek kısım 6b681623..62782c12 yeni oturumda); G2, G22, G19 ONAY.
- **Dayanak:** KARARLAR "izni kısalt ve ata" kuralı; tek hat içinde iş sınırında bölme (CLAUDE.md §11.4 "iş parçalara bölünebilir").
- **Geri alma:** düşük (kod yazılmadan önce).

### KK-20 (2026-09-29) BL-127: izni kısaltma Requests'ten; "kısalt ve ata" kısayolu Schedule turundan sonra
- **Karar:** (a) Yönetici onaylı iznin detayından (Requests → Time off) "Shorten time off" ile saatleri seçip izni kısaltır (çalışanın iptal ekranındaki saat seçicisi yeniden kullanılır); onayla izin anında kısalır (KK-19); bildirim çalışana ve izni onaylayana. Sonra vardiyayı Schedule'da normal atar. Schedule hücresinde tek adımlık "izni kısalt ve ata" kısayolu, Schedule dosyaları serbest kalınca ayrı madde. (b) reddedildi: yayınlanmış vardiyayı Schedule dışından değiştirmek taslak uzlaştırması ve düzenleme kilidiyle risk taşır. (c) reddedildi: ekransız iş yarım kalır.
- **Ek (işçinin kararları, onaylı):** takas/pickup'ta izni yalnız izin sahibi kendi eylemiyle ve mevcut "yine de devam et" onayıyla ezebilir; cover aday listesinde izinli kişi görünmez; izin kısalması yöneticinin son onayında olur. Yönetici kısalttığında çalışana da bildirim gider.
- **Dayanak:** KARARLAR "izni kısalt ve ata"; iki adımlı akış kuralı bozmaz, yalnız kısayolu erteler. Tek hat içinde dosya sınırları (Schedule dosyaları T1'de).
- **Geri alma:** düşük-orta.

### KK-21 (2026-09-29) Takasta izni kısaltan yetki: izin sahibinin rızası + takası onaylayan yönetici
- **Karar:** Takas/pickup onayında izin sahibinin izni kısalırken ek bir `time_off.decide` kontrolü istenmez. Yetkinin kaynağı iki şey: izin sahibinin kendi eylemindeki rızası (rıza anındaki saatlerle sınırlı) ve takası onaylayan yöneticinin `exchange.approve` yetkisi. Takası onaylayan yönetici o izne karar veremeyen biri olabilir (başka lokasyonun izni ya da çalışan ondan üst kademede); iznin önceki onaylayıcıları `requests.time_off.shortened` bildirimiyle öğrenir. Yöneticinin tek başına kısaltması (Requests → Time off → "Shorten time off") ise `time_off.decide` ister (G9b, değişmedi).
- **Dayanak:** izin kişinin kendi hakkı; onu vermeyi seçen kişinin kendisi (KK-20 ek). Takası onaylayan yönetici izne değil vardiyaya karar veriyor; izin yalnız sahibinin rızasıyla, rızanın kapsadığı saatlerde kısalıyor. İkinci bir onay kapısı, çok lokasyonlu takası iki ayrı yöneticiye bağlayıp akışı kilitlerdi. nf-guvenlik G9b incelemesi (ONAY @1127dedd) bunu bilgi olarak işaretledi, güvenlik açığı saymadı.
- **Geri alma:** düşük (servis içinde tek kontrol eklemek).
- **Durum:** uygulandı (G9b).

### KK-22 (2026-09-29) G9b'nin görsel QA'sı main'e girdikten hemen sonra
- **Karar:** G9b (izni kısaltıp atamak) R3; nf-guvenlik ONAY @1127dedd ve CI yeşili main'den ÖNCE şart kalır. Görsel QA (nf-gorsel-qa; Employee Hub → Shift Hub, Requests → Shift changes onayı, Requests → Time off → "Shorten time off") main'e girdikten hemen sonra, migration'ı uygulanmış ortak yerel DB'de yapılır; bulgu çıkarsa küçük düzeltme olarak ardından gelir.
- **Dayanak:** yeni ekranlar yalnız G9b migration'ının getirdiği kayıtlarla görünür; migration ortak yerel DB'ye yalnız main penceresinde uygulanabilir (kullanıcı kararı 2026-09-26). Değişiklik mevcut saat seçicisini yeniden kullanıyor ve metin satırı ekliyor; görsel hata ucuz geri alınır, yetki/veri hatası değil. İzin kaydı yok diye QA'yı atlamak da, main penceresi dışında migration uygulamak da kuralı bozar.
- **Geri alma:** düşük (yalnız sıra).
- **Durum:** uygulanıyor.

### KK-23 (2026-09-29) KK-10'daki BL-309 düzeltmesi; taslak sayacı yalnız taslakları sayar
- **Karar 1 (KK-10 düzeltmesi):** BL-309'un "ölü kaynak-taslak kodu silinir" kısmının dayanağı kalktı: `73483adf` yayının kaynak taslağını API'ye ekledi (shared şema + `20260929110000`), taslak satırındaki "Published" rozeti ve yayındaki taslağın silinme engeli çalışıyor ve testli. Silinecek olan yalnız gerçekten ölü "Saved by …" dalı (taslak listesi kaydedenin adını taşımıyor, hep "Unknown"); iki dosyadaki ikiz yardımcılar (`publishedTitle`, `publishedMeta`, `updatedByLabel`, `shortDate` ↔ `formatShortDateTime`) tek yere toplanır. G1'de.
- **Karar 2:** Schedule → taslak menüsündeki sayaç yalnız düzenlenebilir taslakları sayar; yayın satırı sayılmaz. Yayının kaynağı olan taslak hâlâ taslak olarak duruyorsa o bir taslak olarak sayılır.
- **Dayanak:** G1 işçisinin tazelik ölçümü (origin/main `4490f8e3`; `DraftDropdownMenu.test.tsx:177/230/284`). Sayaç: menünün adı "taslak"; yayın ayrı bir durum ve listede kendi rozetiyle görünüyor, iki kez sayılmamalı.
- **Geri alma:** düşük (yalnız arayüz).
- **Durum:** G1'de uygulanıyor.

### KK-24 (2026-09-29) Admin başka admin'in çalışan kaydını düzenlemez
- **Karar:** (a). Admin yalnız manager ve employee kayıtlarını ve kendi kaydını düzenler (Employees çekmecesi → Save: ad, lokasyon, iş, not); başka bir admin'in kaydını owner düzenler. Örnek: Zeynep (admin, Kadıköy) Kaan'ın (admin, Beşiktaş) işini değiştiremez; Kaan'ın kaydını owner değiştirir.
- **Dayanak:** KARARLAR:40 "Admin: bütün lokasyonlar ve çalışanlar" bir kapsam kuralıdır (admin lokasyondan bağımsız herkesi görür), rütbe kuralı değil. Rütbe tarafında ilke her yerde aynı: eş rütbe yönetilmez (işten çıkarma, erişim kaldırma, rol değiştirme — BL-270; manager ↔ manager; admin atama/kaldırma owner'a özel). Çekirdek (`employee.save`, rank_below) bugün zaten "hayır" diyor; kod değişmez, matrisin beklentisi düzeltilir. Soru BL-129 ile matrise ikinci admin eklenince çıktı (FB-6.2 Dal A).
- **Karşı argüman:** (b) küçük işletmede iki admin'in birbirinin işini düzeltmesi pratik. Owner her workspace'te var ve düzeltebilir; istisna çekirdekte admin'e özel bir satır ve ikinci bir kural demek.
- **Geri alma:** düşük (çekirdekte tek satır + tek matris hücresi).
- **Durum:** FB-6.2 Dal A'da uygulanıyor; KARARLAR "Ürün kuralları"na T5a kapanışında yazılır.

### KK-25 (2026-09-29) BL-248'in testi silinir; BL-094 seed'e dokunmadan kapanır
- **Karar 1 (BL-248):** (a). Belgesi engelli bir owner'ı elle kuran pgTAP hücresi silinir. Ürün bu durumu artık üretemiyor (owner devirde ve kayıtta belgeden muaf); bugünkü kurala uymayan kaydı kuran test, var olmayan bir ürünü anlatır.
- **Karar 2 (BL-094):** (a). Madde kapanır; `seed.sql:275` demo haftası ileri alınmaz. Kalan test (`workspace_rls:931`) bugün CI'da yeşil; seed haftasını oynatmak demo'yu ve e2e'yi etkiler, kazancı yok.
- **Dayanak:** CLAUDE.md §9 ve kullanıcının genel kuralı "eski veri korunmaz" (canlı veri yok; kurala uymayan kaydı kuran test silinir). G12 işçisinin ölçümü (`docs/plan/tasks/G12-kararlar.md`).
- **Geri alma:** düşük.
- **Durum:** BL-248 silmesi sonraki G12 turunda; BL-094 T4 kapanışında kapanır.

### KK-26 (2026-09-29) G1'in kalan üç web maddesi G3 main'e girince başlar
- **Karar:** BL-193 (Schedule'da ham doğrulama hatası), BL-324 (taslak okuması düşünce ızgara hatasız boş) ve `SchedulePage.tsx` `followUpAfterUnpublish` onError'unun ham `error.message`'ı G1 işçisine verildi, ama iş G3 (`task/g3-stale-screens`) main'e girdikten sonra güncel `origin/main`'den başlar.
- **Dayanak:** G3 dalı `SchedulePage.tsx` ve `schedule-data.ts`'e dokunuyor (`e66ba44b`, ölçüm 2026-09-29); CLAUDE.md §4 "aynı dosyada iki rol aynı anda çalışmaz". G1 işçisi boşta; bekleme hattı durdurmuyor.
- **Geri alma:** kolay (yalnız sıra).
- **Durum:** uygulanıyor; G1 işçisine 2026-09-29 gece bildirildi.

### KK-27 (2026-09-29) FB-6.2 (G7) parçalama önerisi kabul; T5a Dal B'yi beklemez
- **Karar:** `FB-6.2.md` → "Parçalama önerisi" olduğu gibi kabul: Dal A (`nf-db`, sıralı `.0b`–`.6`), Dal B (`nf-backend`, `.7a` bugünkü çekirdek eylemleriyle; `.7b` Dal A `.5` main'e girince), toplu turlar T5a / T5b / T5c. Tek ek: Dal B `.7a` G3 (`task/g3-stale-screens`) main'e girince başlar (G3 `EmployeeDrawer.tsx`'e dokunuyor, ölçüm `e66ba44b`); Dal A `.0b`–`.3` bittiğinde `.7a` hazır değilse T5a onsuz main'e girer, `.7a` T5b'ye kayar.
- **Dayanak:** öneri (nf-planlama, `4490f8e3` tabanı) ve pre-mortem; Dal A zaten bu sırayla yürüyor (HANDOFF 2026-09-29 gece §2). CLAUDE.md §4 aynı dosyada iki oturum çalışmaz. Yetki çekirdeği turu web kısmını beklemek için durmamalı.
- **Geri alma:** kolay (yalnız sıra ve tur sınırı).
- **Durum:** uygulanıyor.

### KK-28 (2026-09-29) Ortak yerel DB'de Main Dining'in saat dilimi seed değerine döndürüldü
- **Karar:** nf-planlama'nın seçenek (1)'i: yerel `public.locations` `11000000-0000-4000-8000-000000000001` (Main Dining) `timezone` `America/New_York` → `America/Los_Angeles` (`seed.sql:283`). Tek UPDATE, `db.lock` altında, koordinatör yaptı.
- **Dayanak:** BL-209 (kayma 2026-09-22'den beri); `shift_exchanges_v1` AT20/AT21 yerelde bu yüzden kırmızıydı, CI temiz DB'den kurduğu için yeşil. Kayma her yerel koşuda yanlış alarm veriyordu (FB-6.2 Dal A raporu). Canlı veri yok; yerel DB kurala uymuyorsa düzeltilen veridir.
- **Yedek / geri alma:** eski değer `America/New_York` (`updated_at 2026-09-22 22:56:18.979668+00`); geri almak aynı UPDATE'in tersi. Kalıcı çare BL-217'nin kalanı (dosyayı test dünyasına taşımak).
- **Durum:** uygulandı 2026-09-29 gece; dosyanın yerelde yeşile döndüğü nf-planlama ölçümüyle BL-209'a yazılır.

### KK-29 (2026-09-29) "Yalnız yönetir" lokasyonda kişi, o lokasyonun öteki yöneticileri için "orada" sayılır
- **EMP-001 ile geçersiz (2026-09-30; söküm main'de `bf52f5e1`):** "yalnız yönetir" lokasyonu kaldırıldı; bu maddenin ona dayanan kısmı artık uygulanmıyor. Güncel kural `KARARLAR.md` "Ürün kuralları" (manager'ın lokasyonları = atamaları; K4).
- **Karar:** Bir yönetici bir lokasyonu yalnız yönetiyorsa (orada çalışmıyor; `membership_managed_locations`), o lokasyonun öteki yöneticileri onu M2'deki gibi bütün kişi eylemlerinde "orada" sayar: görmek, müsaitlik okumak/yazmak, belge okumak. Örnek: Selin Beşiktaş'ı yönetir, orada çalışmaz; Beşiktaş'taki öteki yönetici Selin'in kaydını görür ve müsaitliğini yazabilir (M2 kişi/yazma = her yer, rütbe şartı yok). Vardiya/Takvim tarafında Selin Beşiktaş ızgarasına girmez (ayrı kural, testli).
- **Dayanak:** KARARLAR "Roller ve kapsam" M2 ve S2(a); FB-6.2 T5a nf-guvenlik D1 (ONAY @9d376ce8, matriste `target selin {B}` kodlu). İkinci bir "yalnız görür" kuralı çekirdekte istisna satırı demek; M2 tek kural.
- **Karşı argüman:** kullanıcı "yalnız yönetir"i yalnız görünürlük olarak kastetmiş olabilir; o zaman kişi eylemleri görmekle sınırlanır.
- **Geri alma:** orta (çekirdekte kişi yerleri hesabı + matris hücreleri).
- **Durum:** T5a'da uygulanmış hâli; kullanıcıya dönüşte sorulur.

### KK-30 (2026-09-29) G1'in üç web maddesi önce, G7 Dal B (.7a) G1 main'e girince
- **Karar:** G3 main'e girdi (`c63b0c45`); KK-26'daki G1 kalemleri (BL-193, BL-324, `followUpAfterUnpublish` onError) şimdi başlar. G7 Dal B `.7a` (KK-27) G1'in bu dalı main'e girince başlar.
- **Dayanak:** `.7a` `SchedulePage.tsx`'e de dokunuyor (FB-6.2 Touches, "yalnız çekmeceyi açan kapı"); CLAUDE.md §4 aynı dosyada iki oturum çalışmaz. G1'in üç kalemi küçük (R1), `.7a` birkaç ekrana yayılıyor; küçük olan önce biter, bekleme kısa kalır. T5a `.7a`'yı beklemedi (KK-27); `.7a` T5b turuna girer.
- **Geri alma:** kolay (yalnız sıra).
- **Durum:** uygulanıyor.

### KK-31 (2026-09-29) FB-6.2 Dal B .7a'nın üç sorusu: PermissionRoute ertelenir, eşdeğersiz izinler taşınmaz, API rota kapıları kalkar
- **S1 (b):** `.7a` yalnız `resolveLanding` ve WorkspacePage'i `can()`'e çevirir; `PermissionRoute` (App.tsx'te 30+ rota, Settings ve Announcements dahil) FB-6.8'e ertelenir; Done when 20'nin o satırı FB-6.8'in. Dayanak: dört rotanın (`announcements.read`, `settings.general.read`, `settings.schedule_rules.read`, bildirim ayarları bileşimi) çekirdekte eşdeğer eylemi yok; "en yakın eylem" ekranla sunucuyu ayrıştırır (FB-6.2 pre-mortem 3); karışık izin+eylem kapısı ikiz sistem olur (CLAUDE.md §9).
- **S2 (a):** Çekmecenin 12 `permissions.includes`'undan eşdeğeri olan 7'si çevrilir; eşdeğeri olmayan 5'i (`employee_access.read/manage`, `employees.private.manage/read`, route-yerel `employee_onboarding.review`) `.7b` / FB-6.6'ya kalır. Done when 6 `.7b`'de tamamlanır.
- **S3 (a):** `apps/api/src/employees/employee-directory-routes.ts`'teki route-yerel izin kapıları okuma ve yazma rotalarından kalkar; ret çekirdekten `authz.*` ile gelir (403/404 sözleşmesi). Davet/oluşturma rotaları `.5`/`.7b`'de. Şart: `.7a` main'e T5b `.4` ile aynı turda ya da sonra girer (yazma rotaları `.4`'ün çekirdek kurallarına dayanıyor).
- **Geri alma:** S1/S2 kolay (sıra); S3 orta (kapılar geri eklenebilir, ama yasak kalıp).
- **Durum:** uygulanıyor.

### KK-32 (2026-09-30) FB-6.2 T5b-3'ün üç davranış farkı ve to-do ikizi
Kaynak: `nf-guvenlik` T5b-3 incelemesi ONAY @`45ce6f53` §3 ve D1–D4 (`busy-ishizaka-ecfaf0/artifacts/nf-guvenlik/fb62-t5b-3/RAPOR.md`).
- **(a) Admin, başka admin'in çalıştığı lokasyonu silebilir — kalır.** KK-24 bir kaydı düzenleme kuralı; lokasyon silmek organizasyon işlemi, atamanın bitmesi yan sonuç. Admin zaten bütün lokasyonlara erişiyor; owner her canlı lokasyonda tutuluyor. Engellemek küçük işletmede lokasyonu silinemez yapar. Silme onayının etkilenen kişileri adıyla listelemesi ayrı iş (backlog, `nf-arayuz`).
- **(b) `employee.request_preferred_name` için `restricted_ok = true`.** Kişi yalnız kendi kaydına talep açıyor, kararı üst rütbe veriyor; onboarding'deki ya da belgesi eksik kişiye kapıyı kapatmak güvenlik kazandırmıyor, Account → Profile'daki tek Save'i o workspace'te düşürüyor. Kapalı workspace ve askıdaki üyelik reddedilmeye devam eder. T5b-4'te yapılır.
- **(c) Pano sayıları izne bağlı — kalır** (fail-closed). İzni olmayana widget'ı hiç göstermemek ayrı ekran işi (backlog, `nf-arayuz`).
- **(D1) To-do: yönetici yazmaya devam eder; ikiz kapı kalkar.** Bugünkü davranış (owner/admin/manager to-do yazar) ürün için doğru: yönetici kendi lokasyonunu yönetir. Çekirdekteki `workspace.todos` satırı yöneticiye açılır, `authorize_workspace_todos` ve `workspace_todo_actor_role` silinir, servisler çekirdeğe sorar (`retired_objects_stay_gone`). D2 (kapalı workspace'te pano kapısı) aynı işte kapanır. T5b-4'te yapılır; ikiz sistem main'e girmez (CLAUDE.md §9).
- **(D3, D4)** backlog (düşük): bilinmeyen izin talebinde önce üyelik sorulsun; hafta listesinde taslak varlığı P0002.
- **Dayanak:** CLAUDE.md §9 (ikiz sistem yok, fail-closed), KARARLAR ürün kuralları (M2), `nf-guvenlik` önerileri.
- **Geri alma:** (a)(c) kolay; (b) tek satır; (D1) orta (çekirdek satırı + servis; yönetici to-do'yu kaybetmesi istenirse satır geri kapanır).
- **Durum:** uygulanıyor (T5b-4).

### KK-33 (2026-09-30) T5b-4 onboarding incelemesi: KK-29 yöneticisi FB-6.6'ya kadar P0002 alır
- **EMP-001 ile geçersiz (2026-09-30; söküm main'de `bf52f5e1`):** "yalnız yönetir" lokasyonu kaldırıldı; bu maddenin ona dayanan kısmı artık uygulanmıyor. Güncel kural `KARARLAR.md` "Ürün kuralları" (manager'ın lokasyonları = atamaları; K4).
- **Karar:** `review_employee_onboarding…` çekirdeğe (`onboarding.review`) geçerken fonksiyonun `service_actor_can_access_employee` satırına dokunulmaz. Yalnız yönettiği lokasyondaki kişinin onboarding'ini açmaya çalışan yönetici (KK-29) çekirdekten geçer ama o satırda `P0002 onboarding case unavailable` alır (önce ipuçsuz 42501). Erişim değişmez; yalnız ret kodu değişir. Test hücresi bugünkü cevabı "FB-6.6 bilinen boşluk" açıklamasıyla kilitler; FB-6.6 maddesine not.
- **Dayanak:** kimseye yeni erişim açılmıyor; belge/onboarding yardımcısı FB-6.6'nın kapsamı; T5b sınırda kalır.
- **Geri alma:** kolay (FB-6.6 satırı kaldırınca hücre değişir).
- **Durum:** uygulanıyor (T5b-4).

### KK-34 (2026-09-30) KK-32 D1'in biçimi: `workspace.todos` çekirdekte org / read / `workspace.read`
- **Karar:** To-do yazma eylemi çekirdekte `org` kapsamı, `read` etkisi ve `workspace.read` izniyle tanımlanır. M2'de `org/read` yöneticiye `org` verdiği için owner, admin ve yönetici workspace genelinde bugünkü gibi to-do yazar ve kapatır; çalışan `missing_permission` alır; kapalı workspace, onboarding'deki üye ve belge engeli ret alır (D2 kapanır). Pano kapısı aynı eylemi sorar. Migration yorumu "yazma eylemi, read etiketli — KK-34" der; `effect = read` etiketinin başka bir yazma kapısını atlatmadığı bir test hücresiyle sabitlenir.
- **Reddedilenler:** to-do'yu lokasyona bağlamak (şema + ekran + davranış değişir); çekirdeğe eylem başına "yöneticiye org" bayrağı (çekirdek şekil değişikliği, daha riskli).
- **Bedel:** bir yazma eylemi "read" etiketi taşır. `workspace.read`'i kaldırılmış özel yönetici rolü to-do yazamaz (bugün yazabiliyor ama panoyu açamıyor). Web `can('workspace.todos')` bugün çağrılmıyor.
- **Dayanak:** KK-32 D1 (yönetici to-do yazmaya devam eder, ikiz kapı kalkar); en küçük çekirdek değişikliği; `nf-db` önerisi.
- **Geri alma:** kolay (tek satır); çekirdek eylem başına kapsam desteği kazanırsa satır `write`'a döner.
- **Durum:** uygulanıyor (T5b-4).

### KK-35 (2026-09-30) FB-6.2 `.7b`'nin dört sorusu: okuma migration'ı nf-db'den, özel alan sunucu cevabından, hub `can()` ile
- **EMP-001 ile geçersiz (2026-09-30; söküm main'de `bf52f5e1`):** "yalnız yönetir" lokasyonu kaldırıldı; bu maddenin ona dayanan kısmı artık uygulanmıyor. Güncel kural `KARARLAR.md` "Ürün kuralları" (manager'ın lokasyonları = atamaları; K4).
- **S1 (a) + S2 (a):** `nf-db` tek bir yalnız-okuma migration'ı yazar (çekirdek üzerinden): `get_employee_detail_service` cevabına `managed_locations: [{id, name}]`, `locations[]` içine `removable` (çekirdek, o lokasyonla `employee.remove_from_location`), `allowed`'a `set_managed_locations`, `invite`, `onboarding_review`; liste servisine yönetilen lokasyon adları ("Manages" etiketi için). Mevcut listeyi göstermeyen editör, var olan "yalnız yönetir" lokasyonlarını sildirir; lokasyon bazlı çıkarma kuralını web türetemez (iki kaynak). `nf-backend` API/web'i bu biçime bağlar; iki dal aynı toplu turda main'e girer.
- **S3 (a):** `employees.private.read` için çekirdeğe yeni eylem yazılmaz; sunucu yetkisizde `private_contact`'ı zaten null döndürüyor, web ona bakar. Öteki dört `permissions.includes` `allowed`'dan (S2 a).
- **S4 (a):** `employee-hub/*` rotası `can(employee_hub.read)` ile açılır, rol listesi kalkar; çalışan kaydı olmayan kişi hub'da erişim-yok kartı + "Back to workspace" görür. Bağlama `has_employee_record` eklenmez. Menü öğesi `.8`'de.
- **Dayanak:** CLAUDE.md §9 (ikiz sistem ve route-yerel kapı yok, sunucu tek kaynak); en küçük çekirdek değişikliği; `nf-backend` önerileri.
- **Bedel:** shared `employeeDetailSchema`'ya yeni zorunlu anahtarlar → canlı DB'nin geride kalması (BL-405) bir migration daha büyür.
- **Geri alma:** orta (okuma projeksiyonu + şema); S3/S4 kolay.
- **Durum:** uygulanıyor (`.7b` + `.7b-db`).
- **Kullanıcı yokken düzeltme (2026-09-30):** S3'ün "`private_contact` null = izin yok" varsayımı yanlıştı: sunucu gizli profil satırı hiç yokken de null döndürüyordu. Bu, main'e Profile gerilemesi soktu — owner bile onboarding'i bitmemiş kişinin Date of birth, Phone, Emergency contact ve adres alanlarını göremedi. Koordinatörün hatası: varsayım sunucuda ölçülmeden karara yazıldı. `.7b` görsel QA'sı yakaladı (KK-37). Düzeltme `809592bc` (migration `20260930190000_the_drawer_tells_nothing_on_file_from_not_allowed.sql`): null artık yalnız "okuma izni yok"; izinliye kayıt yoksa boş nesne gider. Ders: "null şu demek" diye karar yazmadan önce sunucunun null'u hangi durumlarda döndürdüğü ölçülür.

### KK-36 (2026-09-30) `.7b` S5: Workspace düzen kaydı çekirdeğe `.7b-db`'de sorar, rota kapısı ondan sonra kalkar
- **Karar:** `PUT …/workspace/layout` rotasının kapısı `.7b`'de şimdilik durur. `save_workspace_layout_service` `.7b-db` migration'ında panonun kapısıyla aynı çekirdek eylemine sorar (ret ipuçlu); bugünkü davranış korunur (çalışan kendi düzenini bugün yazamıyorsa yine yazamaz). Sonra `.7b` rota kapısını kaldırır; BL-413'ün dördüncü rotası böylece kapanır.
- **Dayanak:** rota kapısını servis çekirdeğe sormadan kaldırmak kuralı sessizce değiştirir; CLAUDE.md §9 route-yerel kapı yasağı servis çekirdekteyken yerine gelir.
- **Geri alma:** kolay.
- **Ek (aynı gün, `nf-db` ölçümü):** çalışan sistem rolü her workspace'te `workspace.read` tutuyor, yani eski kapı çalışana düzen kaydettiriyordu; ama çalışan panoyu açamıyor, kayıt yalnız API'den mümkündü. Karar: servis `workspace.todos`'a sorar; çalışan kullanamadığı bu yazmayı kaybeder (`missing_permission`), kapalı workspace ve belge engeli ret (KK-34 D2 gibi). Yeni `workspace.layout` eylemi reddedildi (katalog + matris maliyeti, ekranı olmayan hak).
- **Durum:** uygulanıyor (`.7b-db`, `.7b`).

### KK-37 (2026-09-30) `.7b` görsel QA'sının çekmece kısmı main'den sonra; oturum havuzu bitiyor
- **Karar (QA):** `.7b` + `.7b-db` main'e `nf-guvenlik` ONAY + dal CI yeşil ile girer; çekmecenin (Employment, Access, Profile) görsel QA'sı main'e girince yapılır. Neden: çekmece yeni migration'ın (`20260930180000`) alanlarını zorunlu okuyor; migration ortak yerel DB'ye yalnız main'e göndermeden hemen önce uygulanır (kullanıcı kararı 2026-09-26). Employee Hub kısmı migration'sız bakıldı. QA değişiklik isterse ayrı düzeltme dalı (KK-22 / G9b kalıbı).
- **Durum (havuz):** "Bekle: … (N)" havuzunda yalnız (30) kaldı ve koordinatör devrine ayrıldı; bu oturumdan yeni oturum açılamıyor. `nf-planlama` %55'e kadar sürer, sonra alt ajanla. Kullanıcı dönüşünde havuzu yenilemeli.
- **Geri alma:** kolay.

### KK-38 (2026-09-30) Çalışanın kendi acil durum kişisini kaydetmesi yetki çekirdeğine sorar (BL-443 / BL-444)
- **Karar:** kişinin kendi acil durum kişisini ve kişisel telefonunu kaydettiği uç (`save_own_employment_contact_service`) izin kararını yetki çekirdeğinden alır; yeni eylem `employee.save_own_contact` (`nf-db`'nin önerisi). Askıdaki ya da çıkarılmış kişinin bu kaydı yapamaması kabul edildi.
- **Uygulamada etkisi:** iki ekran aynı ucu çağırıyor (koddan ölçüldü, `origin/main` `2eaf490b`): Account → Profile → "Emergency contact" grubu (`apps/web/src/account/ProfilePage.tsx:504`, kayıt `:318`) ve Employees → kişinin kendi kaydının çekmecesi (`apps/web/src/employees/EmployeeDrawer.tsx:3218`). Aktif çalışan için değişen yok: Ayşe Account → Profile'da acil durum kişisini "Mehmet, eşi, telefonu" diye yazar, kaydeder, kaydolur. Değişen: workspace'te askıya alınmış ya da çıkarılmış kişi. Önce bu kişi kendi acil durum kişisini değiştirebiliyordu; şimdi "erişim yok" cevabı alır, kayıt değişmez (bugünkü kodda reddedilen kayıt Account → Profile'da "Your emergency contact could not be saved in <workspace adı>. Try again." satırını gösteriyor, `ProfilePage.tsx:369`; dal main'e girince ekranda yeniden bakılır). Ayrıca başkasının kaydına ya da var olmayan bir kişiye yazma denemesi artık aynı cevabı alır; önce biri "bulunamadı", öteki "yetki yok" diyordu ve kimin var olduğu anlaşılıyordu.
- **Dayanak:** `CLAUDE.md` §9 (fail-open kapatılır; bilinmeyen ve kapsam dışı hedef aynı cevabı alır).
- **Geri alma:** kolay (tek eylem satırı).
- **Durum:** main'de (`9aa200eb`, `de5205d6`; 2026-09-30); canlıda 2026-09-30 (kullanıcı gönderdi, OPS-03; besleme #16). **Ölçüm (alt ajan, kod okuması; ekranda denenmedi):** API, erişimi alınmış üyeye ve kapalı workspace'e çekirdeğe sormadan 404 `authz.not_member` veriyor (`apps/api/src/auth/workspace-context.ts:60-62`); bu durumda Account → Profile büyük olasılıkla "… could not be saved … Try again." diyor, yeni "can no longer be changed" cümlesi değil. Kayıt yine reddediliyor; yalnız cümle farklı olabilir. KK-45'e bakınız.

### KK-39 (2026-09-30) Tercih edilen ad onay ayarı yetki çekirdeğine bağlanır (BL-443)
- **Karar:** "Preferred names" onay ayarını okuma ve yazma çekirdeğe sorar; yeni okuma eylemi `settings.people.read` (izin `employees.read`), yazma var olan `settings.people`.
- **Uygulamada etkisi:** Settings → General → "Preferred names" (`apps/web/src/settings/GeneralSettingsPage.tsx:237`; koddan ölçüldü). Görünürde değişen yok: owner Mert ayarı açar ya da kapatır, önceki gibi kaydolur; Employees çekmecesinde tercih edilen ad alanı aynı çalışır. Yetkisi olmayan kişi önce de reddediliyordu, şimdi de reddedilir; yalnız hata cevabı öteki ekranlarla aynı biçime gelir ("hayır" nedenini söyler).
- **Dayanak:** `CLAUDE.md` §9 (route-yerel yetki kapısı kalkar; her uç yetki çekirdeği üzerinden).
- **Geri alma:** kolay.
- **Durum:** main'de (`9aa200eb` veritabanı, `ee2f1e6f` rotalar; 2026-09-30); canlıda 2026-09-30 (kullanıcı gönderdi, OPS-03; besleme #16).

### KK-40 (2026-09-30) Bağlamı dolan iki rol oturumu kart beklenmeden boş oturumlara devredildi
- **Karar:** `nf-db` rol oturumu (bağlam %63) ve kayıt oturumu (%50) havuzdaki boş oturumlara devredildi; yenileri `local_75ba0d8c-210e-4971-808f-45d621e68993` (`nf-db`) ve `local_6c8429c0-01e9-4088-87de-3dc56a4c6eea` (kayıt).
- **Uygulamada etkisi:** yok (çalışma düzeni; hiçbir ekran değişmedi).
- **Dayanak:** kullanıcının çalışma biçimi kuralı (bu dosyanın başı): bağlamı dolan oturum boş oturuma verilir, kart onayı beklenmez.
- **Geri alma:** gerekmez.
- **Durum:** yapıldı; eski iki oturum "(eski)" adıyla duruyor, arşivi kullanıcıda.

### KK-41 (2026-09-30) G14 dilim b: incelemenin iki orta bulgusu backlog'a atılmadı, main'den önce düzeltiliyor
- **Karar:** bağımsız kod incelemesinin (alt ajan, `task/g14-b` @`c6a27136`, "değişiklik isteniyor") bulguları aynı turda işçiye verildi; dal düzeltilmeden main'e girmez.
- **Uygulamada etkisi:** Schedule → üst çubuk → basılamayan Publish düğmesi. Dilim b bu düğmeye "neden basılamıyor" balonu ekliyor. Düzeltilmeseydi: balon açıkken Escape'e basan müdürde tuş sayfanın kendi kuralına da ulaşıyor, ekran bu haftaya sıçrıyor ya da süzgeç siliniyordu; şimdi Escape yalnız balonu kapatır. İkincisi: Pazar sütunundaki gri "başka lokasyonda" kartının konum balonu iğnesinden yaklaşık 50px sola kayıyordu; şimdi iğnesinin altında durur. İkisi de dalda yakalandı, main'e hiç girmedi; kullanıcı bu iki hatayı görmedi.
- **Dayanak:** `DELEGASYON.md` §3 (R2: tek bağımsız inceleme main'den önce); bulgu yeni eklenen davranışın kendisinde.
- **Geri alma:** kolay.
- **Durum:** main'de (`2df0cb3e`, `532cc9c0`, `7e19a76b`; 2026-09-30); görsel QA ONAY @`7e19a76b`.

### KK-42 (2026-09-30) Eski metni bekleyen e2e beklentisini koordinatör düzeltti (R0)
- **Karar:** `e2e/flows/schedule-multi-location.spec.ts:92` yeni tekil metne çekildi ("1 of 1 location selected"; `d411d7a8`). İşçiye geri gönderilmedi.
- **Uygulamada etkisi:** yok (yalnız test). Testin denediği ekran: Schedule → Publish → "Select locations to publish"; ekrandaki metni G14 dilim a değiştirmişti, test eskisini bekliyordu.
- **Dayanak:** `DELEGASYON.md` §3 R0 (yalnız test dosyası; koordinatör yazar, inceleme yok).
- **Geri alma:** kolay.
- **Durum:** main'de (`d411d7a8`); dal CI 36711977574 ve main CI 36713156485 yeşil.

### KK-43 (2026-09-30) EMP-001 sökümü main'e canlı veritabanına gönderimden önce girdi
- **Karar:** "Manages without working there"i silen iş (EMP-001 B) önce main'e alındı; canlı veritabanına iki migration sonra, kullanıcı tarafından gönderilecek.
- **Uygulamada etkisi:** yerelde Employees → kişi → çekmece → Employment'ta "Manages without working there" listesi yok, Employees listesinde "Manages <lokasyon>" çipi yok ("No location" duruyor), müdür kuralı geçerli (koddan ölçüldü: `apps/web/src`'te iki metin de 0 eşleşme). Canlı sitede görünen değişiklik yok: site bu repodan yayın almıyor (BL-426). Canlı veritabanı iki migration geride (koordinatörün aktardığı). Bedel: bu iş için ultrareview çalıştırılamaz, dal birleşti.
- **Dayanak:** `nf-guvenlik` E1: iş alan siliyor; migration önce giderse yayındaki eski kod kırılır ("Employees listesi ve çekmecesi 500 verir"). KARARLAR OPS-03'ün "önce canlı migration" sırası alan ekleyen iş içindir. Kullanıcıya soru: OPS-03'e bu cümle eklensin mi (`ILERLEME-PLANI.md` §0c).
- **Geri alma:** orta (migration'lar yerelde uygulandı; geri dönüş yeni migration ister).
- **Durum:** main'de `9733f42c`; main CI 36720132559 check + db + e2e yeşil; canlıda 2026-09-30 (kullanıcı gönderdi; besleme #16).
- **Mert:** değişti 2026-09-30 — dayanaktaki "site bu repodan yayın almıyor" yanlıştı (bkz. KK-65 düzeltmesi, BL-426 bayat); OPS-03'e cümle ekleme sorusu bu yüzden konusuz.

### KK-44 (2026-09-30) Kayıt yolunda lokasyonsuz müdüre veritabanı genel cümleyi verir
- **Karar:** Remote ve "Exclude from schedule" kapalıyken lokasyonsuz kaydedilen kişide veritabanı önce genel "lokasyon zorunlu" cevabını verir; müdüre özel cümle Remove, rol ve davet yollarında (ve işaretli müdürün kaydında) çıkar.
- **Uygulamada etkisi:** Employees → kişi → çekmece → Employment → Locations. Çekmece müdürü kendisi yakalıyor: lokasyonsuz müdürde Save kapalı ve alt çubuğun üstünde "A manager needs at least one location to manage. Choose a location, or turn on Remote." yazıyor (`apps/web/src/employees/EmployeeDrawer.tsx:192-198`, `:1194-1201`). Genel cümle "Choose at least one location and mark one as primary, or turn on Remote or Exclude from schedule." (`packages/shared/src/index.ts:877-878`) yalnız sunucu cevabında. Örnek: Beşiktaş müdürü Deniz'in tek lokasyonunun işareti kaldırılırsa Save basılamaz, müdür cümlesi görünür. Fark: besleme "çekmecede genel cümleyi görür" diyordu; kod çekmecede müdür cümlesini gösteriyor (alt ajan; ekranda denenmedi). **Ek (besleme #12, alt ajan `ddb2e359`):** koordinatör kullanıcıya "çekmece lokasyonsuz müdüre müdür cümlesini gösterir, genel cümle yalnız sunucu cevabında" diye düzeltti. İkinci yarısı kodda tam böyle değil: genel cümle formda da üretiliyor (`packages/shared/src/index.ts:2701-2705`) ve form kaydın müdür olduğunu bilmediğinde çekmecede çıkar (`EmployeeDrawer.tsx:189-192`); sunucu ise müdüre müdür cümlesini yolluyor (`apps/api/src/http-error.ts:138-139`). Satırlar bugün: `EmployeeDrawer.tsx:193-199`, `:1224-1227`; `index.ts:878`, `:883`. Ekranda denenmedi.
- **Dayanak:** kayıt yolunda eski genel kural zaten aynı durumu reddediyordu; iki ayrı ret yerine ilki cevaplıyor.
- **Geri alma:** kolay.
- **Durum:** main'de (`9aa200eb`).

### KK-45 (2026-09-30) Açık olmayan workspace'te acil durum kişisi yazılamaz
- **Karar:** kurulumu bitmemiş ya da kapanmış workspace'in çalışanı kendi acil durum kişisini kaydedemez; owner kurulum sırasında yazar.
- **Uygulamada etkisi:** Account → Profile → "Emergency contact" (`apps/web/src/account/ProfilePage.tsx`). Kalıcı rette "Your emergency contact can no longer be changed in <workspace>: your access there has ended or the workspace is closed." (`:384`), öteki rette "Your emergency contact could not be saved in <workspace>. Try again." (`:380`). Örnek: kurulumu bitmemiş "Meyhouse" workspace'ine eklenmiş çalışan Ayşe acil durum kişisini değiştirir; kayıt reddedilir ve ilk cümleyi görür; owner Mert aynı ekranda kaydeder. Ölçüm notu (alt ajan, kod okuması): kapalı workspace ve erişimi alınmış üyede API çekirdeğe sormadan 404 veriyor; o durumda ekran "Try again." diyor olabilir, yeni cümle yalnız kurulumu bitmemiş workspace'te çıkıyor gibi. Ekranda denenmedi; görsel QA'da bakılmalı. **Ek (besleme #13, `8b1b0cf0`; kodda ölçüldü):** ölçüm notundaki açık kapandı — form açıkken erişimi alınan kişide sunucu 404 `authz.not_member` verir; ekran bunu artık ayırıyor (`accessEnded`, `apps/web/src/account/ProfilePage.tsx:92`, `:348`) ve "can no longer be changed" cümlesini gösteriyor (`:396`); "Try again." yalnız öteki retlerde (`:392`). Örnek: Ayşe formu açmışken "Meyhouse"taki erişimi alınır, kaydetmeye basar; "Try again." yerine erişiminin bittiğini okur. Tercih edilen ad aynı durumda hâlâ "Try again." diyor: BL-471.
- **Dayanak:** `CLAUDE.md` §9 (yazma, açık olmayan workspace'te reddedilir; ret okunur cümleyle).
- **Geri alma:** kolay.
- **Durum:** main'de (`9aa200eb`, `de5205d6`; erişimi alınmış kişi için `8b1b0cf0`, main CI 36727438047 yeşil). Ekran doğrulaması `nf-gorsel-qa` turunda (B4 + A3 + acil durum mesajı, `45f8ddfe` üstünde; koordinatörün aktardığı).

### KK-46 (2026-09-30) Lokasyondan çıkarma sonrası çekmece kapanır (EMP-001 B4'e eklendi)
- **Karar:** `nf-test`'in bulgusu B4 dilimine alındı: kişi, bakanın tek ortak lokasyonundan çıkarılınca çekmece kapanır.
- **Uygulamada etkisi:** Employees → kişi → çekmece → Employment → Locations → "Remove from Kadikoy" (`apps/web/src/employees/EmployeeLocationParts.tsx:38`). Önce: Kadıköy müdürü Ayşe kişiyi çıkarınca çekmece "erişimin yok" kilidinde açık kalıyordu (koordinatörün aktardığı). Sonra: çekmece kapanır ve "Removed from Kadikoy" bildirimi çıkar (`task/emp-001-b4`, `EmployeeDrawer.tsx:599`; dalda ölçüldü).
- **Dayanak:** kişi artık Ayşe'nin kapsamında değil; kilitli çekmece bir hata gibi okunuyor.
- **Geri alma:** kolay.
- **Durum:** main'de (`25fabe0a`; `EmployeeDrawer.tsx:599-600`, test `EmployeeDrawer.test.tsx:2379`; main CI 36724425552 yeşil; besleme #12'de ölçüldü).

### KK-47 (2026-09-30) Yeni kişi kaydı yoldayken geri tuşu tutulmaya devam eder (EMP-001 B4)
- **Karar:** K7 çekmecedeki "kaydedilmemiş değişiklik" uyarılarını kaldırıyor; yeni kişi isteği sunucudayken sayfadan çıkışın tutulması uyarı sayılmadı, kalıyor.
- **Uygulamada etkisi:** Employees → yeni kişi çekmecesi (koordinatörün aktardığı adıyla "Add employee"; düğme metni ölçülmedi). Save'e basıp hemen tarayıcının geri tuşuna basan kişi, istek cevaplanana kadar çekmecede kalır; cevap gelince çıkış serbest. Önce de böyleydi; değişen yalnız öteki uyarıların kalkması. Dalda test: `63f201d3`.
- **Dayanak:** yarım kalan kayıt isteği kişiyi iki kez ekletebilir; bu bir veri koruması, soru değil.
- **Geri alma:** kolay.
- **Durum:** main'de (`25fabe0a`, testi `69f9f642`; main CI 36724425552 yeşil). Hiç cevap gelmezse çekmece kilitli kalır: BL-465.

### KK-48 (2026-09-30) Access sekmesinde "Profile photo" grubunun iki açıklaması da kalkacak (BL-446)
- **Karar:** BL-446 kullanıcıya sorulacaktı; A2 kararıyla tutarlılık için kullanıcı yokken karar verildi: iki açıklama da kalkar.
- **Uygulamada etkisi:** Employees → kişi → çekmece → Access → "Profile photo": "Remove the workspace profile photo shown for this employee in this workspace." ve "Remove only the photo shown for this workspace." yazıları kalkar (bugün `apps/web/src/employees/EmployeeDrawer.tsx`'te duruyor; ölçüldü); başlık ve fotoğrafı kaldırma düğmesi kalır (koordinatörün aktardığı).
- **Dayanak:** kullanıcının A2 kararı (aynı sekmede "Account access" açıklamaları kalktı).
- **Geri alma:** kolay (iki metin).
- **Durum:** main'de (`c79620f2`, EMP-001 A3; main CI 36727438047 yeşil; besleme #13'te kodda ölçüldü: metin yalnız "Remove photo" düğmesinin ekran okuyucu açıklaması ve fare ipucu, `EmployeeDrawer.tsx:2605`, `:2663-2664`). Kullanıcı düzeltebilir (§0c satır 2).

### KK-49 (2026-09-30) Kurtarma penceresindeki fare hatası backlog'a atılmadı, aynı dalda düzeltildi
- **Karar:** `nf-gorsel-qa`'nın G14 dilim b'de bulduğu hata main'de de vardı; ayrı madde açılmadı, dilim b'de düzeltildi.
- **Uygulamada etkisi:** Schedule → düzenleme modu → Save başarısız olur → "Schedule save failed" penceresi. Önce: pencerede ilk fare tıkı yutuluyor, arkadaki takvim başka haftaya atlıyordu. Şimdi: ilk tık hedefine ulaşır, hafta atlamaz; "Discard" ilk tıkta "Confirm discard" olur (`7e19a76b`, `5be1db7d`; QA ONAY @`7e19a76b`).
- **Dayanak:** hata, dilim b'nin değiştirdiği pencerenin kendisinde; `DELEGASYON.md` §3 (inceleme bulgusu main'den önce).
- **Geri alma:** kolay.
- **Durum:** main'de (`0e6d0cfc`); main CI 36718980639 yeşil.

### KK-50 (2026-09-30) G18 (Belgeler) ikinci hat olarak başladı; K1 ve K2
- **Karar:** G14 bu planda kapandığı için ikinci hattı G18 aldı. Dilim a + b yeni işçi oturumunda (`local_713bf34a-f838-4b6c-881d-eaba5c50eca5`, `task/g18-a`), dilim c `nf-db`'de (`task/g18-c`). K1: "yayımlanmış belgenin yayın tarihi boş olamaz" CHECK'i yazılmıyor, U43 kapanır (kurala uymayan satırı üretecek yol yok). K2: BL-341'in işareti high. BL-118 kullanıcıya soruldu (§0c).
- **Uygulamada etkisi:** dilim a — belge çekmecesi (Account → Documents, Employees → Documents, Employees çekmecesi → Documents): dosya yükleyince, dosya silince ya da erteleme kaydedince yazılan son kullanma tarihi ve ek alanlar silinmez; örnek: Ayşe ehliyetinin son kullanma tarihini yazar, ikinci dosyayı yükler, tarih yerinde kalır (önce siliniyordu). Dilim c — hesap menüsünde "Documents"ın yanındaki sayı belge olmayan adımları saymaz; bugün çalışan kaydı olan herkes en az 2 görüyor, bekleyen belgesi olmayan 0 görecek. Dilim b yalnız test.
- **Dayanak:** kullanıcı 2026-09-30'da ikinci hattı açmıştı (EMP-001 yanında G14); G18 programda sıradaki hazır grup ve EMP-001 B4 ile dosyaları kesişmiyor (koordinatörün değerlendirmesi).
- **Geri alma:** kolay (K1 sonradan yazılabilir).
- **Durum:** main'de (`f71538ee`, `247947ee`, `2ca7559d`; main CI 36724425552 yeşil; besleme #12). U59, U60, BL-341 kapandı. Ölçüm notu: Documents sayısı belgelerin yanında onaylanacak politikaları da sayar; çekmecede yazılan, çekmece kapanınca düşer. Canlı veritabanına gönderim 2026-09-30'da yapıldı (kullanıcı; besleme #16).

### KK-51 (2026-09-30) Haftalık kullanım sınırı %80'de; %90'da yeni iş başlatılmaz
- **Karar:** uygulamanın kullanım kartı 2026-09-30 gecesi %80 gösterdi (koordinatörün aktardığı); %90'da yeni iş açılmayacak.
- **Uygulamada etkisi:** yok. Sabaha kullanıcıya pay kalır.
- **Dayanak:** kullanıcı sabah çalışabilsin.
- **Geri alma:** gerekmez.
- **Durum:** geçerli.
- **Mert:** ters 2026-10-01 — "Haftalık limiti şu an için dert etme": kullanım yüzdesi iş erteleme gerekçesi değildir.

### KK-52 (2026-09-30) `nf-backend` rol oturumu yenilendi
- **Karar:** eski `local_7a9cd29c…` (bağlam %53) → yeni `local_2464b099-317e-437f-ac12-5a506804d03d` (koordinatörün aktardığı).
- **Uygulamada etkisi:** yok (çalışma düzeni).
- **Dayanak:** bağlamı dolan oturum boş oturuma verilir, kart onayı beklenmez (bu dosyanın başı).
- **Geri alma:** gerekmez.
- **Durum:** yapıldı.

### KK-53 (2026-09-30) Belge çekmecesi düzeltmesi tarayıcıda Meyhouse'ta değil atık bir e2e workspace'inde denendi
- **Karar:** G18 dilim a'nın tarayıcı denemesi yerel Meyhouse workspace'inde yapılmadı; atık bir e2e workspace'i kullanıldı.
- **Uygulamada etkisi:** Meyhouse'ta değişen yok. Yerel veritabanında "World e2e1790771412855" workspace'inde kalanlar: yayımlanmış belge tanımı "G18 check", 9 kişiye birer Optional zorunluluk, Emre Person'ın sürüm 1'i (pending review), depoda 3 küçük PNG (koordinatörün aktardığı; veritabanında ölçülmedi). O workspace'e yerelde bakan bunları görür; başka workspace etkilenmez.
- **Dayanak:** Meyhouse'ta G14 QA verisi duruyor; üstüne belge verisi eklenmesin. E2e dünyasının owner'ına sihirli bağlantı alınamadığı için (BL-404) deneme öteki kişilerle yapıldı.
- **Geri alma:** kolay (atık workspace; yerel veritabanı tek komutla yeniden kurulur).
- **Durum:** yapıldı; veri duruyor.

### KK-54 (2026-09-30) "Bu kayıt owner'ın mı" sunucudan gelir (EMP-001 C1; BL-421)
- **Karar:** `get_employee_detail_service` cevabına `is_workspace_owner` eklenir; çekmece owner'ı rol adından tanımayı bırakır.
- **Uygulamada etkisi:** Employees → owner'ın çekmecesi. Görünen fark yok. Bugün çekmece "Owner" rol adına bakıyor (`apps/web/src/employees/EmployeeDrawer.tsx:1120`, `:2337`, `:3116`; ölçüldü): rolün kilidi, kilidin ekran okuyucudaki nedeni ve owner'ın kendi acil durum kişisi alanı bu karşılaştırmaya bağlı. Örnek: Owner rolünün adı bir gün değişirse owner Mert kendi çekmecesinde acil durum kişisi alanını kaybederdi; C'den sonra kaybetmez.
- **Dayanak:** `CLAUDE.md` §9 (karar rol adına değil sunucunun cevabına bakar); BL-421.
- **Geri alma:** kolay (cevaba eklenen tek alan).
- **Durum:** main'de (`f9119e6f`, `1161a3af`; main CI 36735509711 yeşil; besleme #14'te ölçüldü: çekmecede `role_name === "Owner"` 0 satır; BL-421 kapandı).

### KK-55 (2026-09-30) Var olan workspace'lere de "Manager" işi eklenir (EMP-001 C1)
- **Karar:** S2 yalnız yeni kurulumu söylüyordu; C1 migration'ı var olan her workspace'in Management departmanına da "Manager" işini ekler. Silinirse geri gelmez.
- **Uygulamada etkisi:** Settings → Jobs → "All" görünümünde "Management" departmanının altında "Owner"ın yanında "Manager" çıkar; "Jobs" sekmesinde de listelenir (`apps/web/src/settings/JobsSettingsPage.tsx:513-515`; yerel Meyhouse dahil). Employees çekmecesi → Employment → Jobs listesinde Management grubunda seçilebilir olur. Örnek: owner Mert Settings → Jobs'u açar, Management altında bugün yalnız "Owner" var (`supabase/migrations/20260927160000_management_and_owner_are_kept.sql:49-52`; ölçüldü), C1'den sonra "Manager" da görünür; silerse bir daha kendiliğinden gelmez.
- **Dayanak:** S2 (Manager sıradan iştir); yeni ve eski workspace aynı görünsün. Canlı veri yok.
- **Geri alma:** orta (migration eklediği işi geri almaz; iş elle silinir).
- **Durum:** main'de (`362712f0`; var olan workspace'lere ekleme `supabase/migrations/20261002000000_manager_is_an_ordinary_job.sql:693-697`, yeni kurulum `:40-43`, silinince geri gelmez testi `supabase/tests/management_owner_job.test.sql:156`; alt ajan ölçtü). Yerelde "Manager" işi 0 → 299 (koordinatörün aktardığı). Canlıda gönderim bekliyor. Canlıda 2026-09-30: "Manager" işi 3/3 Management departmanında (koordinatör ölçtü, MCP salt okuma; besleme #16).

### KK-56 (2026-09-30) Employees listesindeki iş adının sırası: birincil, yoksa Owner işi, yoksa ilk iş (EMP-001 C1)
- **Karar:** listede kişinin yanında görünen iş adı: kayıtlı birincil iş; yoksa Owner işi; yoksa ilk iş. Eskisi ikinci adımda "ilk Management işi"ydi.
- **Uygulamada etkisi:** Employees → liste → kişinin satırındaki iş adı (`apps/web/src/employees/EmployeesPage.tsx:657`; iş yoksa "Unassigned"). Bugünkü sıra veritabanında: birincil → ilk Management işi → ilk iş (`supabase/migrations/20261001000000_a_manager_manages_where_they_are_assigned.sql:710-711`; ölçüldü). Örnek: birincil işi seçilmemiş, "Server" ve "Manager" işleri olan Ayşe bugün listede "Manager" görünür (Management işi öne geçiyor); C1'den sonra sıradaki ilk işi görünür. Owner Mert'in satırında "Owner" kalır.
- **Dayanak:** S2: Manager artık sıradan iş, öne geçmez; Owner işi birincil sayılmadığı için owner'ın satırı boş kalmasın.
- **Geri alma:** kolay.
- **Durum:** main'de (`362712f0`; sıra `supabase/migrations/20261002000000_manager_is_an_ordinary_job.sql:452-453`: birincil, yoksa Owner işi, yoksa ilk iş; alt ajan ölçtü).

### KK-57 (2026-09-30) Bu gece G18'den sonra yeni backlog grubu açılmıyor
- **Karar:** haftalık kullanım %82 (koordinatörün aktardığı); kalan pay EMP-001 C'ye ve QA düzeltmelerine.
- **Uygulamada etkisi:** yok. İkinci hat G18'le kapandı; yürüyen tek kod işi EMP-001 C.
- **Dayanak:** KK-51 (%90'da yeni iş başlatılmaz); sabaha kullanıcıya pay kalsın.
- **Geri alma:** gerekmez.
- **Durum:** geçerli.
- **Mert:** ters 2026-10-01 — KK-51 ile birlikte; kullanım yüzdesi yeni işi durdurmaz.

### KK-58 (2026-09-30) Oturum yenilemeleri: `nf-db`, `nf-gorsel-qa`, kayıt oturumu, koordinatör
- **Karar:** `nf-db` üçüncü oturum `local_8918dfd6-f929-4312-857e-58362641f3a4` (C1); `nf-gorsel-qa` yeni `local_2a24338f-ba49-4311-acbe-4f916b5ae06d`; kayıt oturumu `local_6fe24435-0391-4db7-bf3c-d448e03044da` (dördüncü; önceki `local_6c8429c0…` durdu) — koordinatörün aktardığı. Aynı gece koordinatör de devretti: yeni `local_c575161a-0a35-45af-ae96-d4e74880bc97`, önceki `local_2022ee49…` (`HANDOFF.md` `a98b0671`; ölçüldü).
- **Uygulamada etkisi:** yok (çalışma düzeni).
- **Dayanak:** bağlamı dolan oturum boş oturuma verilir, kart onayı beklenmez (bu dosyanın başı).
- **Geri alma:** gerekmez.
- **Durum:** yapıldı. Eski oturumların arşivi kullanıcıda (`ILERLEME-PLANI.md` §0c satır 20).

### KK-59 (2026-09-30) "Management'ın işleri" tek yardımcıdan okunur (EMP-001 C2)
- **Karar:** C2'de `managementJobIds` tek "Management'ın işleri" yardımcısı olarak kalır; `firstJobOutsideManagement` ve `nonManagementPrimaryJobId` silinir, yerlerine yalnız Owner'a bakan tek yardımcı gelir.
- **Uygulamada etkisi:** ekranda değişen yok. Schedule → "Job/Position" sıralaması, kurulum sihirbazının iş sayımı ve Employees çekmecesindeki iş gruplaması "hangi iş Management'ta" bilgisini tek yerden okur (koordinatörün aktardığı; kod dalda, ölçülmedi). Örnek: Management'a yeni bir iş eklenince üç ekran da onu aynı anda Management sayar; biri eski listeye bakıp ayrışmaz.
- **Dayanak:** `CLAUDE.md` §9 "ikiz sistem yok". `tasks/EMP-001.md` Done when 26'nın ikinci `grep`'i buna göre yeniden yazıldı.
- **Geri alma:** kolay.
- **Durum:** main'de (`1161a3af`, `a469905e`; `managementJobIds` `packages/shared/src/index.ts:899`, kullananlar `OwnerOnboardingPage.tsx:214` ve `scheduleEmployeeSort.ts:19`; silinen iki ad `apps packages`'ta 0; tek Owner yardımcısı `employee-create-flow.ts:34` — alt ajan ölçtü).

### KK-60 (2026-09-30) EMP-001 C'nin güvenlik incelemesi dört dilim birleşince tek turda
- **Karar:** `nf-guvenlik` incelemesi C1 bitince değil, C1 + C2 + C3 + C4 tek dalda birleşince yapılır (önceki koordinatörün düzeni sürüyor).
- **Uygulamada etkisi:** yok. "Manager" işi ve owner çekmecesi değişiklikleri kullanıcıya tek seferde, incelenmiş olarak gelir; o güne kadar Settings → Jobs'ta ve Employees çekmecesinde bugünkü hâl görünür.
- **Dayanak:** `DELEGASYON.md` §3 (R3: `nf-guvenlik` zorunlu; sınıf main'e girecek toplam değişikliğe göre) ve §6 (aynı diff'e iki inceleme yok).
- **Geri alma:** C1'e ayrı inceleme istemek.
- **Durum:** düzeltildi (besleme #14): inceleme dalın sonunda tek tur yerine iki turda yapıldı — birinci tur C1 + C2 bitince (ONAY @`661831da`), ikinci tur C3 + C4 farkı ve yeniden tabanlama için (ONAY @`62cfd10c`; `range-diff` 7/7 aynı). Uygulamada etkisi: ekranda yok; veritabanı kuralı C3 yazılmadan önce incelenmiş oldu. Rapor `.claude/worktrees/friendly-blackwell-4012e6/artifacts/nf-guvenlik/emp-001-c/RAPOR.md`.

### KK-61 (2026-09-30) Görsel QA bulgusu C3'e eklendi: kaydedilmemiş değişiklik varken "Terminate employee" kilitli görünür
- **Karar:** `nf-gorsel-qa`'nın B4 turundaki "düzeltilmeli" bulgusu (D1) ayrı maddeye bırakılmadı, C3'te düzeltildi.
- **Uygulamada etkisi:** Employees → kişi → çekmece → alt çubuk. Önce: rol ya da bir alan değiştirilip kaydedilmeden "Terminate employee" tıklanmıyordu ama kırmızı ve etkin görünüyordu. Şimdi: gri, kilit simgeli, imleç "yasak"; neden ("Save your changes before terminating the employee") ekran okuyucuya bağlı (`apps/web/src/employees/EmployeeDrawer.tsx:1331-1333`, `EmployeeLocationParts.tsx:64-71`; alt ajan ölçtü). Örnek: Mert Ayşe'nin rolünü değiştirir; Terminate artık basılamaz göründüğü için boşuna tıklamaz. BL-466 kapandı.
- **Dayanak:** `DELEGASYON.md` §3 (inceleme bulgusu main'den önce); aynı alt çubuk C3'ün elindeydi.
- **Geri alma:** kolay (`04a97650`'deki o parça).
- **Durum:** main'de (`04a97650`; görsel QA ONAY @`62cfd10c`).

### KK-62 (2026-09-30) Nedenle kilitlenen satırda ad da soluk
- **Karar:** Employees çekmecesinde bir nedenle kilitlenen kutucuğun adı da soluk yazılır; ortak görünüm kuralı olarak KARARLAR'a yazıldı.
- **Uygulamada etkisi:** Employees → çekmece → Employment. Önce: kilitli "Owner" kutucuğunda yalnız kutu griydi, ad normaldi ve tıklanabilir gibi duruyordu. Şimdi: Owner işinde ve owner'ın lokasyonlarında ad da soluk (`--theme-muted-strong`; kontrast 5,55:1 — koordinatörün aktardığı); "Remove" düğmeli lokasyon satırı değişmedi (`apps/web/src/employees/employee-location-parts.css:35-36`, `EmployeeDrawer.tsx:3023-3032`; alt ajan ölçtü).
- **Dayanak:** `CLAUDE.md` §9 (aynı işlev aynı görünüm; WCAG AA kontrast).
- **Geri alma:** kolay (tek CSS kuralı).
- **Durum:** main'de (`05c2625a`). İki kilitli görünümün birleşmesi açık: BL-483.

### KK-63 (2026-09-30) Owner'ın kaydında Locations başlığında "Required" etiketi gösterilmez
- **Karar:** owner'ın bütün lokasyon kutucukları kilitli olduğu için başlıktaki "Required" kalkar; başka herkeste durur.
- **Uygulamada etkisi:** Employees → owner'ın kaydı → çekmece → Employment → Locations: başlığın yanında "Required" yok (`apps/web/src/employees/EmployeeDrawer.tsx:2204-2205`; testler `EmployeeDrawer.test.tsx:1438`, `:1444`; alt ajan ölçtü). Jobs başlığında owner için hâlâ yazıyor (BL-482).
- **Dayanak:** seçilecek bir şey yokken "zorunlu" demek yanıltır.
- **Geri alma:** kolay.
- **Durum:** main'de (`05c2625a`).

### KK-64 (2026-09-30) `ScheduleRow`'un kullanılmayan `departments` bağlantısı silindi
- **Karar:** C3 sırasında bulunan ölü bağlantı aynı dalda silindi.
- **Uygulamada etkisi:** yok (teknik). `apps/web/src/schedule/components/ScheduleRow.tsx` içinde `departments` 0 eşleşme (alt ajan ölçtü).
- **Dayanak:** `CLAUDE.md` §9 (ölü kod kalmaz).
- **Geri alma:** gerekmez.
- **Durum:** main'de (`05c2625a`).

### KK-65 (2026-09-30) EMP-001 C'de main önce girdi; canlı veritabanına gönderim sabaha kaldı
- **Karar:** `20261002000000` migration'ı canlıya gönderilmeden kod main'e alındı (`nf-guvenlik` raporu §4: "bu iş için main önce girebilir").
- **Uygulamada etkisi:** canlı sitede değişen yok (site bu repodan yayın almıyor, BL-426). İki şart kayda geçti: **Ş1** — bu migration canlıya gönderilmeden Vercel bu repoya bağlanmaz; bağlanırsa canlıda her çalışan çekmecesi 500 verir. **Ş2** — canlı veritabanı main'in gerisinde; "canlı = main" kaydı (BL-405) geçici olarak doğru değil. Ölçüm: canlı dört migration geride (rapor "bir" diyor; önceki üçü de gönderilmedi).
- **Dayanak:** kullanıcı uyuyor; canlı gönderim yalnız kullanıcının (`CLAUDE.md` §8); canlı site eski repodan yayın aldığı için kırılan ekran yok.
- **Geri alma:** gerekmez; gönderim yapılınca kapanır.
- **Durum:** kapandı 2026-09-30: kullanıcı dört migration'ı canlıya gönderdi; canlı = main (kayıt oturumu ölçtü, Supabase MCP salt okuma). Ş1 ve Ş2 kalktı; birincil işi olmayan tek kayıt yalnız Owner işi olan bir owner (kurala uygun; koordinatör ölçtü). **Düzeltme 2026-09-30 (besleme #17): dayanak yanlıştı.** "Site bu repodan yayın almıyor" doğru değildi: bu repo Vercel `mert-2a14/newfork-clean-api`'den main'e her gönderimde üretime çıkıyor (BL-426 bayat). EMP-001 C main'e ~08:20'de girdi, canlı migration ~10:40'ta gönderildi; arada canlıda Employees çekmecesi açılmadı. KARARLAR OPS-03 geçerli ve gevşetilmez: kodu yeni bir veritabanı alanına ya da kuralına dayanan işte önce canlı migration, sonra main.
- **Mert:** ters 2026-09-30 — dayanak yanlıştı (site bu repodan yayın alıyor); OPS-03 geçerli: önce canlı migration, sonra main.

### KK-66 (2026-09-30) Migration'lı işte görsel QA main'den önce, `main.lock` penceresinde
- **Karar:** EMP-001 C'nin görsel QA'sı, migration ortak yerel veritabanına uygulandıktan sonra ve push'tan önce, aynı `main.lock` penceresinde yapıldı.
- **Uygulamada etkisi:** ekranı kimse görmeden main'e girmedi: `nf-gorsel-qa` ONAY @`62cfd10c` toplu dalda (`origin/task/batch-t11`), gerçek uygulamada verildi (rapordan; alt ajan okudu). Bulduğu bir "düzeltilmeli" (sihirbazda Continue'nun nedeni, BL-480) main'i tutmadı, kullanıcıya soruldu.
- **Dayanak:** `CLAUDE.md` §7 (branch'in migration'ı yerele yalnız main'e alınmadan hemen önce, `main.lock` ile aynı pencerede uygulanır); `DELEGASYON.md` §3 (R3'te ekran değiştiyse görsel QA).
- **Geri alma:** gerekmez.
- **Durum:** yapıldı.

### KK-67 (2026-09-30) G8a kapsamı A seçeneğiyle genişledi: arşivli lokasyon altı yerde canlı sayılmaz
- **Karar:** tek yüklem `app_private.location_is_live(...)`; altı yer onu kullanır: `scope_set`, `actor()`'ün owner/admin dalı ve `works`, `authz_check` hedef denetimi ve kişi `places`'i, `app_private.actor_actions`, `live_location_ids`; üstüne `locations` üzerinde CHECK kısıtı. Reddedilen B: yalnız görev dosyasındaki dört yer.
- **Uygulamada etkisi:** Mert Settings → Locations'ta "Moda"yı arşivleyince Moda müdürü Ayşe Moda'nın Schedule'ını, şablonlarını ve Employees yazmalarını açamaz; Moda onun lokasyon listesinden düşer (silinmiş lokasyondaki gibi). Kadıköy müdürü "Kadıköy + Moda" şablonunu görür. Arşivden çıkınca hepsi geri gelir. B seçilseydi Ayşe Moda'yı yönetmeye devam ederdi ve KK-13'ün (a) hücresi kırmızı kalırdı.
- **Dayanak:** KK-13 (arşivli lokasyon yazma ve kapsamda silinmiş gibi sayılır); `nf-db` tazeliği 2026-09-30 (`e56d1989`): `actor()`'ün müdür dalı artık `works`'e eşit ve atamalardan geliyor, arşive bakmıyor; `actor_actions` örnek lokasyonu ve `authz_check`'in kişi `places`'i süzgeçsiz.
- **Geri alma:** yeni migration ile (uygulanmış migration değişmez); main'e girmeden dal bırakılabilir.
- **Durum:** geçerli; G8a `nf-db`'de (`task/g8a`, taban `e56d1989`; kayıt anında dalda yeni commit yok).

### KK-68 (2026-09-30) G8a'da sıra: önce canlı veritabanı, sonra main
- **Karar:** G8a'nın migration'ı (`20261003000000_an_archived_location_counts_nowhere.sql`) kullanıcı tarafından canlıya main'den önce gönderildi, kod sonra main'e alındı (`3c07c15d`).
- **Uygulamada etkisi:** canlıda hiçbir ekran kırılmadı; main canlıya yayın aldığında veritabanı hazırdı. Sabahki EMP-001 C'deki ~2 saatlik kırılma (KK-65 düzeltmesi) tekrarlanmadı.
- **Dayanak:** KARARLAR OPS-03 (kodu yeni bir veritabanı alanına ya da kuralına dayanan işte önce canlı migration, sonra main); KK-65 düzeltmesi; BL-426 bayat (main zaten canlıya çıkıyor).
- **Geri alma:** gerekmez. Yedekler `newfork-wt/coord/artifacts/g8a/` (canlı `hosted-*.sql`, yerel `schema-before-20261003000000.sql`).
- **Durum:** yapıldı (koordinatörün aktardığı; migration dosyası main'de, ölçüldü).

### KK-69 (2026-10-01) BL-496'nın kod kısmı FB-6.3.5'e (`nf-backend`), veritabanı kısmı FB-6.3.7'ye (`nf-db`)
- **Karar:** BL-496'nın shared/web/API kısmı (`departmentSchema`, `jobSchema`, `scheduleReferenceSchema` bölünmesi, `index.test.ts`, `organization-data.ts:352,359`, 5 web kod dosyası, fikstürler, 3 API testi) FB-6.3.5'e girer, sahibi `nf-backend`; kod alanı okumayı bırakıp main'e girer. Veritabanı kısmı (iki okuma fonksiyonu, iki `create_*` kontrolü, iki CHECK, kolonlar, 3 pgTAP) FB-6.3.7'de `nf-db`'de kalır.
- **Uygulamada etkisi:** ekranda değişiklik yok (Settings → Jobs ve Schedule'da departman ve iş sırası A→Z kalır). Canlıda kolon silinmeden önce yayındaki web onu okumayı bırakmış olur; silme hiçbir ekranı kırmaz.
- **Dayanak:** `CLAUDE.md` §4 (shared, API ve web veri katmanı `nf-backend`'in); KARARLAR OPS-03 (alan silen işte önce main, sonra canlı); `CLAUDE.md` §13 (süreç kararı Claude'un); Mert'in 2026-10-01 kararı (BL-496 FB-6.3 `.7` silme penceresinde).
- **Geri alma:** ucuz — yalnız görev dosyasındaki adım ataması.
- **Durum:** `tasks/FB-6.3.md` `.5`, `.7` ve Envanter → BL-496'ya yazıldı (kayıt oturumu, koordinatörün isteğiyle; besleme #33).
- **Mert:** onaysız.

### KK-70 (2026-10-01) Manager'ı kalmayan lokasyon düşünce kalan bütün lokasyonlar onaylıysa izin talebi onaylanır
- **Karar:** Kalan bütün lokasyonlar onaylamışken karar verebilecek manager'ı kalmayan bir lokasyon düştüğünde bekleyen izin talebi onaylanmış sayılır. Süre işi (`time_off_sweep`) her turda `remaining = 0 and not fallback` olan bekleyen talebi `approved` olarak kesinleştirir; olayın işlemi yapanı boş (ekranda "System"), notu "All deciding locations approved".
- **Uygulamada etkisi:** Örnek: Ali Kadıköy ve Beşiktaş'a atanmış; Kadıköy müdürü Ayşe onaylar; Beşiktaş'ın tek müdürü Mehmet işten çıkarılır, Beşiktaş düşer. Kararsız dalda talep son karar anına kadar "Pending" kalıp "Not decided in time" diye reddedilirdi (`nf-guvenlik` O3); bu kararla en geç beş dakika içinde onaylanır ve olay listesinde "System" onayı görünür.
- **Dayanak:** KARARLAR "Ürün kuralları" → "İzin (time off)" → Onay (kullanıcı kararları 2026-09-30): "karar verebilecek manager'ı kalmayan lokasyon düşer" ve "çok lokasyonda her lokasyondan en az bir onay gerekir"; `CLAUDE.md` §13 (KARARLAR satırı durumu birebir kapsıyor).
- **Geri alma:** ucuz — `.3`+`.4` main'e ve canlıya girmeden `nf-db`'nin düzeltmesinde; sonrası yeni migration.
- **Durum:** `nf-db`'ye düzeltme olarak verildi (O1, O2, D1, D2 ile birlikte), ardından yeniden inceleme; `tasks/FB-6.3.md` Notes'a yazıldı (kayıt oturumu, koordinatörün isteğiyle; besleme #42). **Daraltıldı (kullanıcı kararı 2026-10-01, besleme #44):** belge gecikmesi gibi geçici kısıtta lokasyon düşmez, karar admin/owner'a gider; otomatik onay yalnız manager gerçekten kalmadıysa (KARARLAR "İzin"; `8d84f278`). Canlıda ve main'de 2026-10-01.
- **Mert:** onaysız (2026-10-01: senaryoyu sordu, örnekle anlatıldı; itiraz yok — koordinatörün aktardığı, besleme #43).

### KK-71 (2026-10-01) İzin işinin yayın notu `.5` ve `.6`'ya taşınır, ayrı backlog maddesi açılmaz
- **Karar:** FB-6.3 `.4`'te yapılmayan yayın notu (yayın penceresinde "bekleyen izin talebiyle çakışıyor" bilgisi) aynı işin eksiğidir: veri tarafı (yayın penceresinin okuması "bu haftada bekleyen izin talepleriyle çakışan vardiyalar") `.5`'te `nf-backend`, ekran metni `.6`'da `nf-arayuz`. Ayrı BL açılmaz. Veri için veritabanı okuması gerekirse `.5`'ten önce küçük bir `nf-db` eki olur; `nf-backend` sözleşmeyi okurken söyler.
- **Uygulamada etkisi:** Örnek: Ayşe Kadıköy'ün gelecek haftasını yayınlarken Ali'nin o haftaya düşen bekleyen izin talebi varsa yayın penceresi bunu bilgi notu olarak söyler. `.6` main'e girene kadar ekranda değişiklik yok.
- **Dayanak:** `tasks/FB-6.3.md` Kurallar ("Bekleyen izinle çakışan vardiya yayınlanırken yayın penceresi bilgi notu gösterir"), In scope ("yayın penceresinde bekleyen izin notu") ve `.4` satırı — yeni fikir değil, kapsamdaki işin eksiği; `CLAUDE.md` §13 (süreç kararı Claude'un).
- **Geri alma:** ucuz — yalnız görev dosyasındaki adım ataması.
- **Durum:** `tasks/FB-6.3.md` `.4`, `.5`, `.6` satırlarına ve Notes'a yazıldı (kayıt oturumu, koordinatörün isteğiyle; besleme #43).
- **Mert:** onaysız.

### KK-72 (2026-10-01) Geçici kısıtlı lokasyonda son 12 saat hatırlatması admin/owner'a gider; "No manager … is left" metni düzelir
- **Karar:** FB-6.3 üçüncü incelemesinin iki düşük bulgusu küçük bir ek migration'la kapanır (`20261003033000_…`, yalnız yeniden tanım; `nf-db`): (1) manager'ı geçici kısıtlı (`unattended`) lokasyonda son karar anından 12 saat önceki hatırlatma admin/owner'a gider (bugün hatırlatma yalnız onaylamamış lokasyonun oy verenlerine gidiyor, `20261003032000_time_off_deadlines_close_requests.sql`:311-321); (2) admin/owner bildirimindeki "No manager who may decide this request is left at its locations." metni belge gecikmesinde yanlış (aynı dosya `:305`) → "No manager can decide this now".
- **Uygulamada etkisi:** Örnek: Beşiktaş müdürü Mehmet'in belgesi gecikmiş; Ali'nin talebinin son karar anına 12 saat kala hatırlatma admin/owner'a da gider ve bildirim "Beşiktaş'ta manager kalmadı" demez. Canlıya gönderimi kullanıcı onayı ister; kullanıcı dönene kadar park.
- **Dayanak:** kullanıcının 2026-10-01 kuralı (KARARLAR "İzin" → "Belgesi gecikmiş manager": geçici kısıtta karar admin/owner'a gider) ve KARARLAR "Oylamanın ayrıntısı" (hatırlatma karar vermemiş lokasyonun karar verenlerine); `CLAUDE.md` §13.
- **Geri alma:** ucuz — yalnız yeniden tanım migration'ı.
- **Durum:** PARK — canlı gönderim kullanıcı onayı ister (kullanıcı yok kipi, 2026-10-01 ~10:30); `nf-db` `local_6b0b5907…`'e verildi (2026-10-01; dal `task/fb-6.3`, worktree `xenodochial-knuth-943563`, kayıt anında uç `47bb6c17`, yeni commit yok — ölçüldü); incelemeden sonra dalda park (besleme #45). Besleme #46: dalda bitti (`a54d9ee9`, `20261003033000_time_off_reminder_reaches_who_can_decide.sql` — ölçüldü), `nf-guvenlik` ONAY @`a54d9ee9` (besleme #47; `newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` §4); KK-75'in migration'ıyla tek paket halinde canlı onayı bekler. Kayıt oturumu yazdı (koordinatörün isteğiyle; besleme #44).
- **Mert:** onaysız.

### KK-73 (2026-10-01) FB-6.3.5'te eski izin uçları (API) kalır, `.7`'de silinir
- **Karar:** `tasks/FB-6.3.md` `.5` satırı "eski uçlar kalkar" diyordu; uçlar `.5`'te kalır, `.7`'deki silmelerle gider.
- **Neden:** main her gönderimde canlıya çıkıyor (KARARLAR OPS-03) ve bugünkü izin ekranları `.6` bitene kadar eski uçları kullanıyor; `.5`'te silmek canlı ekranı kırar.
- **Uygulamada etkisi:** `.5` main'e girdiğinde Requests → Time off ve Employee hub'ın izin bölümü bugünkü gibi çalışır (örnek: Ali yine aynı pencereden izin ister, Ayşe aynı listeden görür); yeni oylama ekranları `.6`'da gelir.
- **Dayanak:** HANDOFF `47bb6c17` §2 ("eski uçlar .7'ye kadar kalır"), KARARLAR OPS-03, `CLAUDE.md` §13 (süreç kararı).
- **Geri alma:** ucuz.
- **Durum:** yürürlükte; `tasks/FB-6.3.md` `.5` ve `.7` satırları düzeltildi (besleme #45). Kayıt oturumu yazdı (koordinatörün isteğiyle).
- **Mert:** onaysız.

### KK-74 (2026-10-01) FB-6.3.5 ayrı dalda (`task/fb-6.3.5`); `task/fb-6.3` `nf-db`'nin KK-72 ekine
- **Karar:** `.5` `nf-backend`'in kendi dalında yürür; `task/fb-6.3` dalı `nf-db`'nin KK-72 ek migration'ına kalır.
- **Neden:** iki rol aynı dalda ve aynı dosyada aynı anda çalışmaz (`CLAUDE.md` §3, §4). KK-69'daki "tek dal" notu `.1`–`.4` içindi; hepsi main'de (koordinatörün `git cherry` ölçümü).
- **Uygulamada etkisi:** ekranda değişen yok.
- **Dayanak:** `CLAUDE.md` §3, §4, §13 (süreç kararı).
- **Geri alma:** ucuz.
- **Durum:** yürürlükte; iki dal da `47bb6c17`'de açık (ölçüldü, besleme #45). Kayıt oturumu yazdı (koordinatörün isteğiyle).
- **Mert:** onaysız.

### KK-75 (2026-10-01) Yayın penceresinin "bekleyen izin" notu veritabanında üretilir (`time_off_pending`)
- **Karar:** KK-71'in yayın notu için yeni bulgu `time_off_pending` (soft, note; yayını engellemez) `preview_schedule_publication_service`'te üretilir; aynı kural web'de ikinci kez yazılmaz. Veritabanı kısmı yeni `nf-db` oturumunda (`local_a0051ad4…`, `20261003034000_…`), KK-72 ekiyle aynı park paketinde. `.5` bu bulgu boş gelecek şekilde main'e girer; shared şemaya enum değeri eklendi.
- **Neden:** `.5`'te `nf-backend` ölçtü: yayın önizlemesi bekleyen izin talebini bilmiyor, API okuması yetmez. İkiz sistem yasak (`CLAUDE.md` §9).
- **Uygulamada etkisi:** canlı onayından sonra Schedule → Publish penceresinde "Ali has time off waiting for a decision on Oct 3" gibi bir not çıkar; yayın yine yapılabilir. O zamana kadar ekranda değişiklik yok.
- **Dayanak:** KARARLAR "İzin" (bekleyen izin uyarıdır, engel değil), KK-71, `CLAUDE.md` §9 ve §13 (süreç kararı).
- **Geri alma:** ucuz — yalnız yeniden tanım migration'ı; canlıya çıkmadan önce dalda.
- **Durum:** yürürlükte; veritabanı kısmı PARK (canlı onayı kullanıcıda, §0c satır 39). Kayıt oturumu yazdı (koordinatörün isteğiyle; besleme #46).
- **Mert:** onaysız.
