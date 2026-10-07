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
- **Durum:** PARK — canlı gönderim kullanıcı onayı ister (kullanıcı yok kipi, 2026-10-01 ~10:30); `nf-db` `local_6b0b5907…`'e verildi (2026-10-01; dal `task/fb-6.3`, worktree `xenodochial-knuth-943563`, kayıt anında uç `47bb6c17`, yeni commit yok — ölçüldü); incelemeden sonra dalda park (besleme #45). Besleme #46: dalda bitti (`a54d9ee9`, `20261003033000_time_off_reminder_reaches_who_can_decide.sql` — ölçüldü), `nf-guvenlik` ONAY @`a54d9ee9` (besleme #47; `newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` §4); KK-75'in migration'ıyla tek paket halinde canlı onayı bekler. Besleme #50: park paketi KK-72 (`…033000…`) + KK-75 (`…034000…`) + KK-76 (`…035000…`), kullanıcı dönüşünde tek canlı onayı. Besleme #52: incelendi, ONAY, canlı onayı bekliyor — park paketi kapandı (`task/fb-6.3-pubnote` @`85745a04`; sıra ve md5'ler ILERLEME §0c satır 39). Kayıt oturumu yazdı (koordinatörün isteğiyle; besleme #44).
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
- **Durum:** yürürlükte; veritabanı kısmı PARK (canlı onayı kullanıcıda, §0c satır 39). Besleme #50: dalda bitti — `task/fb-6.3-pubnote` @`edafa6ec` (`1c43b6c6`, `20261003034000_publish_notes_time_off_waiting_for_a_decision.sql` — ölçüldü); `nf-guvenlik` ONAY KOŞULLU @`edafa6ec` (`newfork-wt/coord/artifacts/coord/fb-6.3/nf-guvenlik-reviews.md` §6 — ölçüldü). **Canlı sırası koşulu** (`nf-guvenlik` §6): shared `51579826` canlıda olmalı — **sağlandı** (Vercel Production `13b7c8cd` success 2026-10-01T11:33:52Z, GitHub deployments — ölçüldü, besleme #51); kalan: gönderim anında canlı md5 = yerel `ddd1b0f7…`, `ed23a481…`. İşin önündeki ek (yazarın): `weekly_publication_decisions` `overrideable=false` notu atlıyor, yoksa yayın çöküyordu. Düşük D1: atlama `tier='note'`'a daraltılıyor (`nf-db`, aynı dosya); D3 kayıt: `starts > now()` koşulunun testi yok. D1 kapandı (`56c1910e`: atlama yalnız `tier='note'`). Besleme #52: incelendi, ONAY, canlı onayı bekliyor — park paketi kapandı (`task/fb-6.3-pubnote` @`85745a04`; sıra ve md5'ler ILERLEME §0c satır 39). Kayıt oturumu yazdı (koordinatörün isteğiyle; besleme #46).
- **Mert:** onaysız.

### KK-76 (2026-10-01) Employee Hub okuması izin formuna saat dilimini ve izin karar süresini verir
- **Karar:** `.6`'nın lokasyonsuz izin formu çalışanın birincil lokasyon saat dilimini ve izin karar süresini bilmiyor (hub okumasında yok; ayar yalnız owner/admin'e açık). `get_employee_hub_service`'e `time_off_timezone` (talep gönderiminin kullandığı birincil dilim kuralıyla aynı, tek yardımcı) ve `settings.time_off_lead_hours` eklenir (`nf-db`, `…035000…`, park paketinde); shared'a opsiyonel alanlar (`nf-backend`, dal `task/fb-6.3.5b`). Ekran alanlar yokken geçici yolla çalışır (ilk lokasyonun dilimi, uyarı gönderimden sonra); alanlar gelince geçici yol silinir.
- **Neden:** kural tek yerde kalsın (ikiz yok, `CLAUDE.md` §9); çalışan karar süresi ayarını okuyamıyor.
- **Uygulamada etkisi:** Employee Hub → Request time off'ta Ali, karar süresinin içine düşen bir tarih seçince "acil durumda manager'ınla doğrudan konuş" uyarısını göndermeden önce görür; çok dilimli işletmede izin doğru dilimle kaydedilir.
- **Dayanak:** `tasks/FB-6.3.md` Kurallar 1 ve 16; `CLAUDE.md` §13 (teknik + kural kapsıyor).
- **Geri alma:** ucuz.
- **Durum:** yürürlükte; veritabanı kısmı dalda bitti (`c80a707e` + test `85745a04`, `20261003035000_employee_hub_gives_the_time_off_form.sql`; §7 ONAY @`56c1910e`), shared kısmı main'de (`bdd7b859`, FB-6.3.5b). Besleme #52: incelendi, ONAY, canlı onayı bekliyor — park paketi kapandı (`task/fb-6.3-pubnote` @`85745a04`; sıra ve md5'ler ILERLEME §0c satır 39). Kayıt oturumu yazdı (koordinatörün isteğiyle; besleme #50).
- **Mert:** onaysız.

### KK-77 (2026-10-01) Lokasyonu kalmamış izin talebinde onay penceresi bildirim cümlesi söylemez
- **Karar:** admin/owner'ın onay penceresi lokasyonu kalmamış izin talebinde yalnız "Takes effect now." der; "Managers at <ad>'s locations are notified." cümlesi yalnız lokasyonu olan talepte çıkar.
- **Neden:** lokasyonsuz talepte bildirim gidecek lokasyon müdürü yok; cümle çelişkili (`nf-gorsel-qa` FB-6.3.6 QA §5, görüntü `03b-approve-fallback-owner-desktop.png`).
- **Uygulamada etkisi:** Requests → Time off → lokasyonu olmayan Deniz'in talebinde owner Approve'a basınca pencerede bildirim cümlesi yok (kimseye bildirim gitmeyeceği için).
- **Dayanak:** `tasks/FB-6.3.md` Kural 6; ILKELER P21 (kısa, tek mesaj); `CLAUDE.md` §13.
- **Geri alma:** ucuz.
- **Durum:** yürürlükte; uygulama `.6b` düzeltme turunda (`task/fb-6.3.6b`, yeni `nf-arayuz` `local_d16ba31f-57a1-4ae7-ba0f-1b338015ede8`). Kayıt oturumu yazdı (besleme #56; koordinatörün aktardığı).
- **Mert:** onaysız.

### KK-78 (2026-10-01) BL-179'un kalan parçası (`time_off_event_released_assignments`) FB-6.3.7'ye alınmaz
- **Karar:** izin onayıyla serbest kalan vardiyaları okuyan `time_off_event_released_assignments`'in eski yetki yardımcısından (`schedule_actor_has_capability_service`) çekirdeğe taşınması FB-6.3.7'ye eklenmez; BL-179'da (GF) kalır, ayrı iş olarak sonra yapılır.
- **Neden:** fail-open değil (`CLAUDE.md` §9'un "o iş içinde kapatılır" şartı tutmuyor); bir yetki fonksiyonunu çekirdeğe taşımak R3 yüzeyi ekler; `.7` zaten büyük bir silme farkı ve bir düzeltme turunda; tek hat yalnız doğrudan ilgili küçük bulguyu ekler, bu ayrı bir yetki taşıma işi.
- **Uygulamada etkisi:** bugün görünür değişiklik yok. Requests ekranında izin onayıyla serbest kalan vardiyaların listesi eski yetki yardımcısıyla okunmaya devam eder; kim neyi görür değişmez. Örnek: Kadıköy müdürü Ayşe, Ali'nin onaylanan izniyle açılan Kadıköy vardiyalarını bugün nasıl görüyorsa öyle görür.
- **Dayanak:** `CLAUDE.md` §9; ILKELER P17; `DELEGASYON.md` §3.
- **Geri alma:** ucuz (madde sırası gelince ya da kullanıcı isterse iş açılır).
- **Durum:** yürürlükte. Kayıt oturumu yazdı (besleme #69; koordinatörün kararı). Ölçüldü: fonksiyonun tek tanımı `20260909019001_time_off_published_assignment_disposition.sql:165-172` (eski yardımcı `:172`), `.7` migration'ı onu `:905`'te çağırmaya devam ediyor (`task/fb-6.3.7-db2` @`f84e3667`).
- **Mert:** onaysız.

### KK-79 (2026-10-01) Hata notu: ölçülmemiş şart G14 mockup görevine kondu
- **Karar:** koordinatör "onaylı izin kırmızısı vardiya çakışma çizgisiyle karışmasın" şartını ölçmeden `nf-arayuz` `local_ea341890…`'ın mockup görevine koydu (kayıt oturumunun önceki mesajından aldı). Mert şartı düşürdü: çakışan vardiya yazılamaz. Bundan sonra başka oturumdan aktarılan tasarım şartı, göreve konmadan önce kodda ölçülür.
- **Neden:** kayıt kuralı `time_overlap` ayara bağlı değil, her zaman engel (`20261003040000_time_off_forgets_location_and_parts.sql:1342-1349`; yazar doğruladı, kayıt oturumu ölçtü). Var olmayan bir duruma göre tasarım istendi; varyant turu ve Mert'in zamanı harcandı.
- **Uygulamada etkisi:** görünür değişiklik yok. Mockup'tan demo çakışma çizgisi çıkarıldı (`c9a46d08`, `task/g14-availability-mockup`). Çizginin kendisinin gerekip gerekmediği BL-522.
- **Dayanak:** ILKELER D tablosu ("ortamı ve kodu ölçmeden soru kurmak"), P23 (bugün oluşamayan durum kodlanmaz).
- **Geri alma:** gerekmez (hata kaydı).
- **Durum:** yürürlükte. Kayıt oturumu yazdı (besleme #80; koordinatörün isteği).
- **Mert:** bilgi (şartı kendisi düşürdü).

### KK-80 (2026-10-01) BL-204 yeniden açılır; müdür notu metni main'e girince yeniden kapanır
- **Karar:** (b) BL-204 (Schedule hücresindeki müsaitlik uyarısı) yeniden açılır. Kalan tek parça: müdür notu metni Schedule müsaitlik ipucunda (G14; `nf-db` `local_4ba671c6…`, dal `task/g14-manager-note` var, worktree `newfork-wt/g14-note`, main'in önünde commit yok — ölçüldü 2026-10-01 ~22:26Z). O parça main'e girince BL-204 yeniden kapanır.
- **Neden:** önceki koordinatörün açık talimatı ("müdür notu G14'ün parçası, BL-204 kapalı görünmesin"); kayıt gerçeği söylemeli. BL-204 besleme #85'te kapanmıştı (G14 dilim c, `144e8a18`), müdür notu metni besleme #86'da aynı işe eklendi ve henüz main'de değil.
- **Reddedilen:** (a) BL-204 kapalı kalsın, alt parça yalnız G14'te izlensin.
- **Uygulamada etkisi:** görünür değişiklik yok. Backlog'da BL-204 yeniden açık (açık madde 288 → 289); Schedule'daki müsaitlik ipucuna müdür notu metni gelince kapanır. Örnek: müdür Ayşe, Jordan Lee'nin pazartesisine "okul çıkışı" notunu yazdı; bugün ipucu yalnız "Manager note (only managers see this)" diyor, iş bitince notun kendisini gösterecek.
- **Dayanak:** CLAUDE.md §13 (süreç ve kayıt kararı); ILKELER P11 (kayıt gerçeği söylesin).
- **Geri alma:** kolay — madde yeniden kapatılır.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725-b572-4ac9-9d12-8505df3e7816` yazdı (besleme #88 eki; koordinatör `local_b355d250…`'ın isteği).
- **Mert:** bilgi.

### KK-81 (2026-10-01) BL-088 FB-6.5'e değil FB-6.4'e alınır
- **Karar:** BL-088 (müsaitlik modu dönüşümü bekleyen pickup/swap isteklerini işaretlemiyor) FB-6.4 Takas / Shift Hub dilimine taşınır. KK-10'un (a) kararı (dönüşüm bekleyen istekleri işaretler) geçerli; "kime / nerede gösterilir" ayrıntısı FB-6.4'te Mert'e teyit edilir.
- **Neden:** bekleyen istekler FB-6.4'te `app_private.eligibility()` takas motoruyla yeniden yazılıyor; işaret orada bir kez tasarlanır. FB-6.5'te yazılsaydı FB-6.4'te yeniden yazılacaktı.
- **Reddedilen:** BL-088 FB-6.5 içinde.
- **Uygulamada etkisi:** bugün görünür değişiklik yok. Workspace müsaitlik modunu değiştirdiğinde (Settings → Scheduling → Availability) çevrilen hafta bekleyen bir istekle çakışırsa işaret FB-6.4'te gelecek. Örnek: Ali'nin perşembe akşamı pickup isteği bekliyor; mod "shift type"tan "time range"e geçince perşembesi değişir, bugün kimse uyarılmaz.
- **Dayanak:** FOUNDATION-B FB-6.4'ün takas motoru kapsamı; ILKELER P17 (aynı işle ilgili bulgu aynı işte).
- **Geri alma:** kolay — madde FB-6.5'e geri yazılır.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (besleme #89; koordinatör `local_b355d250…`'ın isteği).
- **Mert:** bilgi (FB-6.4'te teyit sorusu gelecek).

### KK-82 (2026-10-01) Schedule balonunda müdür notu en çok 4 satır; tam metin Employees → Availability'de
- **Karar:** uzun müdür notu Schedule balonunda en çok 4 satır gösterilir, sonu "…"; ekran okuyucu tam metni okur; tam metin Employees → kişi → Availability'de. Bilerek kabul edilen sonuç: 180 karakterlik normal bir cümle de 4. satırda kesilir.
- **Neden:** `nf-gorsel-qa` uzun notun balondan taştığını buldu (DEĞİŞİKLİK @`6c7bb938`); düzeltme `db28e732`.
- **Uygulamada etkisi:** Örnek: müdür Ayşe Jordan'ın pazartesisine uzun bir not yazdı; Schedule balonunda ilk 4 satırı ve "…" görünür, tamamı Employees → Jordan → Availability'de okunur.
- **Dayanak:** uygulamadaki `overflow-wrap: anywhere` kalıbı; `nf-gorsel-qa` önerisi.
- **Geri alma:** kolay — satır sınırı CSS'te.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (besleme #90; koordinatör `local_b355d250…`'ın isteği).
- **Mert:** bilgi.

### KK-83 (2026-10-01) FB-6.5'te shared `confirm_clear` alanı da silindi (Touches genişledi)
- **Karar:** haftalık kayıt şemasındaki ölü `confirm_clear` alanı (`packages/shared`) aynı işte silindi (`58a1023c`); görev dosyasının Touches'ında yoktu.
- **Neden:** sunucudaki `confirm_clear` dalı silinince shared alan ölü yol olarak kalacaktı.
- **Uygulamada etkisi:** görünür değişiklik yok; API haftalık kayıtta bu alanı artık kabul etmiyor.
- **Dayanak:** CLAUDE.md §9 (ikiz sistem yok, ölü yol kalmaz).
- **Geri alma:** kolay — tek alan.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (besleme #90; koordinatör `local_b355d250…`'ın isteği).
- **Mert:** bilgi.

### KK-84 (2026-10-01) Müdür Team availability listesinde kendi satırını görür
- **Karar:** müdür Team availability listesinde kendi satırını görür (bugünkü davranış); `weekly_team_availability.test.sql` buna kilitlendi.
- **Neden:** görev dosyası bunu "doğrulanacak" diye bırakmıştı (`KARARLAR.md:67` açıkça söylemiyor); bugünkü davranış M2 kapsam modeliyle uyumlu: müdür kendi çalıştığı lokasyonun listesinde.
- **Uygulamada etkisi:** görünür değişiklik yok. Örnek: Kadıköy müdürü Ayşe Team availability'de Can, owner ve admin'lerle birlikte kendi satırını da görür.
- **Dayanak:** KARARLAR M2 (kapsam modeli); bugünkü davranış.
- **Geri alma:** kolay — test ve okuma süzgeci.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (besleme #90; koordinatör `local_b355d250…`'ın isteği).
- **Mert:** bilgi (ürün kuralı M2'nin birebir uygulaması; kapsamıyorsa söyleyebilir).

### KK-85 (2026-10-01) `weekly_team_availability` hücre 23 silindi (kurulamaz durum)
- **Karar:** testin 23. hücresi silindi; ürün içinden kurulabilen bir duruma çevrilmedi.
- **Neden:** hücre ürünün oluşturamadığı bir durumu kuruyordu; kurulamaz durum için test yazılmaz.
- **Uygulamada etkisi:** görünür değişiklik yok.
- **Dayanak:** CLAUDE.md §9 "eski veri korunmaz"; ILKELER P23 (bugün oluşamayan durum kodlanmaz).
- **Geri alma:** kolay — hücre geri yazılabilir.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (besleme #90; koordinatör `local_b355d250…`'ın isteği).
- **Mert:** bilgi.

### KK-86 (2026-10-02) Duyuru ve önemli tarihte arşivli lokasyon kapsamda sayılmaz
- **Karar:** K1 ve K6'da "çok lokasyonlu" ve "atanmadığı lokasyon" sayılırken arşivli lokasyon hesaba katılmaz.
- **Neden:** KARARLAR Q-C (silinmiş / arşivli lokasyon hiçbir yerde sayılmaz) bu alana da uyar; ayrı kural gerekmez.
- **Uygulamada etkisi:** bugün görünür değişiklik yok. Örnek: owner'ın "Kadıköy + Moda" tarihinde Moda arşivlenirse kayıt tek lokasyonlu (Kadıköy) sayılır; Kadıköy müdürü Ayşe görür.
- **Dayanak:** KARARLAR Q-C (2026-09-26), `20261003000000_an_archived_location_counts_nowhere.sql`.
- **Geri alma:** kolay — kural FB-6.7'de yazılırken değiştirilebilir.
- **Durum:** yürürlükte (uygulama FB-6.7'de). Kayıt oturumu `local_43ff0725…` yazdı (besleme #92; koordinatör `local_abc4d126…`'ın isteği).
- **Mert:** bilgi.

### KK-87 (2026-10-02) Duyuru ve önemli tarihte rütbe, yazarın bugünkü rolüdür
- **Karar:** K2'deki rütbe karşılaştırmasında kaydı açan kişinin açtığı günkü değil, bugünkü rolü sayılır.
- **Neden:** ayrıcalık bugünkü rolden gelir; rolü düşen kişinin eski kayıtları üst rütbe koruması taşımaz.
- **Uygulamada etkisi:** bugün görünür değişiklik yok. Örnek: Hande admin iken bir tarih açtı, sonra müdüre indirildi; o tarihi artık öteki müdürler düzenleyebilir.
- **Dayanak:** ILKELER P08.
- **Geri alma:** kolay — FB-6.7'de yazılırken değiştirilebilir.
- **Durum:** yürürlükte (uygulama FB-6.7'de). Kayıt oturumu `local_43ff0725…` yazdı (besleme #92; koordinatör `local_abc4d126…`'ın isteği).
- **Mert:** bilgi.

### KK-88 (2026-10-02) FB-6.7 puanı kapsam büyümesiyle yeniden hesaplandı
- **Karar:** FB-6.7'nin puanı 5'ten 10'a çıktı (kişi-hafta orta noktası × 8: eski 0,5–0,75 → 5, yeni 1–1,5 → 10). Aşama 6–7 toplamı 230 → 235, program toplamı 308 → 313.
- **Neden:** Mert 2026-10-02 kapsamı onayladı ("FB-6.7'ye katsın"); K1–K6 ve ekran parçası eklenince iş yaklaşık iki katına çıktı. Doğru veri eski sayıdan önce gelir.
- **Uygulamada etkisi:** görünür değişiklik yok. İlerleme yüzdesi düştü: Aşama 6–7 %69,1 (159 / 230) → %67,7 (159 / 235); program %76,9 → %75,7. Biten iş azalmadı, kalan iş büyüdü.
- **Dayanak:** ILKELER P11 (kayıt gerçeği söylesin); ILERLEME "Büyüklük ölçütü (puan)".
- **Geri alma:** kolay — puan ILERLEME §3'te.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (koordinatör `local_abc4d126…`'ın isteği, #92 eki cevabı).
- **Mert:** bilgi.
- **Ek (2026-10-02, besleme #96 sonrası):** puan 10'da kalır — BL-531 kodsuz kapandı ama BL-530 (kapanışlar → "Closed day") ve BL-532 kapsama girdi; net iş 1–1,5 kişi-hafta tahminini aşmadı (koordinatörün kararı).

### KK-89 (2026-10-02) Yazar kendi duyurusunun ve önemli tarihinin bildirimini almaz
- **Karar:** K5'teki "o lokasyonun müdürleri, owner ve admin'ler her kaydı alır" kuralı kaydı yazan kişiyi kapsamaz; yazar kendi kaydının bildirimini almaz.
- **Neden:** yazar kaydı zaten görür; kendi yaptığı iş için bildirim gürültüdür. Bugün yayınlayan kendi bildirimini alıyor (`docs/plan/research/FB-6.7-olcumler-2026-10-01.md` §1 ek bulgular).
- **Uygulamada etkisi:** FB-6.7'de uygulanacak. Örnek: owner Zeynep Kadıköy'e duyuru yayınlar; Kadıköy müdürü Ali ve admin'ler bildirim alır, Zeynep almaz.
- **Dayanak:** ILKELER anti-hedef "Bildirim gürültüsü"; P07 ("bildirim işi doğrudan etkilenene").
- **Geri alma:** kolay — FB-6.7 alıcı sorgusunda.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725…` yazdı (koordinatör `local_abc4d126…`'ın isteği, #92 eki cevabı).
- **Mert:** bilgi.

### KK-90 (2026-10-02) Kayıt oturumu devri, Mert yeni boş oturum açınca yapılır
- **Karar:** on dördüncü kayıt oturumu (`local_43ff0725-b572-4ac9-9d12-8505df3e7816`) bağlamı ~%50'ye gelince devri önerdi; havuzda boş oturum yok ve Mert PC başında değil (telefondan yeni oturum açılamıyor). Devir, Mert yeni boş oturum açınca yapılır; o zamana kadar kayıt oturumu beslemeleri almaya devam eder. Bağlam %70'i geçerse yeni beslemeyi almadan önce koordinatöre yazar, ILERLEME §0d(d)'ye devir notunu yazar ve beklemeye geçer. Devir notunun taslağı şimdiden §0d(d)'de tutulur ve her beslemede güncellenir.
- **Neden:** devir için boş oturum gerekiyor ve yalnız Mert açabiliyor; kayıtlar beklememeli. %70 sınırı kalite düşmeden önceki son güvenli nokta.
- **Uygulamada etkisi:** görünür değişiklik yok.
- **Dayanak:** CLAUDE.md §11.10 (yarıyı geçince bir sonraki sınırda devir önerilir); KARARLAR OPS-04.
- **Geri alma:** gerekmez.
- **Durum:** yürürlükte. Kayıt oturumu yazdı (koordinatör `local_abc4d126…`'ın isteği, #94 sonrası).
- **Mert:** bilgi (yeni boş oturum açması gerekiyor).

### KK-91 (2026-10-02) FB-6.7 A işçisinin teknik kararları
- **Karar:** FB-6.7 A işçisi (`local_10a5177a…`) şu teknik kararları verdi (ILKELER P19, saf teknik iç karar): (a) K1 çekirdekte `*.write_wide` eylemiyle (org / write); tek lokasyonlu kayıt `place` kapsamıyla. (b) K2 çekirdek bayrağı `outranked_no`; üyeliği olmayan yazar "kimse" sayılır (rütbesi yok). (c) K4'te içerik alanları — duyuru: başlık, metin, kategori, link; önemli tarih: başlık, tür, başlangıç, bitiş, tekrar, not, "affects scheduling"; yayın ve bitiş saati içerik değildir. (d) Owner'ın taslağı müdüre görünmez (`authz.out_of_scope`). (e) Kayıttaki arşivli lokasyon düzenlemede kalabilir, yeni kayda eklenemez. (f) BL-530'da vardiya türüne özel kapanış düştü; workspace geneli "Closed day" bütün canlı lokasyonları kapatır. (g) BL-532'nin alıcı ölçüsü `employee.invite` izni.
- **Neden:** çekirdeğin mevcut eylem / kapsam dilini kullanmak (ikinci bir kural dili yazmamak); K2 ve K4'ün sınırını ölçülebilir kılmak; BL-530'daki tek kaynağa geçişte kullanılmayan ayrıntıyı taşımamak.
- **Uygulamada etkisi:** (f) görünür: workspace geneli kapalı gün her lokasyonun Schedule'ında o günü kapatır; vardiya türüne göre kısmi kapanış artık yok. Örnek: owner 25 Aralık'ı workspace geneli "Closed day" yapar; Kadıköy ve Erenköy'de o güne vardiya yazımı `closed_location` ayarının şiddetiyle uyarı / onay / engel verir. (d) Ayşe owner'ın henüz yayınlanmamış taslağını görmez. Diğerleri görünür değişiklik getirmez.
- **Dayanak:** ILKELER P19; KARARLAR K1, K2, K4; CLAUDE.md §9 (ikiz sistem yok).
- **Geri alma:** dal main'e girmeden önce kolay; sonra yeni migration.
- **Durum:** dalda (`task/fb-6.7` @`93d3eb1c`), `nf-guvenlik` incelemesinde. Kayıt oturumu `local_43ff0725…` yazdı (besleme #96; koordinatör `local_abc4d126…`'ın isteği).
- **Mert:** bilgi ((f) Schedule sonucu işçi penceresinde teyit ediliyordu).

### KK-92 (2026-10-02) FB-6.7 A düzeltme turunda beş kenar durum kararı
- **Karar:** (a) `publish_at`'i boşaltılan zamanlanmış duyuru taslağa (draft) döner (ILKELER P10). (b) Önemli tarih geçmişinde, okuyanın göremeyeceği bir lokasyonu taşıyan eski sürümler maskelenir (KARARLAR K6). (c) Duyuruda `expected_revision` zorunlu olur, önemli tarihe de `expected_revision` eklenir — eşzamanlı düzenlemede sonraki kayıt öncekini sessizce ezmez (P11). (d) Yıllık kapalı gün 29 Şubat ise artık yıl olmayan yılda 28 Şubat sayılır; Schedule görünümü ve gün şeridi aynı kuralı kullanır (P23). (e) Saati geçmiş zamanlanmış duyuru yayınlanmaz, Unpublished olur, bildirim gitmez (P25).
- **Neden:** `nf-guvenlik` ve bağımsız doğruluk incelemesinin (uç `93d3eb1c`) orta ve düşük bulgularının ürünü bozmadan kapanması: takılı kalan duyuru, geçmişten lokasyon sızıntısı, kaybolan düzenleme, 29 Şubat boşluğu, geç kalmış yayının habersiz gitmesi.
- **Uygulamada etkisi:** (a) Zeynep zamanlanmış duyurunun saatini silerse duyuru Drafts'a döner, kimseye gitmez. (b) Kadıköy müdürü Ayşe önemli tarihin History'sinde eskiden yalnız Erenköy'e ait olan sürümü maskeli görür. (c) Ayşe ile Hande aynı duyuruyu aynı anda düzenlerse ikinci kayıt "kayıt değişti, yenileyin" uyarısı alır. (d) 29 Şubat'a konan yıllık "Closed day" 2027'de 28 Şubat'ı kapatır. (e) Sistem kapalıyken saati geçen duyuru sonradan sessizce gönderilmez, Unpublished'ta bekler.
- **Dayanak:** ILKELER P10, P11, P23, P25; KARARLAR K6.
- **Geri alma:** dal main'e girmeden önce kolay.
- **Durum:** işçinin 13 maddelik düzeltme listesinde (`task/fb-6.7`). Kayıt oturumu `local_43ff0725…` yazdı (besleme #97; koordinatörün isteği).
- **Mert:** bilgi.

### KK-93 (2026-10-02) FB-6.7 A düzeltme turunun 15–17. maddeleri: kapalı gün ve önemli tarihte geçmiş ile bildirim
- **Karar:** (15) kapalı gün görünümü (`schedule_closures` view) yalnız düzenlenebilir haftadan itibaren kapanış üretir; geçmiş, kilitli hafta geriye dönük değişmez. (16) Bitişi bugünden önce olan önemli tarih bildirim üretmez. (17) Yıllık önemli tarihin bildirim bağlantısı bugünden sonraki ilk tekrara gider.
- **Neden:** (15) geçmiş hafta kilitlidir (P09; main'de de geçmişte uyarı yok); (16) geçmiş bir tarih için bildirim kimsenin işine yaramaz (anti-hedef "bildirim gürültüsü"); (17) kişi tıkladığında geçen yılın değil önündeki günün kaydını görmeli.
- **Uygulamada etkisi:** (15) geçen ayın bir gününe sonradan "Closed day" konsa da o haftanın Schedule'ında uyarı çıkmaz. (16) owner geçen haftaya ait bir tarihi düzeltirse kimseye bildirim gitmez. (17) "Christmas — Closed day" bildirimine tıklayan çalışan bu yılın 25 Aralık'ını görür.
- **Dayanak:** ILKELER P09; anti-hedef "Bildirim gürültüsü"; KARARLAR K11, Ekran kararları → Schedule "Geçmiş hafta kilidi".
- **Geri alma:** dal main'e girmeden önce kolay.
- **Durum:** işçinin düzeltme listesinde (madde 15–17, `task/fb-6.7`). Kayıt oturumu `local_43ff0725…` yazdı (besleme #98; koordinatörün isteği).
- **Mert:** bilgi.

### KK-94 (2026-10-02) FB-6.7 puanı C parçasıyla 10 → 16
- **Karar:** FB-6.7'nin C parçası (K11–K18: geçmiş önemli tarih kilidi, süresi dolan duyuru, kapalı günün vardiyalara etkisi, üç dereceli "Closed location" ayarı, ekran varyantları) ≈ 0,75 kişi-hafta; aynı ölçekle (kişi-hafta orta noktası × 8) +6, FB-6.7 = 16. Aşama 6–7 toplamı 235 → 241, program 313 → 319.
- **Neden:** C kapsamı Mert 2026-10-02 kararlarıyla geldi; doğru veri eski sayıdan önce gelir.
- **Uygulamada etkisi:** görünür değişiklik yok. İlerleme yüzdesi düştü: Aşama 6–7 %67,7 (159 / 235) → %66,0 (159 / 241); program %75,7 → %74,3. Biten iş azalmadı, kalan iş büyüdü.
- **Dayanak:** ILKELER P11; ILERLEME "Büyüklük ölçütü (puan)"; KK-88.
- **Geri alma:** kolay — puan ILERLEME §3'te.
- **Durum:** yürürlükte. Kayıt oturumu `local_43ff0725-b572-4ac9-9d12-8505df3e7816` yazdı (koordinatör `local_abc4d126…`'ın isteği, #98 sonrası).
- **Mert:** bilgi.

### KK-95 (2026-10-02) Yazarı bilinmeyen duyuru / önemli tarih yalnız admin ve owner'a açık
- **Karar:** `created_by` boş kayıt (yazar bilgisi yok) müdür tarafından düzenlenemez; yalnız admin ve owner değiştirir.
- **Neden:** FB-6.7 A düzeltme turu 2'de `nf-db` alt ajanı, yazarı bilinmeyen kaydın müdüre açık olduğunu buldu — CLAUDE.md §9 fail-open yasağı. K2 ekinin "yazar bilgisi eksikse izin verilmez" cümlesinin uygulaması.
- **Uygulamada etkisi:** bugün görünür değişiklik yok. Örnek: yazarı bilinmeyen bir "Inventory day" tarihini Kadıköy müdürü Ayşe düzenleyemez, owner Zeynep düzenler.
- **Dayanak:** CLAUDE.md §9; KARARLAR K2 eki ve Ek 2.
- **Geri alma:** kolay — yetki kuralı dalda (`task/fb-6.7-fix` @`9b549792`).
- **Durum:** yürürlükte (dalda). Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #100).
- **Mert:** bilgi.

### KK-96 (2026-10-02) FB-6.7 A gönderiminde canlı API'nin kısa süre 500 vermesi kabul
- **Karar:** OPS-03 penceresinde FB-6.7 A'nın migration 1'i canlıya gidip main henüz yayınlanmamışken eski API'nin duyuru listesi 500 döner; bu kabul edilir. Migration 1 ve main arka arkaya gönderilir.
- **Neden:** canlı kullanıcı yok (ILKELER P01); geriye uyumlu ara katman yazmak tören olur.
- **Uygulamada etkisi:** gönderim sırasında birkaç dakika Announcements listesi açılmaz; main yayına girince düzelir. Örnek: o dakikalarda owner Zeynep Announcements'ı açarsa hata görür.
- **Dayanak:** ILKELER P01; KARARLAR OPS-03.
- **Geri alma:** gerekmez (geçici pencere).
- **Durum:** yürürlükte. Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #101).
- **Mert:** bilgi.

### KK-97 (2026-10-02) Geçmiş kapalı günler FB-6.7 C'de kalıcı görünür
- **Karar:** FB-6.7 A'nın kapanış görünümü "bu haftadan itibaren" okur; hafta dönünce geçen haftanın kapalı günü görünümden kalkar (kayan pencere). A böyle main'e girer; C'de K11 kilidiyle birlikte geçmiş kapalı günler kalıcı gösterilir (FB-6.7 C In scope ve Done when 7).
- **Neden:** geçmiş veri sessizce kaybolmamalı (P09); geçmiş önemli tarih zaten K11 ile kilitli.
- **Uygulamada etkisi:** C'ye kadar müdür geçen haftaya dönünce kapalı günü Schedule'da göremez. Örnek: Kadıköy 28 Eylül'de kapalıydı; 5 Ekim'den sonra o hafta Schedule'da kapalı görünmez — C'den sonra görünür.
- **Dayanak:** KARARLAR K11; ILKELER P09.
- **Geri alma:** kolay — kapsam C'de.
- **Durum:** yürürlükte. Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #101).
- **Mert:** bilgi.

### KK-98 (2026-10-02) Yayınlanamayan zamanlanmış duyuru görünür olur (FB-6.7 C)
- **Karar:** otomatik yayında hata alan zamanlanmış duyuru hata metniyle kaydedilir ve listede "yayınlanamadı" durumunda görünür (FB-6.7 C In scope ve Done when 8).
- **Neden:** bugün sessizce Scheduled kalıyor; sessiz düşen veri kullanıcıya söylenir (P09).
- **Uygulamada etkisi:** C'den sonra yazar ve müdür, saatinde çıkmayan duyuruyu listede görür. Örnek: Zeynep'in 09:00'a kurduğu duyuru hata alırsa listede "yayınlanamadı" yazar.
- **Dayanak:** ILKELER P09.
- **Geri alma:** kolay — kapsam C'de.
- **Durum:** yürürlükte. Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #101).
- **Mert:** bilgi.

### KK-99 (2026-10-02) Önemli tarih geçmişini owner ve admin tamamen görür
- **Karar:** önemli tarihin değişiklik geçmişinde owner ve admin bütün sürümleri aktör ve zamanıyla görür; lokasyonunu göremeyen kişiye o sürüm gizli satır olarak gelir (aktör ve zaman maskeli).
- **Neden:** admin bütün lokasyonları görür (KARARLAR:60, "Admin: bütün lokasyonlar ve çalışanlar"); geçmiş sessizce eksik gösterilmez (P09). FB-6.7 A ek fark incelemesinin 25. maddesi.
- **Uygulamada etkisi:** B'deki History görünümünde owner Zeynep "Inventory day" tarihinin Moda'ya ait eski sürümünü de görür; Moda'dan ayrılmış eski müdür görmez.
- **Dayanak:** KARARLAR:60 (admin kapsamı); ILKELER P09.
- **Geri alma:** kolay — okuma kuralı tek yerde (main `56618b03`).
- **Durum:** yürürlükte (main'de). Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #102).
- **Mert:** bilgi.

### KK-100 (2026-10-02) Yeni e2e testi main'e gitmeden yerelde koşulur (koordinatörün hatası)
- **Karar:** yeni ya da değişen bir e2e senaryosu main'e gönderilmeden önce yerelde (`db.lock` ile) en az bir kez koşulur; işçi raporu "ilk koşuda düzeltme gerekebilir" diyorsa bu koşu atlanmaz.
- **Neden:** FB-6.7 A'da akış 7 e2e'si yerelde hiç koşmadan main'e gitti; main CI 36991471128 yalnız o testte kırmızı oldu (test, açık çekmecenin arkasındaki düğmeye basıyordu; ürün doğruydu). İşçi raporu bunu önceden söylemişti. Koordinatörün hatası, kendisi yazdı.
- **Uygulamada etkisi:** görünür değişiklik yok; main'in kırmızı kalması ve ikinci CI koşusunun bilgisayara bindirdiği yük önlenir. Örnek: FB-6.7 C'nin e2e'si yerelde geçmeden main'e alınmaz.
- **Dayanak:** CLAUDE.md §6 (tam kapı: etkilenen e2e senaryoları) ve §11.5.
- **Geri alma:** gerekmez (süreç kuralı).
- **Durum:** yürürlükte. Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #103).
- **Mert:** bilgi.

### KK-101 (2026-10-02) Gece tam otomasyon: kararlar KK'ye beş soruyla yazılır
- **Karar:** Mert gece için koordinatöre tam otomasyon verdi (kullanıcı kararı 2026-10-02, koordinatörün penceresi). Gece verilen her karar KK'ye ne / nerede / nasıl / ne zaman / ne için ve uygulamada etkisiyle yazılır; sabah Mert'e liste olarak gösterilir.
- **Neden:** iş geceleyin durmadan sürsün; Mert sabah ne değiştiğini tek yerden okusun.
- **Uygulamada etkisi:** gece FB-6.7 C (veri) ve B + C (ekran varyantları) iki işçide yürür; ekran seçimi yine Mert'te (varyantlar sabah gösterilir, ILKELER P04). Örnek: kapalı gün penceresinin üç varyantı gece hazırlanır, hangisinin kalacağını Mert seçer.
- **Dayanak:** Mert'in açık kararı (2026-10-02 gece); ILKELER P15, P04; CLAUDE.md §13.
- **Geri alma:** Mert'in sözüyle biter.
- **Durum:** yürürlükte (gece). Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #103).
- **Mert:** kendi kararı.

### KK-102 (2026-10-02) Sürekli yetki için izin listesine dokunulmadı
- **Karar:** CLAUDE.md §8'e "Sürekli yetki" yazıldı (main `636b76ee`); `.claude/settings.json`'daki engel (deny) listesi gevşetilmedi.
- **Neden:** engel listesi otomasyonu durdurmuyor: canlı migration Supabase MCP ile, Vercel yayını main'den kendiliğinden gidiyor; gevşetmek kazanç getirmeden risk açar.
- **Uygulamada etkisi:** görünür değişiklik yok. Koordinatör canlıya migration'ı, oturum açma / arşivlemeyi ve birleşmiş dal temizliğini Mert'e sormadan yapar; `db reset`, canlıda gerçek veri silme, force push yine engellidir.
- **Dayanak:** CLAUDE.md §8 (Sürekli yetki, kullanıcı kararı 2026-10-02); ILKELER P15, P16.
- **Geri alma:** kolay — liste değişmedi.
- **Durum:** yürürlükte. Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör beslemesi #104).
- **Mert:** bilgi.

### KK-103 (2026-10-02) FB-6.7 puan bölüşü: A 7, B 3, C 6
- **Karar:** FB-6.7 = 16 puan; A (veri + yetki + kural) 7, B (ekran) 3, C (kapalı gün, geçmiş kilidi, süre dolumu) 6. Besleme #104'teki "A 10" düzeltilir: ilerleme A'dan 7 puan alır.
- **Neden:** KK-88'in 10 puanı A + B içindi; B (varyantlar, seçilen varyantın sözleşmeye bağlanması, görsel QA) bitmedi. KK-94'te A + B 1–1,5 kişi-hafta; ekran işinin üç adımı için B'ye ~%30 → 3. C'nin 6'sı KK-94'teki gibi.
- **Nerede:** ILERLEME §0a, §1 (iki yüzde satırı), §3 FB-6.7 satırı; FOUNDATION-B dilim tablosunun FB-6.7 satırı. DONE değişmez.
- **Ne zaman:** B ana dala girince 3, C girince 6 eklenir.
- **Uygulamada etkisi:** görünürde bir şey değişmez; Mert'in sabah gördüğü ilerleme yüzdesi düşer: Aşama 6–7 %70,1 → %68,9 (166 / 241), program %77,4 → %76,5 (244 / 319). Bitmeyen ekran işi bitmiş sayılmaz.
- **Dayanak:** KK-88, KK-94; ILKELER P11 (doğru veri).
- **Geri alma:** kolay — puanlar ILERLEME §3'te.
- **Durum:** yürürlükte; C'nin 6'sı veri 3 + ekran 3 bölündü (KK-109, besleme #112). Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör `local_d8686bdf…`'ın kararı).
- **Mert:** bilgi.

### KK-104 (2026-10-02) "Closed location" ayarında yalnız üç derece kalır, "warn" kalkar
- **Karar (ne):** Settings → Conflict handling → "Closed location" satırında yalnız üç değer kalır: block / her seferinde onay / düzenleme başına bir kez onay. "warn" değeri kalkar; eski "warn" kaydı silinir.
- **Nerede:** `ConflictHandlingSettingsPage.tsx` ve `closed_location` değerleri; FB-6.7 C-veri işçisi `local_863130bd…`.
- **Ne zaman:** FB-6.7 C ile (gece, 2026-10-02).
- **Ne için:** KARARLAR K17 üç derece sayıyor ve "(bugün confirm / block)" diyor (KARARLAR:166 — ölçüldü); kod `closed_location` için "warn"ı da tutuyor (`ConflictHandlingSettingsPage.tsx:31` `["warn", "confirm", "block"]` — ölçüldü). Bugünkü kurala uymayan kayıt silinir (CLAUDE.md §9).
- **Uygulamada etkisi:** müdür Settings → Conflict handling → Closed location'ı açınca "Warn" seçeneğini görmez. Önce Downtown'da "Warn" seçiliyse kapalı güne vardiya yazılır ve yalnız uyarılırdı; sonra en hafifi "Ask once per edit" (ilk vardiyada bir kez onay).
- **Dayanak:** KARARLAR K17; CLAUDE.md §9 (eski veri korunmaz); ILKELER P01.
- **Geri alma:** kolay — ayar değerleri tek yerde.
- **Durum:** canlıda — iki migration da canlıda (`20261005010000` ~11:55Z, KK-108; kayıt oturumu ölçtü, besleme #112). Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör `local_d8686bdf…`'ın beslemesi #106; KK-101 gece biçimi).
- **Mert:** bilgi (sabah listesinde).

### KK-105 (2026-10-02) FB-6.7 C incelemesinin altı bulgusu aynı turda düzeltilir
- **Karar (ne):** `nf-guvenlik` tur 1'in iki orta (O1, O2) ve dört düşük (D1–D4) bulgusunun hepsi bu turda C-veri işçisinde düzeltilir; düşükler backlog'a gitmez.
- **Nerede:** `task/fb-6.7c` — migration `20261005000000` / `20261005010000`, `apps/api/src/schedule/schedule-service.ts`, shared sözleşme.
- **Ne zaman:** şimdi (gece), main ve canlıdan önce; yeniden inceleme yalnız fark + O1 pgTAP satırı.
- **Ne için:** yetki ve görünürlük bulguları beklemez (ILKELER P17 koşulu: aynı işle ilgili güvenlik bulguları mevcut işe eklenir); hepsi küçük. O2 sıralaması OPS-03 sırasında 500'ü önler.
- **Uygulamada etkisi:** yalnız "Important dates manage" izni olan özel rol, kapalı gün önizlemesinde göremediği lokasyonun vardiyalarını artık görmez (sayısını görür); çalışan Alex duyuruda "24 kişiye gitti" sayısını görmez; geçmiş haftanın taslağındaki Can, Republish'te silinmez.
- **Dayanak:** ILKELER P17 (koşul), P09; KARARLAR K11; CLAUDE.md §9.
- **Geri alma:** kolay — dalda.
- **Durum:** uygulandı — `nf-guvenlik` tur 2 ONAY @`22d58021` (besleme #110; kayıt oturumu `local_10a5177a…`); altı bulgu dalda düzeltildi (`task/fb-6.7c` @`22d58021`, besleme #109; kayıt oturumu `local_10a5177a…`), tur 2 incelemede. Kayıt oturumu `local_91ac4f8d-406e-45b0-8ca3-9561cfa10618` yazdı (koordinatör `local_d8686bdf…`'ın beslemesi #108).
- **Mert:** bilgi (sabah listesinde).

### KK-106 (2026-10-02) FB-6.7 C ultrareview'siz, yalnız `nf-guvenlik` ile main'e gider
- **Karar (ne):** FB-6.7 C-veri için ultrareview Mert'e önerildi, cevap gelmedi; iş beklemez, `nf-guvenlik` R3 incelemesi (tur 1 DEĞİŞİKLİK İSTE, tur 2 ONAY @`22d58021`) ile main'e ve canlıya gider.
- **Nerede:** `task/fb-6.7c` (migration `20261005000000` / `20261005010000`, `schedule-service.ts`, shared sözleşme).
- **Ne zaman:** şimdi (gece), tam kapıdan sonra.
- **Ne için:** ultrareview yalnız kullanıcının başlattığı, öneri niteliğinde bir ek (CLAUDE.md §5); R3'ün zorunlu incelemesi `nf-guvenlik` (DELEGASYON §3) ve iki turda tamamlandı. Gece tam otomasyon (KK-101).
- **Uygulamada etkisi:** kapalı gün vardiyalara yansıma, geçmiş önemli tarih kilidi ve süresi dolan duyuru görünürlüğü sabah beklemeden canlıya girer; ek bir bağımsız tarama yapılmamış olur.
- **Dayanak:** CLAUDE.md §5 (ultrareview yalnız önerilir, kullanıcı başlatır), DELEGASYON.md §3 (R3: `nf-guvenlik` zorunlu; büyük diff'te ultrareview yalnız kullanıcıya önerilir); KK-101. Mert'in FB-6.7 A kararı: "Hayır, iki inceleme yeter" (kullanıcı kararı 2026-10-02; `tasks/FB-6.7.md` Notes, besleme #101 kaydı) ve ILKELER P06 kanıtları (`docs/plan/ILKELER.md:120-121`: yetki çekirdeği işinde de iki iç inceleme + `nf-guvenlik` yeniden incelemesi yeterli görüldü; iki tur `nf-guvenlik` ONAY'ı olan işte ultrareview gerekli görülmedi). İlk kayıtta bu dayanak bulunamamıştı (arama KK'de ve yalnız "Dayanak" satırlarında yapıldı); koordinatör gösterdi, besleme #110 eki.
- **Geri alma:** kolay — Mert sonradan ultrareview başlatabilir; bulgu çıkarsa yeni dalda düzeltilir.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_d8686bdf…`'ın beslemesi #110).
- **Mert:** bilgi (sabah listesinde); ultrareview isterse hâlâ açabilir.

### KK-107 (2026-10-02) FB-6.7 C'nin ekleyen migration'ı canlıya, silen yarısı Settings ekranını bekler
- **Karar (ne):** `20261005000000_closed_days_reach_the_shifts` canlıya gönderildi (Supabase MCP `apply_migration`, yedekli, `nf-db` alt ajanı); "warn"ı kaldıran `20261005010000` gönderilmedi.
- **Nerede:** canlı Supabase `hvyvyisrqyathtliyyyv`; yedek `newfork-wt/fb-6.7c/artifacts/nf-db/fb-6.7c/hosted-push/`.
- **Ne zaman:** 2026-10-02 ~11:40Z, main'den (`de010002`) hemen önce; `20261005010000` yeni Settings ekranı Vercel'de yayına girip main CI yeşil olunca.
- **Ne için:** Vercel main'i hemen yayına alır; yeni API kapalı gün önizlemesini ve yeni okuma şeklini çağırdığından veritabanı önce gelmeli (OPS-03). Silen yarı eski ekranın "warn" seçeneğini kırar, bu yüzden yeni ekrandan sonra.
- **Uygulamada etkisi:** canlıda bir günü kapalı ilan etmek o günün yayınlanmış vardiyalarını listeleyip açığa düşürmeye hazır (ekran bağlanınca görünür); Settings → Conflict handling'deki "Closed location" ayarı şimdilik eskisi gibi; "warn" seçili workspace yoktu (0).
- **Dayanak:** CLAUDE.md §8 "Sürekli yetki" (`636b76ee`: canlıya migration koordinatör sormadan); KARARLAR OPS-03; `nf-guvenlik` ONAY @`22d58021` (KK-106).
- **Geri alma:** orta — yeni nesneleri düşür, yedek tanımları sırayla çalıştır, `schema_migrations`'tan `20261005000000`'ı sil; veri silinmedi.
- **Durum:** tamamlandı — `20261005000000` canlıda (#111); silen yarı `20261005010000` da koşulları sağlanınca canlıya gitti (KK-108, besleme #112). Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_d8686bdf…`'ın beslemesi #111).
- **Mert:** bilgi (sabah listesinde).

### KK-108 (2026-10-02) FB-6.7 C'nin "warn"ı silen migration'ı canlıya
- **Karar (ne):** `20261005010000_closed_location_loses_warn` canlıya gönderildi (koordinatör, Supabase MCP, yedekli).
- **Nerede:** canlı Supabase `hvyvyisrqyathtliyyyv`; kısıt yedeği `newfork-wt/coord/artifacts/coord/fb-6.7c/` (`constraint__…sql`).
- **Ne zaman:** 2026-10-02 ~11:55Z; KK-107'nin koşulları sağlanınca: `nf-guvenlik` ONAY @`22d58021` (+ `00401d79` idempotent satırı koordinatör okudu), main CI 37002680529 yeşil, yeni kod Vercel'de canlı (`closure-preview` ucu 400, olmayan uç 404).
- **Ne için:** OPS-03 sırası: önce ekleyen yarı, sonra yeni kod, en son silen yarı; eski ekranın "warn"ı yazamayacağı ana kadar beklendi.
- **Uygulamada etkisi:** Settings → Conflict handling → Closed location'da "Warn" artık kaydedilemez; seçenekler Require confirmation / Confirm once per editing session / Block. Örnek: bir owner eski sekmeden "Warn" kaydetmeye çalışırsa kayıt reddedilir. Canlıda "warn" seçili workspace yoktu (3'ün 3'ü "confirm").
- **Dayanak:** CLAUDE.md §8 "Sürekli yetki" (`636b76ee`); KARARLAR OPS-03; KK-104, KK-107.
- **Geri alma:** orta — yedekteki eski kısıt tanımı çalıştırılır, `schema_migrations`'tan `20261005010000` silinir; veri silinmedi.
- **Durum:** canlıda (kayıt oturumu MCP ile ölçtü: son sürüm `20261005010000`, saklanan metin md5 `8fe3c04f…` = dosya, kısıt "warn"sız; MCP'nin ilk yazdığı `20261002115538` sürümü düzeltilmiş). Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_d8686bdf…`'ın beslemesi #112).
- **Mert:** bilgi (sabah listesinde).

### KK-109 (2026-10-02) FB-6.7 C'nin 6 puanı veri 3 + ekran 3 olarak sayılır
- **Karar (ne):** KK-103'teki C 6 puanı iki parçaya bölünür: C-veri 3, C-ekran 3. C-veri main'e ve canlıya girdiği için 3 puanı şimdi sayılır; C-ekran'ın 3'ü B ile birlikte ekran main'e girince.
- **Nerede:** ILERLEME §0a, §1 (iki yüzde satırı), §3 FB-6.7 satırı; FOUNDATION-B dilim tablosunun FB-6.7 satırı.
- **Ne zaman:** 2026-10-02, besleme #112 (C-veri kapandı).
- **Ne için:** C'nin veri kısmı (kapalı günün vardiyalara etkisi, geçmiş kilidi, süre dolumu, iki migration) bitti ve canlıda; ekranı ayrı iş ve Mert'in seçimini bekliyor. Biten işin puanı beklemez, bitmeyen ekran da sayılmaz.
- **Uygulamada etkisi:** ekranda yok. Mert'in gördüğü ilerleme: Aşama 6–7 %68,9 → %70,1 (169 / 241), program %76,5 → %77,4 (247 / 319).
- **Dayanak:** KK-103 (bölüş), KK-94 (C ≈ 0,75 kişi-hafta); ILKELER P11 (doğru veri). Yarı yarıya bölüş koordinatörün tahmini (veri: iki migration + API + R3 iki tur; ekran: varyant bağlama + e2e + görsel QA).
- **Geri alma:** kolay — puanlar ILERLEME §3'te.
- **Durum:** yürürlükte (C-veri 3 puanı sayıldı). Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_d8686bdf…`'ın kararı, besleme #112).
- **Mert:** bilgi (sabah listesinde).

### KK-110 (2026-10-02) "Bir kez sor" hızlı düzenleyicide de geçerli
- **Karar (ne):** "Closed location" ayarı "Confirm once per editing session" iken düzenleme oturumunun "sordum" hafızası Schedule'daki iki kayıt yolunda (Scheduling rule kutusu ve hızlı düzenleyici, `ShiftQuickEditor`) tek kaynaktan okunur.
- **Nerede:** Schedule → vardiya hızlı düzenleyicisi (`task/fb-6.7-ui`).
- **Ne zaman:** FB-6.7 ekran işiyle (dal `task/fb-6.7-ui`), main'e onunla girer.
- **Ne için:** KARARLAR K17 yol ayırmıyor (Mert'in sözü: oturumda bir kez); iki yolun ayrı hafızası aynı kişiye aynı soruyu iki kez sordururdu.
- **Uygulamada etkisi:** ayar "Confirm once per editing session" iken Ayşe 24 Ekim'e ilk vardiyayı sürükleyip onayladıktan sonra hızlı düzenleyiciden ikinci vardiyayı yazınca yeniden sorulmaz (önce: hızlı düzenleyici her kayıtta soruyordu).
- **Dayanak:** KARARLAR K17; ILKELER (tek kaynak, CLAUDE.md §9 "ikiz sistem yok").
- **Geri alma:** kolay — dalda.
- **Durum:** dalda uygulandı (`task/fb-6.7-ui` @`a9f1bd39`, tek modül `apps/web/src/schedule/lib/closedDayConfirmation.ts`; besleme #114); main'e ekran işiyle girer. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_d8686bdf…`'ın kararı, besleme #113).
- **Mert:** bilgi (sabah listesinde).

### KK-111 (2026-10-02) Sıradaki iş FB-6.6 Belgeler / onboarding
- **Karar (ne):** FB-6.7 ekranı Mert'in varyant seçimine park edilirken ILERLEME §4 sırasından bir sonraki iş olarak FB-6.6 (Belgeler / onboarding çekirdeğe) başlatılır.
- **Nerede:** FB-6.6 görev dosyası + tazelik ölçümü; işçi `local_863130bd-957d-498b-9dfb-71a39090e29e` (başlık "FB-6.6 tazelik + görev dosyası: belgeler / onboarding", sabitli, Remote Control açık, Opus 5.5 / high, oturum klasörü `.claude/worktrees/gallant-feistel-508e83` — `get_session` ile ölçüldü 2026-10-02 ~17:50Z), dal `task/fb-6.6-plan` (kayıt oturumu ölçtü: dal var, `origin/main` üstünde henüz commit yok; worktree `newfork-wt/fb-6.6-plan`).
- **Nasıl:** hazır iki satır karşılaştırıldı — FB-6.4 Takas / Shift Hub (11 puan) ile FB-6.6 (8 puan); bağımlılık zinciri eşit, ikisi de birer satır açıyor → §4 kuralının (iii) adımı: küçük puanlı önce.
- **Ne zaman:** 2026-10-02 ~13:30Z (devreden koordinatör `local_d8686bdf…` verdi; devirle kayda girdi).
- **Ne için:** Mert'in 2026-10-02 ~13:00Z talimatı: "Otomasyon olarak bir sonraki taski seçip, sessionlara delege et ve ilerlemeye devam et… Bu bir engel ise, bu taski atla." (HANDOFF `e30f3de3` §0). FB-6.7 ekranı varyant seçimini beklerken boşta kalınmaz.
- **Uygulamada etkisi:** henüz yok — görev dosyası ve tazelik ölçümü çıkıyor; ekranda değişiklik ancak A (veri + yetki) ve B (ekran) bitince.
- **Dayanak:** Mert'in 2026-10-02 ~13:00Z talimatı; CLAUDE.md §8 "Sürekli yetki" (yeni iş seçmek); ILERLEME §4 sıralama kuralı; ILKELER P17 (tek hat: FB-6.7 park, yeni iş ancak o beklerken).
- **Geri alma:** kolay — görev dosyası aşamasında.
- **Durum:** yürürlükte (görev dosyası ve tazelik işçide). Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın devir beslemesi, #115).
- **Mert:** bilgi (dönüş listesinde).

### KK-112 (2026-10-02) FB-6.6 belge ve onboarding incelemesinin beş ürün kuralı (D1–D5) kabul
- **Karar (ne):** D1 rütbe: kimse kendi belgesini onaylamaz, eş rütbe birbirininkini incelemez (çalışanınkini lokasyon müdürü / admin / owner, müdürünkini admin / owner, admin'inkini yalnız owner); D2 iki lokasyonlu çalışanın belgesine tek onay yeter; D3 kısıtlı müdür belge ve onboarding incelemez (**düzeltildi, KK-116:** kısıtlı müdür / admin başkasının belgesini görmez de; ilk metin "görür, karar veremez" diyordu); D4 kısıtlı kişi kendi bildirimlerini okur; D5 owner'ın gönüllü yüklediği belge kimsenin onay kuyruğuna düşmez.
- **Nerede:** `tasks/FB-6.6.md` "Ürün kararları → Dayanağı yazılı olanlar"; uygulaması A1a (`nf-db`, `task/fb-6.6-a1`), A2 (`nf-backend`), B (Account → Documents).
- **Ne zaman:** 2026-10-02 ~18:05Z (koordinatör); ekrana A1 + A2 + B bitince gelir. KARARLAR'a D1, D2, D5 yazımı Done when 13 — dilim kapanırken.
- **Ne için:** Her biri bir KARARLAR satırı ya da ilkeyle birebir kapsanıyor (CLAUDE.md §13); işçilerin beklemeden yazabilmesi.
- **Uygulamada etkisi:** Kadıköy müdürü Ayşe öteki müdür Deniz'in belgesini onaylayamaz; admin Zeynep kendi belgesini onaylayamaz; owner Account → Documents'ta Food Handler sertifikasını yükler, kimsenin kuyruğuna düşmez; onboarding'i bitmemiş Aydan zildeki bildirimlerini açar; Ali'nin (Kadıköy + Beşiktaş) belgesini Ayşe ya da Mehmet onaylayınca iki lokasyonda da açılır.
- **Dayanak:** KARARLAR "Ürün kuralları" (rütbe satırı, kısıtlı kişi, owner gönüllü yükleme), KK-24, FOUNDATION-B akış 4 (Mert, 2026-09-23), KARARLAR M2, ILKELER P07. Bağımsız kanıt (yerel DB, ~18:05Z koordinatör, ~18:10Z kayıt oturumu): `app_private.authz_actions` — `documents.review` / `onboarding.review` `no_self = t`, `rank_below = t`, `restricted_ok = f`; `documents.self`, `onboarding.self`, `notifications.read_own` `restricted_ok = t`.
- **Geri alma:** kolay — dalda; main'e girmeden kod yok.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #116).
- **Mert:** bilgi (dönüş listesinde).

### KK-113 (2026-10-02) FB-6.6'nın iki teknik kararı (D6, D7)
- **Karar (ne):** D6: taslak belgenin etkisizliği bugünkü sırayla korunur — önce tetikleyici süzer, sonra servis kapısı taslakta hata verir. D7: imza şablonu ve saklama politikası yazımı `settings.documents.write` eyleminde kalır, yeni eylem açılmaz.
- **Nerede:** `tasks/FB-6.6.md` D6, D7; A1a (`nf-db`).
- **Ne zaman:** 2026-10-02 ~18:05Z (koordinatör).
- **Ne için:** D6: ters sıra davet kabulünü çökertir (FOUNDATION-B Aşama 6 madde 6). D7: kapsam testinde bugün öyle etiketli; yeni eylem katalog sayacını büyütür.
- **Uygulamada etkisi:** görünür değişiklik yok.
- **Dayanak:** ILKELER P19 (saf teknik iç karar); `nf-db` farklı görürse raporunda gerekçesiyle yazar.
- **Geri alma:** kolay — dalda.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #116).
- **Mert:** bilgi (dönüş listesinde).

### KK-114 (2026-10-02) FB-6.6 puanı 8 → 11
- **Karar (ne):** FB-6.6'nın puanı 8'den 11'e çıkar: A1a 5 + A1b 1 + A2 2 + A3 2 + B 1.
- **Nerede:** ILERLEME §1 (iki yüzde satırı), §0a, §3 FB-6.6 satırı.
- **Ne zaman:** 2026-10-02 ~18:05Z (koordinatör), görev dosyası main'e girince.
- **Ne için:** 8, ölçümden önce yazılmıştı; tazelik kapsamı 55 servis + 6 yardımcı + 11 köprü + 4 test dosyası + 2 e2e ölçtü.
- **Uygulamada etkisi:** ekranda yok. Mert'in gördüğü ilerleme: Aşama 6–7 %70,1 → %69,3 (169 / 244), program %77,4 → %76,7 (247 / 322) — biten iş azalmadı, kalan büyüdü.
- **Dayanak:** KK-88 emsali (FB-6.7 puanı kapsamla büyüdü); ILKELER P11 (doğru veri).
- **Geri alma:** kolay — puanlar ILERLEME §3'te.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #116).
- **Mert:** bilgi (dönüş listesinde).

### KK-115 (2026-10-02) FB-6.6'nın iki ürün sorusu (S1, S2) Mert'e park
- **Karar (ne):** S1 (onboarding'de resmî ad düzeltmesini kim onaylar) ve S2 (incelenmeyi bekleyen belgeyi kim görür) koordinatör karar vermeden Mert'e bırakılır; dönüşte tek turda sorulur.
- **Nerede:** `tasks/FB-6.6.md` "Mert'e sorulacaklar"; ILERLEME §0c 66–67.
- **Ne zaman:** 2026-10-02 ~18:05Z park; Mert dönünce.
- **Ne için:** S1'i birebir kapsayan kural yok. S2'de iki dayanak çelişiyor: KARARLAR M2 metni (müdür lokasyondaki herkesin belgelerini görür) ile ILKELER P07'nin 2026-10-01 kanıtı (bekleyen talebi yalnız karar veren ve sahibi görür) — CLAUDE.md §13: kapsamayan ürün sorusu sorulur.
- **Uygulamada etkisi:** şimdilik yok; yalnız A1b (1 puan) bekliyor, A1a / A2 / A3 yazımı / B sürüyor. Bugün ekranda: Emre'nin resmî ad düzeltmesini yalnız owner / admin onaylıyor; Ayşe, Deniz'in bekleyen belgesini görüyor.
- **Dayanak:** CLAUDE.md §13 (kim karar verir), HANDOFF `e30f3de3` §0 (kapsamayan soru park edilir).
- **Geri alma:** kolay.
- **Durum:** cevaplandı 2026-10-02 ~19:10Z (Mert): S1 → (b) yalnız owner ya da admin — önerilenin tersi, ILKELER P07'ye ters seçim kanıtı; S2 → (a) karar verenler + sahibi, önerilen; ikisi KARARLAR "Ürün kuralları"nda (besleme #121). Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #116).
- **Mert:** karar (§0c 66–67).

### KK-116 (2026-10-02) FB-6.6 D3 düzeltildi: kısıtlı müdür / admin başkasının belgesini görmez
- **Karar (ne):** Belgesi gecikmiş ya da onboarding'i bitmemiş müdür ya da admin başkalarının belgelerini görmez ve incelemez (KK-112'deki D3 "görür ama onaylayamaz" diyordu, yanlıştı).
- **Nerede:** `tasks/FB-6.6.md` D3 (metin düzeltildi); A1a / A2 (`can()` cevabı); Employees → kişi → Documents, Settings → Documents.
- **Ne zaman:** 2026-10-02 ~18:20Z (koordinatör, A2-web incelemesinde).
- **Ne için:** Kısıtlı kişi kuralı yönetim işlerini bütünüyle kapatıyor; izindeki "görür, oy veremez" istisnası yalnız izin için konmuştu ve belgeye genişletilmedi. Bugünkü çekirdek ve DB zaten böyle.
- **Uygulamada etkisi:** Food Handler belgesi gecikmiş müdür Hande, Kadıköy'deki Ali'nin belgesini Employees → Ali → Documents'ta görmez; kendi eksiğini tamamlayınca görür.
- **Dayanak:** KARARLAR "Ürün kuralları" kısıtlı kişi (`KARARLAR.md:83`); "İzin" S3 (`:112`) yalnız izin istisnası; çekirdek `documents.read` `restricted_ok = f` (yerel DB, kayıt oturumu ölçtü ~18:25Z).
- **Geri alma:** kolay — dalda.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #117).
- **Mert:** bilgi (dönüş listesinde).

### KK-117 (2026-10-02) FB-6.6 belge rota kapıları A2'nin ikinci parçasına eklenir
- **Karar (ne):** A2-web'in yolda bulduğu belge rota kapıları (`App.tsx:410` `employees/documents`, `:574` imza şablonları, `PermissionRoute.tsx:7-20` Settings giriş listesindeki belge anahtarları) çekirdeğin cevabına bağlanır; iş A2'nin ikinci parçasına eklenir, ayrı iş açılmaz.
- **Nerede:** `apps/web/src/App.tsx`, `apps/web/src/auth/PermissionRoute.tsx` (`nf-backend`, `task/fb-6.6-a2`).
- **Ne zaman:** 2026-10-02 ~18:20Z; A2'nin ikinci parçasıyla.
- **Ne için:** Aynı işle doğrudan ilgili küçük bulgu; kapı ekranda düğmeyi gizlerken rota açık kalırsa kişi boş ya da hatalı sayfaya düşer.
- **Uygulamada etkisi:** Kısıtlı admin Employees → Documents sayfasını artık açamayacak (bugün açıyor, liste boş ya da hata).
- **Dayanak:** ILKELER P17 koşulu (aynı işle doğrudan ilgili küçük bulgular mevcut işe eklenir); CLAUDE.md §9 (route-yerel yetki kapısı yeni eklenmez).
- **Geri alma:** kolay — dalda.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #117).
- **Mert:** bilgi (dönüş listesinde).

### KK-118 (2026-10-02) FB-6.6 A2, A1a ile aynı main penceresinde ve ondan sonra girer
- **Karar (ne):** `task/fb-6.6-a2` main'e tek başına girmez; A1a (`task/fb-6.6-a1`) ile aynı main penceresinde, A1a'dan hemen sonra girer.
- **Nerede:** main'e gönderim (CLAUDE.md §6); dallar `task/fb-6.6-a1`, `task/fb-6.6-a2`.
- **Ne zaman:** ikisi de `nf-guvenlik` ONAY'ı aldıktan sonra, tek pencerede.
- **Ne için:** A2 owner'ın muaf belgesine yüklemeyi API'de açıyor; DB tarafı A1a'da. A2 tek başına girerse owner yüklemesi veritabanında "closed" ile düşer.
- **Uygulamada etkisi:** görünür fark yok; sıra yanlış olsaydı owner Account → Documents'tan yükleme yaparken hata alırdı (düğme B ile gelecek).
- **Dayanak:** CLAUDE.md §4 (veri / sunum sırası: işlevsel kısım önce), §6; ILKELER P19 (saf teknik iç karar).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #119).
- **Mert:** bilgi (dönüş listesinde).

### KK-119 (2026-10-02) İmza şablonu izinleri belge izinlerine katlanır
- **Karar (ne):** `signature_templates.*` izinleri `documents.read` / `documents.manage`'a katlanır (seçenek a); ayrı `settings.signature_templates.write` eylemi açılmaz.
- **Nerede:** DB `nf-db` (FB-6.6 A1b, `task/fb-6.6-a1`); API + shared + web `nf-backend` (A2).
- **Ne zaman:** 2026-10-02 ~19:15Z; A1b ve A2 ile.
- **Ne için:** D7 sonrası imza şablonu anahtarları ayrı bir yetki yolu olarak kalıyordu (ikiz sistem); ayrı izin, ayar cehennemine bir kutu daha ekler.
- **Uygulamada etkisi:** Settings → Roles'ta "Signature templates" kutuları kalkar; Documents izni olan kişi Settings → Acknowledgements'ı da açar ve yazar.
- **Dayanak:** KARARLAR K14 S3; CLAUDE.md §9 (ikiz sistem yok); ILKELER anti-hedef "ayar cehennemi". Reddedilen: (b) ayrı `settings.signature_templates.write` eylemi.
- **Geri alma:** orta — rol kayıtlarındaki izin satırları taşınır; dalda.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #121).
- **Mert:** bilgi (dönüş listesinde).

### KK-120 (2026-10-02) FB-6.6 A1a'nın iki davranış değişikliği kabul
- **Karar (ne):** (i) Süresi yaklaşan belge yapılacağı yalnız o belgeyi açabilene gider. (ii) Müdür tipi özel rol `documents.manage` taşısa da Settings → Documents'a yazamaz.
- **Nerede:** `task/fb-6.6-a1` (migration `20261006000000`).
- **Ne zaman:** 2026-10-02 ~19:15Z (A1a raporu üzerine).
- **Ne için:** (i) bildirim karar verene ve işi doğrudan etkilenene gider; (ii) ayar yazımı owner / admin'in.
- **Uygulamada etkisi:** (i) Varsayılan müdür Ayşe "Emre's Food Handler expires" yapılacağını artık almaz (belgeyi açabilen alır). (ii) owner Mert özel "Shift lead" rolüne Documents manage verse de Ayşe Settings → Documents'ta kayıt yapamaz (rol editöründeki kutu için BL-555).
- **Dayanak:** (i) ILKELER anti-hedef "bildirim gürültüsü", P07; (ii) KARARLAR M2 (ayar yazımı owner / admin), K14.
- **Geri alma:** kolay — dalda.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #121).
- **Mert:** bilgi (dönüş listesinde).

### KK-121 (2026-10-02) FB-6.6 A1a'nın teknik kararları kabul; ultrareview önerilmedi
- **Karar (ne):** A1a raporundaki teknik kararlar 1–5 kabul. FB-6.6 A1 + A2 için ultrareview önerilmez; inceleme `nf-guvenlik` A1 + A2 birlikte.
- **Nerede:** A1a raporu (posta kutusu); `task/fb-6.6-a1`, `task/fb-6.6-a2`.
- **Ne zaman:** 2026-10-02 ~19:15Z.
- **Ne için:** Teknik iç kararlar Claude'un (P19). Ultrareview: Mert 2026-10-02 FB-6.7 A'da "iki inceleme yeter" dedi.
- **Uygulamada etkisi:** görünür değişiklik yok.
- **Dayanak:** ILKELER P19; P06 kanıtı (2026-10-02 ikinci ters seçim: "Hayır, iki inceleme yeter"); CLAUDE.md §5.
- **Geri alma:** kolay — Mert sonradan ultrareview başlatabilir.
- **Durum:** yürürlükte. Kayıt oturumu `local_10a5177a-66d2-4c9c-8292-95c7613d4c4d` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #121).
- **Mert:** bilgi (dönüş listesinde); ultrareview isterse açabilir.

### KK-122 (2026-10-02) FB-6.6 A1 ve A2 tek dalda main'e gider
- **Karar (ne):** A1b bitince `task/fb-6.6-a2`, `task/fb-6.6-a1`'in üstüne rebase edilir; yetki matrisi dökümü (`packages/shared/src/authorization-matrix.expected.json`) A1a + A1b migration'larıyla (rollback'li) yenilenir; tek dal `nf-guvenlik` incelemesine ve main'e gider.
- **Nerede:** `task/fb-6.6-a1`, `task/fb-6.6-a2` (@`9b7bbdaa`).
- **Ne zaman:** 2026-10-02 ~22:40Z.
- **Ne için:** döküm A1'in migration'larına bağlı; A2 dökümsüz girseydi CI'daki shared testi kırmızı olurdu (bugün dalda shared 201/202, tek kırmızı bu — işçinin). KK-118'in "aynı main penceresinde önce A1, sonra A2" sırasını tek dala çevirir.
- **Uygulamada etkisi:** yok (süreç).
- **Dayanak:** ILKELER P19 (saf teknik iç karar).
- **Geri alma:** kolay — dallar ayrı kalır, döküm ayrı commit'le yenilenir.
- **Durum:** yürürlükte. Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #123).
- **Mert:** bilgi.

### KK-123 (2026-10-02) FB-6.6 A1b'nin teknik kararları kabul
- **Karar (ne):** (1) S1 (resmî ad onayını yalnız owner / admin verir) yeni çekirdek eylemi `onboarding.legal_name` ile uygulanır, satır içi rol kontrolüyle değil (CLAUDE.md §9). (2) S2'de gizli bekleyen belgeye tekil erişim `authz.out_of_scope` döner: bilinmeyen ve kapsam dışı hedef aynı cevabı alır.
- **Nerede:** `task/fb-6.6-a1` @`a2b75bfb`, `supabase/migrations/20261006010000_pending_documents_legal_names_one_document_permission.sql`.
- **Ne zaman:** 2026-10-02 ~22:55Z.
- **Ne için:** yetki kuralı tek yerde (çekirdek) kalır; gizli satırın varlığı cevaptan anlaşılmaz.
- **Uygulamada etkisi:** Ayşe (rolünde özel izin olsa da) Can'ın resmî ad düzeltmesini onaylayamaz; Deniz'in bekleyen belgesini açmaya çalışan Ayşe "yok" cevabı alır.
- **Dayanak:** KARARLAR "Ürün kuralları" (S1, S2, 2026-10-02); CLAUDE.md §9 ("Hayır" sözleşmesi; satır içi kapsam mantığı eklenmez); ILKELER P19.
- **Geri alma:** orta — yeni migration'la.
- **Durum:** yürürlükte. Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #124).
- **Mert:** bilgi.

### KK-124 (2026-10-02) Resmî ad düğmeleri çekirdeğin `onboarding.legal_name` cevabına bakar
- **Karar (ne):** Employees → kişi → çekmece → "Legal name review"daki Accept / Request changes düğmeleri `can(…, "onboarding.legal_name")` ile açılır; Activate `onboarding_review`'da kalır. Seçenek (a). FB-6.6 A2'ye eklendi (işin önünde: S1'den sonra müdür düğmeyi açık görüp 403 alırdı).
- **Nerede:** `apps/web/src/employees/EmployeeDrawer.tsx:1704` (`canReview={allowed?.onboarding_review ?? false}`; main ve `task/fb-6.6-a2` @`44f1ad83`'te — ölçüldü), dal `task/fb-6.6-a2`.
- **Ne zaman:** 2026-10-02 ~23:25Z.
- **Ne için:** ekran çekirdeğin cevabını gösterir; kapalı işlem için açık düğme gösterilmez.
- **Uygulamada etkisi:** Kadıköy müdürü Ayşe, Employees → Emre → çekmece → "Legal name review"da Accept / Request changes düğmelerini görmez; admin Zeynep görür.
- **Dayanak:** KARARLAR "Ürün kuralları" — resmî ad düzeltmesini yalnız owner / admin onaylar (Mert, 2026-10-02, S1); CLAUDE.md §9 (web'de izin anahtarı kontrolü yok, karar çekirdekte).
- **Reddedilen:** (b) DB'ye yeni bayrak (iki rol yazar), (c) bırak, müdür 403 görsün.
- **Geri alma:** kolay — tek kapı satırı.
- **Durum:** yürürlükte; dalda uygulandı `85267a22` (ölçüldü, #126; #125'te henüz uygulanmamıştı). Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #125).
- **Mert:** bilgi.

### KK-125 (2026-10-03) FB-6.6 güvenlik tur 1'in üç düşük bulgusu bu işte kapanır
- **Karar (ne):** `nf-guvenlik` tur 1'in düşük bulguları #2, #3, #4 FB-6.6 içinde düzeltilir; #1 backlog'a (BL-557). #2: `apps/api/src/settings/document-types-routes.ts`'teki yerel `documents.manage` kapısı → `resolveActor` + veritabanı kararı (`nf-backend`). #3: `get_employee_onboarding_review_service` için pgTAP hücresi; `progress_total` gizli satırı saymaz (`nf-db`). #4: `get_employee_onboarding_service` okumasında `by_case = true` (`nf-db`, tek satır).
- **Nerede:** dallar `task/fb-6.6-a1`, `task/fb-6.6-a2`; rapor `newfork-clean/artifacts/nf-guvenlik/fb-6.6/review-1.md` (git dışı).
- **Ne zaman:** 2026-10-03 ~00:00Z.
- **Ne için:** aynı işle doğrudan ilgili küçük bulgu bu işte kapanır; ikiz yetki kapısı CLAUDE.md §9'a ters.
- **Uygulamada etkisi:** görünür fark yok. Settings → Documents'ta yetkisiz yazma denemesinin "hayır"ı artık nedenini taşır; onboarding incelemesinde ilerleme sayısı ("3 / 4" gibi) karar veremeyen müdüre gizli belgeyi saydırmaz.
- **Dayanak:** ILKELER P17 (koşul: aynı işle doğrudan ilgili küçük bulgu mevcut işe eklenir); CLAUDE.md §9 (ikiz sistem yok).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #127).
- **Mert:** bilgi.

### KK-126 (2026-10-03) S2'de yenilemesi bekleyen belgenin eski onaylı hâli görünür kalır
- **Karar (ne):** bekleyen belgeyi karar veremeyen müdürden saklama kuralı yalnız bekleyen yeni dosyayı gizler; aynı satırın eski onaylı belgesi ve geçerlilik durumu M2'ye göre görünür kalır. Uygulama bugün ikisini birden gizliyordu; `nf-db` düzeltir (model ayıramıyorsa seçenekle geri gelir).
- **Nerede:** `app_private.document_row_readable` (`20261006010000…`), dal `task/fb-6.6-a1`; incelemenin önerisi `newfork-clean/artifacts/nf-guvenlik/fb-6.6/review-1.md` (git dışı).
- **Ne zaman:** 2026-10-03 ~00:00Z.
- **Ne için:** Mert'in seçtiği metin "onaylanmış belge M2'ye göre görünür" diyor; yenileme bekleyen satırda onaylı belge kaybolmamalı.
- **Uygulamada etkisi:** Deniz'in geçerli Food Handler'ı varken yenisini yükledi; Ayşe eski geçerli belgeyi ve geçerlilik durumunu görmeye devam eder, yalnız bekleyen yeni dosyayı görmez.
- **Dayanak:** KARARLAR "Ürün kuralları" — "Bekleyen belgeyi yalnız karar veren ve sahibi görür" (Mert, 2026-10-02, S2): "Onaylanmış belge M2'ye göre görünür." Kural birebir kapsıyor; yeni soru değil.
- **Geri alma:** orta — migration.
- **Durum:** yürürlükte; dalda uygulandı `3c891ee7` (`app_private.document_view`, migration `20261006020000` — ölçüldü, #128). Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #127).
- **Mert:** bilgi.

### KK-127 (2026-10-03) Schedule'ın belge uyarısı karar veremeyen müdüre yalnız "missing" der
- **Karar (ne):** `nf-guvenlik` tur 3 düşük 1 FB-6.6 içinde kapanır: `app_private.document_shift_reasons` geçerli onayı olmayan kişi için karar veremeyen okuyucuya "rejected" / "pending review" yerine "missing" verir; karar verene bugünkü gibi. `nf-db` `local_abc4d126…`, dal `task/fb-6.6-schedule`.
- **Nerede:** `app_private.document_shift_reasons` (Schedule → vardiya çakışma uyarısı); rapor `newfork-clean/artifacts/nf-guvenlik/fb-6.6/review-3.md` (git dışı).
- **Ne zaman:** 2026-10-03 ~02:46Z.
- **Ne için:** reddedilen ve bekleyen belge yalnız karar veren + sahibine açık; Schedule'daki kelime aynı bilgiyi sızdırıyordu (dosya, gerekçe ve indirme sızmıyordu).
- **Uygulamada etkisi:** Veli'nin reddedilen Food Handler'ı yüzünden çakışma uyarısında Lale "missing" görür, Zeynep "rejected".
- **Dayanak:** KARARLAR "Ürün kuralları" — S2 (Mert, 2026-10-02): "Schedule'daki 'belge eksik' uyarı / engeli değişmez (dosyayı değil bilgiyi gösterir)" ve reddedilen belge eki (Mert, 2026-10-03). Kural birebir kapsıyor; incelemenin önerdiği soru sorulmadı.
- **Geri alma:** orta — migration.
- **Durum:** **yerine geçti 2026-10-03 (besleme #135)** — uygulanmadı; Mert kuralı genişletti (bakana göre görünürlük, KARARLAR'da taslak), plan sohbette (§0c 68). Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #134).
- **Mert:** bilgi.

### KK-128 (2026-10-03) FB-6.6'nın dört migration'ı canlıya gönderildi
- **Karar (ne):** `20261006000000`, `…010000`, `…020000`, `…030000` canlıya (proje `hvyvyisrqyathtliyyyv`) Supabase MCP `apply_migration` ile; önce main (OPS-03, nesne silen iş), main CI 37090845658 yeşilinden sonra. 12 `signature_templates` rol izin satırı, bağımlılığı ve iki izin tanımı silindi.
- **Nerede:** koordinatörün `nf-db` alt ajanı; yedek ve rapor `newfork-wt/coord/artifacts/coord/fb-6.6/hosted-push/`.
- **Ne zaman:** 2026-10-03 ~04:37Z (posta kutusu damgası 04:37:29Z).
- **Ne için:** FB-6.6'nın veri ve yetki parçası canlıda olmadan yayındaki yeni kod (Vercel main'den yayınlar) belge ve onboarding işlemlerinde çekirdeğin yeni eylemlerini bulamazdı.
- **Uygulamada etkisi:** canlıda resmî ad onayı yalnız owner / admin; incelenmemiş ve reddedilen belge yalnız karar veren + sahibi; Settings → Roles'ta "Signature templates" kutuları yok, kimse erişim kaybetmedi.
- **Dayanak:** CLAUDE.md §8 sürekli yetki (canlıya migration gönderimi) + Mert'in silme onayı (2026-10-02 ~22:55Z, besleme #124; aktarılan onay koordinatörün penceresinde); KARARLAR OPS-03.
- **Geri alma:** yedekten (79 dosya, `INDEX.tsv`); silinen satırlar yedekte.
- **Durum:** tamam — kayıt oturumu ölçtü (07:19Z, Supabase MCP): dört sürüm, md5'ler repo dosyalarıyla eşit, `signature_templates` rol satırı 0. Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kaydı, besleme #135).
- **Mert:** bilgi.

### KK-129 (2026-10-03) FB-6.6 B'ye iki küçük düzeltme eklendi
- **Karar (ne):** `nf-arayuz`'un B turunda bulduğu Y2 (Employees → kişi → çekmecedeki belge durum etiketleri listedekiyle aynı) ve Y3 ("Extend delivery deadline" ve inceleme düğmeleri satır başına `can(documents.review, kişi)` ile) aynı dalda (`task/fb-6.6-b`) yapılır. B'nin metin kararları kabul: "Optional for you; what you submit goes on file without review." / "On file" / "You don't have access to this document."
- **Nerede:** `task/fb-6.6-b` @`3444f5f7`.
- **Ne zaman:** 2026-10-03 ~07:15Z.
- **Ne için:** aynı ekran ve aynı işle doğrudan ilgili küçük bulgular; düğme çekirdeğin cevabını göstermeli.
- **Uygulamada etkisi:** çekmece ve liste aynı durumu aynı kelimeyle söyler; belgeye karar veremeyen müdür "Extend delivery deadline" ve inceleme düğmelerini görmez.
- **Dayanak:** ILKELER P17 (aynı işle doğrudan ilgili küçük ve görsel hatalar mevcut işe eklenir), P21; CLAUDE.md §9.
- **Geri alma:** kolay.
- **Durum:** yürürlükte, işçi aynı dalda yapıyor. Kayıt oturumu `local_e4bbe6fe-261c-4651-85ac-1553a61e776b` yazdı (koordinatör `local_91ac4f8d…`'ın kararı, besleme #135).
- **Mert:** bilgi.

### KK-130 (2026-10-04) Tek seferlik oturum toparlama talimatı kural sanıldı (yanlış okuma, düzeltildi)
- **Karar (ne):** Mert'in "sessionları toparla boşta olanları kaldır temizle" talimatı ve netleştirmede seçtiği "Fazlayı arşivle, havuzu küçült (Önerilen)" kalıcı kural sanıldı; KARARLAR OPS-07'ye "ters çevrildi (kısmen)" ve ILKELER P15'e kanıt olarak yazıldı (besleme #143, main `110d9c7b`). Mert: 'tek seferlik bir task vermiştim, kural değil'. İkisi geri alındı; OPS-07 olduğu gibi geçerli (oturum arşivlenmez, temizlenip havuza döner), altına tek seferlik iş notu düşüldü.
- **Nerede:** koordinatör `local_10a5177a…`'ın penceresi; kayıt `docs/plan/KARARLAR.md` OPS-07, `docs/plan/ILKELER.md` P15.
- **Ne zaman:** talimat ve arşiv 2026-10-04 ~09:30Z; düzeltme koordinatör beslemesi #144.
- **Ne için:** tek seferlik bir toparlama işinin kalıcı bir oturum kuralına dönüşmesini önlemek.
- **Uygulamada etkisi:** 26 boş havuz oturumu ve 2026-10-01'in eski koordinatörü arşivde kalır (geri alınabilir); bundan sonra işi biten oturum yine temizlenip havuza döner, havuz sayısına sınır yok. CLAUDE.md §8 ve `.claude/agents/nf-db.md` değişmiyor (Mert: "ikisi de şimdilik kalsın").
- **Dayanak:** Mert'in düzeltmesi (2026-10-04, koordinatörün penceresinde); ILKELER P22 (en güncel açık karar).
- **Ders:** tek seferlik bir işin netleştirme sorusundaki seçenek, kural değişikliği diye okunmaz; kural mı iş mi belirsizse sorulur.
- **Geri alma:** —
- **Durum:** düzeltildi. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_10a5177a…`'ın kaydı, besleme #144).
- **Mert:** düzeltti.

### KK-131 (2026-10-04) AVAIL-002'de saat modu günde çok aralık (`ranges`); A ile B aynı pencerede main'e
- **Karar (ne):** S-A: saat modundaki müsaitlik kaydı `range`'den `ranges`'e geçer (günde birden çok aralık; KARARLAR M4, AVAIL-002 S2 (a)). Veri şekli değiştiği için A (A1+A2, `nf-db`) main'e B'siz (`nf-backend`) girmez; B A'nın dalından açılır, ikisi aynı pencerede main'e alınır.
- **Nerede:** AVAIL-002; işçi `local_91ac4f8d…` ("AVAIL-002 A1+A2 müsaitlik DB (nf-db)"), dal `task/avail-002-a`, worktree `newfork-wt/avail-002-a` — ölçüldü.
- **Ne zaman:** 2026-10-04 ~14:30Z (AVAIL-002 A1+A2 başlarken).
- **Ne için:** veri şekli ile shared / API / web okuyucusu aynı anda değişmezse main'de yarım bir sözleşme kalır; ikiz biçim tutulmaz.
- **Uygulamada etkisi:** çalışan My availability'de bir güne iki saat aralığı girebilir (ör. 09–14 ve 17–24); main'de ara bir hâl (yeni DB, eski web) görünmez.
- **Dayanak:** CLAUDE.md §9 (ikiz sistem yok, eski veri korunmaz), ILKELER P01.
- **Geri alma:** dal düzeyinde kolay; main'e girdikten sonra yeni migration'la.
- **Durum:** yürürlükte. Kayıt oturumu `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` yazdı (koordinatör `local_abc4d126…`'ın kararı, besleme #149).
- **Mert:** bilgi.

### KK-132 (2026-10-04) AVAIL-002 yayın kararında yalnız müsaitlik onay dalları silinir
- **Karar (ne):** S-B: `weekly_publication_decisions` / preflight'ta yalnız müsaitliğe ait "accepted" / onay dalları silinir; önceki yayında kabul edilmiş çakışmanın "retained" kaydı kalır (BL-174 kapsam dışı). AVAIL-002 Done when 3'teki `prosrc` sayımı yalnız müsaitlik metinlerine uygulanır.
- **Nerede:** AVAIL-002 A1.5 ve Done when 3; işçi `local_91ac4f8d…`.
- **Ne zaman:** 2026-10-04 ~14:30Z (AVAIL-002 A1+A2 başlarken).
- **Ne için:** M9 müsaitlik için onay istemez; öteki çakışmaların kabul kaydı (izin, kural) bu işin konusu değil.
- **Uygulamada etkisi:** Publish → Pre-flight müsaitlik için onay kutusu ve "Acknowledged by" göstermez; başka bir kuralın önceki yayında kabul edilmiş çakışması yine "retained" olarak kalır.
- **Dayanak:** KARARLAR M9 + besleme #147 koordinatör kararı; BL-174 kendi işinde; ILKELER P17 (kapsam).
- **Geri alma:** kolay (dal düzeyinde).
- **Durum:** yürürlükte. Kayıt oturumu `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` yazdı (koordinatör `local_abc4d126…`'ın kararı, besleme #149).
- **Mert:** bilgi.

### KK-133 (2026-10-04) `availability.own` yalnız employee rolüne
- **Karar (ne):** K-1: çekirdekteki `availability.own` (kendi müsaitlik kaydını okuma / yazma) yalnız employee rolüne verilir, aktivasyon bekleyen employee dahil; kısıtlı müdür ve admin kendi kaydına "hayır" alır (42501 + `authz.*`).
- **Nerede:** AVAIL-002 A2.4 ve Done when 7; işçi `local_91ac4f8d…`.
- **Ne zaman:** 2026-10-04 ~14:30Z (AVAIL-002 A1+A2 başlarken).
- **Ne için:** müsaitliği yalnız employee girer (M13); kişi ortak kaydı M2'ye göre tek kayıt.
- **Uygulamada etkisi:** Employee Hub → My availability yalnız employee rolündeki kişide çalışır; daveti kabul etmiş ama aktivasyonu süren çalışan da kendi haftasını girebilir; müdür / admin kendi kaydını yazamaz.
- **Dayanak:** KARARLAR M2, M13; ILKELER P19.
- **Geri alma:** kolay (matris hücresi).
- **Durum:** yürürlükte. Kayıt oturumu `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` yazdı (koordinatör `local_abc4d126…`'ın kararı, besleme #149).
- **Mert:** bilgi.

### KK-134 (2026-10-04) AVAIL-002 B yalnız veri ve yardımcılar; Warn kutusunun bağlanması C1'de
- **Karar (ne):** AVAIL-002-B soru 1 → (a). B (`nf-backend`) yalnız veri ve yardımcıları yapar: `schedule-conflicts.ts`'te müsaitlik ve not gerekçeleri, sunucu değerlendirmesinden gerekçe çıkaran yardımcı, not kartı verisi. Warn kutusunun bütün yazma yollarına (editör, sürükle-bırak, yapıştır, kopyala, şablon) bağlanması ve iki satırlı görünüm C1'de (`nf-arayuz`).
- **Nerede:** AVAIL-002 B (işçi `local_e4bbe6fe…`, dal `task/avail-002-b`) ve C1.
- **Ne zaman:** 2026-10-04 ~15:30Z.
- **Ne için:** dosya sahipliği: kutunun yazma yollarına bağlanması sunum katmanı; aynı dosyada iki rol çalışmaz.
- **Uygulamada etkisi:** A + B main'e girince Schedule bugünkü gibi davranır — müsaitlik için kutu açılmaz, ret yok; kutu C1 ile açılır. Ara hâl kullanıcıya bir şey kaybettirmez (müsaitlik zaten engellemiyor).
- **Dayanak:** koordinatörün görev mesajı + AVAIL-002 Touches + CLAUDE.md §4.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` yazdı (koordinatör `local_abc4d126…`'ın kararı, besleme #151).
- **Mert:** bilgi.

### KK-135 (2026-10-04) AVAIL-002'nin müsaitlik e2e senaryosu A + B ile aynı pencerede main'e
- **Karar (ne):** `e2e/flows/schedule-availability-warning.spec.ts` Publish'teki "I've seen this warning…" onay kutusunu arıyor (`:90`, `:117`); A'dan sonra kutu çıkmadığı için A + B main'e girince main CI e2e kırmızı olur. B işçisi aynı oturumda `nf-test` rolünü üstlenip spec'i aynı dalda günceller; A + B ile aynı pencerede main'e. D'nin bu parçası öne alındı.
- **Nerede:** dal `task/avail-002-b` (işçi `local_e4bbe6fe…`); commit `42eb11d6` "Publish lists an availability mark as a note and asks nothing" — ölçüldü.
- **Ne zaman:** 2026-10-04 ~15:40Z.
- **Ne için:** main'e kırmızı e2e ile girmemek (CLAUDE.md §2: main kırmızıysa push donar).
- **Uygulamada etkisi:** ekranda değişiklik yok; main CI e2e A + B gönderiminde yeşil kalır.
- **Dayanak:** ILKELER P19 (teknik sıra Claude'un), CLAUDE.md §4 (rol sırası; aynı dosyada iki rol aynı anda değil).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d8686bdf-c6dc-47ac-8e4f-6bb37f3b47bd` yazdı (koordinatör `local_abc4d126…`'ın kararı, besleme #152).
- **Mert:** bilgi.

### KK-136 (2026-10-05) Sayfa iskeleti piksel eşitliği DOC-TABLE'a dahil
- **Karar (ne):** Mert'in prototipteki "header ve içerik koordinatları piksel hassasiyetle aynı yerde olsun" ve "sekme gezerken header oynuyor" talimatı DOC-TABLE düzeltme turunda gerçek uygulamaya taşınır: başlık bloğu sabit yükseklik, sekme ve filtre satırları sabit; ölçüler KARARLAR Genel → "Liste sayfalarının ortak dili" → "Sayfa iskeleti". Ortak başlık bileşeninde yapılır; etkilenen başka ekranlar raporda adıyla.
- **Nerede:** dal `worktree-agent-aeafa368ff57306a2` (`nf-arayuz` düzeltme turu); KARARLAR `cc96650d`.
- **Ne zaman:** 2026-10-05 ~01:30Z.
- **Ne için:** aynı ekranlar ve aynı dosyalar; ayrı bir iş aynı dosyaları ikinci kez değiştirirdi.
- **Uygulamada etkisi:** Settings → Documents, Employees → Documents, Announcements, Important Dates, Notifications, Availability'de başlık, sekmeler ve filtre satırı her sayfada aynı yerde; sekme ya da dolu / boş geçişinde kaymaz. Örnek: Ayşe Employees → Documents'ta All'dan Missing'e geçince başlık yerinde kalır.
- **Dayanak:** Mert'in sözü (bu ekranlar için); CLAUDE.md §9 görsel tutarlılık; ILKELER P17 (aynı işle doğrudan ilgili görsel hata mevcut işe eklenir).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #175).
- **Mert:** bilgi.
- **Not (besleme #176):** DOC-TABLE dalı `worktree-agent-ab68e51d5764faab9`'e taşındı (ilk turun commit'leri yeniden uygulandı); eski dal `worktree-agent-aeafa368ff57306a2` main'e girişten sonra silinecek.

### KK-137 (2026-10-05) Announcements / Important Dates: düğme ve tablo stili DOC-TABLE'da, boş hâl FB-6.7'de
- **Karar (ne):** "New announcement" ve "New date" düğmelerinin adı ve yeri (filtre satırının sağ ucu, beyaz 36 px) ile ortak tablo stili DOC-TABLE'da yapılır; boş hâlin zemini ve metni eski zamanlama kararına göre FB-6.7'de kalır.
- **Nerede:** DOC-TABLE dalı `worktree-agent-aeafa368ff57306a2`; FB-6.7 dalı `task/fb-6.7-ui`.
- **Ne zaman:** 2026-10-05 ~01:30Z.
- **Ne için:** Mert'in DOC-TABLE onayı düğmeleri kapsıyor; boş hâl için "aynı dosya iki kez değişmesin" zamanlaması (KARARLAR 2026-10-04 ~22:03Z / ~22:05Z) yürürlükte.
- **Uygulamada etkisi:** DOC-TABLE main'e girince Announcements ve Important Dates'te ekleme düğmesi filtre satırının sağında; boş tablo FB-6.7'ye kadar bugünkü gibi beyaz.
- **Dayanak:** KARARLAR Duyurular → Announcements / Important Dates boş hâl maddeleri ve "Son hâl" ekleri; ILKELER P19 (iş sırası Claude'un).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #175).
- **Mert:** bilgi.
- **Not (besleme #176):** DOC-TABLE dalı `worktree-agent-ab68e51d5764faab9`'e taşındı (ilk turun commit'leri yeniden uygulandı); eski dal `worktree-agent-aeafa368ff57306a2` main'e girişten sonra silinecek.

### KK-138 (2026-10-05) Settings "Archive iki tık kırmızı" ayrı küçük iş (BL-595), DOC-TABLE'dan sonra
- **Karar (ne):** Mert'in 2026-10-05 ~01:05Z kararı (Settings satır menülerinde Archive iki tık kırmızı) DOC-TABLE'ın önünde değil; backlog'a BL-595 (leave: medium / do: safe, G15) olarak yazılır, DOC-TABLE bitince ayrı küçük iş olarak önerilir.
- **Nerede:** `apps/web/src/settings/` satır menüleri (BL-595'te dosya:satır).
- **Ne zaman:** 2026-10-05 ~01:30Z.
- **Ne için:** tek hat (CLAUDE.md §11.4): DOC-TABLE'ı bitirmeden kapsamı büyütmemek; CLAUDE.md §9 buton dili bunu zaten istiyor.
- **Uygulamada etkisi:** DOC-TABLE sırasında Settings'te Archive tek tık kalır; BL-595 yapılınca ilk tık kırmızı "Archive", ikinci tık "Confirm archive" olur.
- **Dayanak:** CLAUDE.md §11.4 (tek hat), §9 (buton dili); KARARLAR Settings → "Archive iki tık kırmızı".
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #175).
- **Mert:** bilgi.

### KK-139 (2026-10-05) Settings → Documents süzgeçle boş sekmenin metni
- **Karar (ne):** Settings → Documents'ta Draft / Published / Archived ya da süzgeç sonucu boşsa "No document types match these filters." / "Try another status or clear your search." yazılır (ekleme düğmesi yok); hiç belge türü yoksa "No document types" metni ve "New document" düğmesi kalır.
- **Nerede:** DOC-TABLE dalı `worktree-agent-ab68e51d5764faab9` (görsel QA düzeltme turu).
- **Ne zaman:** 2026-10-05 ~03:00Z.
- **Ne için:** görsel QA bulgusu: süzgeçli boş sekmede "add the first document" yazması yanıltıcı (BL-591 ile aynı kök).
- **Uygulamada etkisi:** Örnek: Ayşe Settings → Documents'ta Archived sekmesine geçer, arşivli belge yoksa "No document types match these filters." görür, ekleme düğmesi görmez.
- **Dayanak:** KARARLAR Employees → Documents boş metni ("No documents match these filters." / "Try another status or clear your search.") — benzeri; ILKELER P21 (kısa, tek mesaj).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #180).
- **Mert:** bilgi.

### KK-140 (2026-10-05) Availability saat aralığı workspace saat biçimine uyar
- **Karar (ne):** Availability ızgarasında saat aralığı workspace'in saat biçimi ayarıyla yazılır (bugünkü kısa biçim "6p – 10p" kalır), her aralık tek satır; KARARLAR örneği buna göre düzeltilir.
- **Nerede:** KARARLAR Availability → "Izgara kuralları"; uygulama dalda (`fb01bb36`).
- **Ne zaman:** 2026-10-05 ~03:00Z.
- **Ne için:** görsel QA sorusu: KARARLAR örnekleri uzun biçimdeydi ("7:00 AM – 9:00 AM"), ekran kısa biçim yazıyor; Mert'in istediği satır kırılmaması, biçim değil.
- **Uygulamada etkisi:** Ekranda değişiklik yok: "6p – 10p" gibi kısa biçim tek satırda kalır; 24 saat seçen workspace'te "18:00 – 22:00".
- **Dayanak:** Mert'in sözü ("time rangeler 2. satıra sarkmasın" — satır kırılması); Settings → Scheduling saat biçimi ayarı; ILKELER P19.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #180).
- **Mert:** bilgi.

### KK-141 (2026-10-05) Prototipin P1–P5 turu bitsin; birleştirme ve yayını kayıt oturumu yapar, sonra yeni tur yok
- **Karar (ne):** Mert'in başlattığı derin tur (P1 Workspace + Requests, P2 Employees + Documents + Availability, P3 Settings, P4 Notifications + Announcements + Important Dates, P5 Employee view + Account) yarıda durdurulmaz, biter. Bu turun birleştirmesini ve yayınını kayıt oturumu yapar (betikler ve son derleme onda); sonra koordinatöre tek rapor: her P'nin kapsamı ve sonucu, yayın sürümü, kırık kalan parça (P4 Announcements, P5 Employee view sol menü dahil), açık sorular. Bu turdan sonra yeni tur açılmaz; prototip devir notu turun sonuna göre yazılır, betikler ve kaynaklar `artifacts/prototype/` altında. Bağlam dolarsa kayıt oturumu önce koordinatöre söyler, turu yarıda bırakmaz.
- **Nerede:** prototip çalışma klasörü (kayıt oturumunun geçici klasörü) → `artifacts/prototype/` (git dışı); https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK.
- **Ne zaman:** 2026-10-05 ~05:35Z.
- **Ne için:** yarıda durdurmak parçaları kırık bırakır; Mert'in talimatıyla prototip planının sahibi koordinatör, kayıt oturumu kayıt rolüne döner.
- **Uygulamada etkisi:** gerçek uygulamada yok; prototipte tur bitince öteki sayfalar derin hâliyle yayınlanır.
- **Dayanak:** Mert'in talimatı (prototip planı koordinatörde, raporlar koordinatöre); CLAUDE.md §11.4 (iş sınırında durmak), §11.10 (bağlam dolarken sınırda devir).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #185).
- **Mert:** bilgi.

### KK-142 (2026-10-05) P turunun yayını, raporu, bulguları ve kanonik kopya
- **Karar (ne):** (1) P1–P5 bitince birleştirme, tam kontrol (`gen_app.py` ok / js ok / WARN yok, sweep, Schedule testleri, Q ve P testleri) ve tek sürüm yayını kayıt oturumunda; tek yayıncı kayıt oturumu; Q1–Q5'in x_* ekranları da bu yayına girer. (2) Yayından sonra koordinatöre tek rapor: sürüm no, her P'nin sonucu, kırık kalan, kontrol sonuçları. (3) Q ve P bulguları P turu bitince birlikte, gruplu backlog'a (45 Q + P2 tekil e-posta + P bulguları); her birinde tazelik kaynağı ajanın kontrol listesi. (4) Yayından sonra kanonik kopyayı koordinatör alır (robocopy /MIR → `artifacts/prototype/`); o andan sonra ajanlar oradan çalışır. (5) Kayıt oturumunun bağlamı yarıyı geçtiyse yayından sonra kayıt rolü için devir önerilir; prototip yayıncılığı yeni planda ayrı ele alınır. Yeni tur açılmaz.
- **Nerede:** prototip çalışma klasörü; https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK; inbox devir notu `20261005T053120-nf-planlama-kayit-20-prototip-devir.md`.
- **Ne zaman:** 2026-10-05 ~05:45Z.
- **Ne için:** tek yayıncı ve tek rapor; bulguların kaybolmaması; prototipin kalıcı yere taşınması.
- **Uygulamada etkisi:** gerçek uygulamada yok. Bilgi: bağımsız `local_91ac4f8d…` ("Prototip: eşlik denetimi") oturumu Schedule ve Q ekranlarını salt okuma ile gerçek uygulamaya karşı denetliyor; prototipe yazmıyor.
- **Dayanak:** KK-141; Mert'in talimatı (prototip planı koordinatörde); CLAUDE.md §11.10.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #186).
- **Ek (besleme #188, Mert kararı 2026-10-05, koordinatörün penceresinde, önerilen):** madde (3) değişti. Q turunun 45 gerçek uygulama bulgusu ve /welcome 404 yan bulgusu için backlog taslağını eşlik oturumu `local_91ac4f8d…` hazırlar. Taslak tazelik ölçümlü, BL numarasız, gruplu ve iki işaretli olur; yeri `artifacts/prototype/backlog-taslak/` (dosyalar ve seçim kuralı KK-143). /welcome 404'ün kök neden ölçümü de o oturumda. Kayıt oturumu numara verir ve BACKLOG'a ekler; P bulgularıyla aynı commit'te olabilir. Kayıt oturumunun 06:00Z'de başlattığı taslak alt ajanı durduruldu; dosya yazmamıştı. Dayanak: CLAUDE.md §5 adım 0 + kayıt oturumunun bağlam yükünü azaltma. Reddedilen: "Schedule düzeltme paketine başlasın", "beklesin".
- **Mert:** bilgi.

### KK-143 (2026-10-05) Q bulgularının backlog kaynağı ve iki taslak çakışınca seçim
- **Karar (ne):** Q turunun bulguları iki taslaktan backlog'a girer; numarayı kayıt oturumu verir.
  - **Q1, Q2 ve eşlik denetiminin yan bulgusu:** eşlik oturumunun dosyası `Q-bulgular-eslik-tumu.md` esas (ölçüm `e8df531c`). Eşlik oturumu, daraltma mesajı ulaşmadan 46 bulgunun hepsini yazdı.
  - **Q3–Q5:** bulguları yapan Q oturumunun dosyası `Q3-Q5-bulgular.md` esas (ölçüm `6326f23a`). Eşlik dosyasının Q3–Q5 kısmıyla karşılaştırılır. İşaret ya da birleştirme ayrışırsa daha güncel ve sağlam kanıtlı olan seçilir; seçim maddede yazılır.
  - **BL-481 / BL-495:** aynı kusursa birleştirilir; kararı kayıt oturumu verir ve kayıtta yazar.
  - **"Karar gerekir" maddeleri uygulama beklerken Mert'e sorulmaz.** Bunlar: Q1 D1 onay e-postasını yeniden gönderme, Q4 R11 resmî ad onayı beklerken görünüm, Q5 D8 herkese açık sayfaların dili. Maddede "karar gerekir" yazılı kalır.
  - **/welcome 404'ün kök nedeni ölçüldü; kod değil, örnek veri.** `supabase/seed.sql:143` owner'a "Pending Demo" workspace'inde `pending_activation` üyelik veriyor ama onboarding kaydını kurmuyor. Okuma P0002 veriyor, API 404 dönüyor. Öneri: seed satırı silinsin ya da kaydıyla kurulsun; koda tolerans eklenmez (CLAUDE.md "eski veri korunmaz"). `nf-db` için küçük iş; uygulama beklerken backlog'da durur.
- **Nerede:** `docs/plan/BACKLOG.md`; taslaklar `artifacts/prototype/backlog-taslak/` (git dışı).
- **Ne zaman:** 2026-10-05 ~07:15Z.
- **Ne için:** bulguyu yapan oturumun ölçümü esas olsun; iki taslak çakışınca seçim kanıta göre yapılsın ve görünsün.
- **Uygulamada etkisi:** yok; kayıt kuralı.
- **Dayanak:** KK-142 madde (3) ve Ek (#188); CLAUDE.md §5 adım 0, §11.7.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #189–#190).
- **Mert:** bilgi.

### KK-144 (2026-10-05) Prototipte liste ve Settings sayfaları geniş ekranda en çok 1320 px ve ortada; Inter değişken ağırlıkla
- **Karar (ne):**
  - **S1:** 1920 genişlikte liste sayfalarının ve Settings sayfalarının içeriği gerçek uygulamadaki gibi en çok 1320 px genişlikte ve ortada durur. Gerçek CSS ölçüldü: `.settings-page`, `.requests-page`, `.availability-page` `width: min(100% - 64px, 1320px)`; Employees ailesinin üç sınıfı `max-width: 1320px; margin: 0 auto` (`apps/web/src/styles.css:1091`, `:1107`, `:1395`, `:11947`, `:12110`, `:13482`). PROTO-P2-FIX gerçek uygulamada Employees'te x=437–1757 ölçtü. Prototipte kural panonun ortak CSS'inde (`gen_app.py`), sayfanın yan boşluğu olarak uygulanır; böylece çekmeceler ve katmanlar etkilenmez. `f_shell.py` kullanılmadı: çalışmadan önce sekiz parçayı eski yedeğinden geri yüklüyor, bu turun işini silerdi.
  - **S2:** pano Inter'i değişken ağırlıkla yükler (wght 400..800), böylece uygulamadaki 650 ve 750 ağırlıkları doğru görünür.
- **Nerede:** prototip çalışma klasörü (`gen_app.py`, şablon `NotifA.dc.html`); https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK.
- **Ne zaman:** 2026-10-05 ~13:16Z.
- **Ne için:** prototipin birebir kuralı. PROTO-P2-FIX S1/S2, PROTO-X-KARAR #24 ve SCHED-FIX'teki "Pazartesi kenarları" sorunu (olası neden: yazı tipi).
- **Uygulamada etkisi:** gerçek uygulamada yok. Prototipte geniş ekranda Employees'in içeriği x=320 yerine yaklaşık x=444'ten başlar; Settings'te 544 yerine 556'dan. Yazılar uygulamadaki kalınlıkta görünür.
- **Dayanak:** Mert'in birebir kuralı (2026-10-04), marka kararı (Inter), KARARLAR "Liste sayfalarının ortak dili" (1440'taki ölçüler değişmez).
- **Geri alma:** kolay.
- **Durum:** yürürlükte; S2 13:15Z'de, S1 ~13:16Z'de kayıt oturumunca uygulandı. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #196).
- **Mert:** bilgi.

### KK-145 (2026-10-05) Bu prototip yayınının kapsamı: yeni eşitleme turları sonraki sürüme
- **Karar (ne):** Bu yayın şunları içerir: mevcut parçalar, üç düzeltme turu (PROTO-SCHED-FIX, PROTO-P2-FIX, PROTO-EMP-SCHED), dört telefon panosu, KK-144 S1 (1320 ortalama) ve `checks/regress.js`. Workspace, Requests, Settings, Notifications, Announcements, Important Dates ve Account için açılacak gerçek uygulamaya birebir eşitleme turları bu yayına girmez, sonraki sürüme kalır.
- **Nerede:** prototip çalışma klasörü; https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK.
- **Ne zaman:** 2026-10-05 ~13:45Z.
- **Ne için:** yayın her yeni turu bekleyip uzamasın; kayıt oturumunun önerisi.
- **Uygulamada etkisi:** gerçek uygulamada yok. Prototipte bu yayın şimdiye kadar biten işlerle çıkar.
- **Dayanak:** KK-142 (tek yayın), kayıt oturumunun önerisi (2026-10-05 ~13:30Z), koordinatörün kabulü.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, besleme #197).
- **Mert:** bilgi.

### KK-146 (2026-10-05) FB-6.8'in puanı 9'dan 19'a: ölçülen kapsam tahmini ezer
- **Karar (ne):** FB-6.8'in (Ayarlar / hesap / workspace yaşam döngüsü) puanı 9 tahminden 19'a çıkar. Kaynak SEC-A1-TASARIM: A1 (BL-232 + BL-178) FB-6.8'in içinde ve dört rol adımıyla yaklaşık 19 puan tutuyor (`nf-db` 7 + `nf-backend` 6 + `nf-db` 4 + `nf-test` 2).
- **Nerede:** `docs/plan/ILERLEME-PLANI.md` (§0a madde 3, ilerleme tablosu, dilim tablosu); tasarım notu `docs/plan/tasks/FOUNDATION-B.md` Notes.
- **Ne zaman:** 2026-10-05 ~13:43Z.
- **Ne için:** ilerleme yüzdesi bilinen işi saysın. Biten iş azalmadı, kalan büyüdü. Aşama 6–7 183 / 262 (%69,8); önceki 183 / 252. Program 261 / 340 (%76,8).
- **Uygulamada etkisi:** yok; ilerleme kaydı.
- **Dayanak:** KK-114 ve FB-6.4'ün 11 → 17 emsali (ölçülen kapsam tahmini ezer); SEC-A1-TASARIM.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_863130bd…`'ın kararı, devirden önceki son karar; besleme #200).
- **Mert:** bilgi.

### KK-147 (2026-10-05) Kanonik prototip kaynağı repo dışında: newfork-prototype
- **Karar (ne):** Prototipin kanonik kaynağı `C:\Users\TheWe\Documents\Codex\newfork-prototype` (KANONIK.md). Yol: kayıt oturumunun geçici klasörü → `artifacts\prototype` → `newfork-prototype`, `robocopy /E /XF *state.json`. `/MIR` kullanılmadı: hedefte başka oturumların 1609 dosyasını (121 MB) silerdi; bayat kalan yalnız 11 eski görüntü. Geçici klasör ve `artifacts\prototype` dondu (DONDU.md). Yeni yerde gen_app aynı çıktıyı verdi (md5 `a7b1fc69…`, 40 parça). Geçici klasördeki App.dc.html 14:05Z'de Q oturumunun E-9005 düzeltmesiyle yeniden derlenmişti; md5'i yayın raporundakinden (`636f1d4f…`) farklı ve bu değişiklik sonraki yayına girer. KK-142 madde 4'ün yerine geçer.
- **Nerede:** `C:\Users\TheWe\Documents\Codex\newfork-prototype`; https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK.
- **Ne zaman:** 2026-10-05 ~17:35Z.
- **Ne için:** worktree oturumları ana klasöre (`artifacts\prototype`) Write / Edit ile yazamıyor (ölçüldü); prototip tek bir kalıcı yerde yaşasın.
- **Uygulamada etkisi:** gerçek uygulamada yok; prototip işleri artık newfork-prototype'tan yürür.
- **Dayanak:** KK-142 madde 4; CLAUDE.md §6 (kod kaybı olmaz).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_b9b956a0…`'ın kararı, besleme #203).
- **Mert:** bilgi.

### KK-148 (2026-10-05) Owner kurulumunda "Invitations go out when you finish setup." satırı kalkar
- **Karar (ne):** Owner kurulumunun "Add your team" adımındaki "Invitations go out when you finish setup." satırı kaldırılır; onay kutusunu tekrarlıyor.
- **Nerede:** prototip (owner kurulumu); gerçek uygulamada aynı metin varsa uygulama işiyle birlikte.
- **Ne zaman:** 2026-10-05 ~17:35Z.
- **Ne için:** kısa, tek mesajlı metin.
- **Uygulamada etkisi:** gerçek uygulamada yok (uygulama bekliyor); prototipte satır kalkar.
- **Dayanak:** ILKELER P20, P21.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_b9b956a0…`'ın kararı, besleme #203).
- **Mert:** bilgi.

### KK-149 (2026-10-05) Duyuru akış prototipinin sürüm 8 yayın reddi ayrı bir deneme artifact'inde incelenir
- **Karar (ne):** Duyuru akış prototipinin sürüm 8 yayını "artifact-pr-review … too large" ile reddedildi. Neden ayrı, özel bir deneme artifact'inde bulunur; Mert'in canlı adresine yalnız doğru derleme gider. İşi Q oturumu yapar.
- **Nerede:** duyuru akış prototipi (ayrı artifact).
- **Ne zaman:** 2026-10-05 ~17:35Z.
- **Ne için:** Mert'in gördüğü adres bozuk derlemeyle denenmesin.
- **Uygulamada etkisi:** gerçek uygulamada yok.
- **Dayanak:** KK-142 (tek doğru sürüm ilkesi).
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_b9b956a0…`'ın kararı, besleme #203).
- **Ek (besleme #206, koordinatörün aktardığı):** Q oturumu 8 denemede durdu; neden K19 Delete arayüzünün kodunda (boyut, simge ya da metin değil). Canlı sürüm 7 değişmedi. Deneme artifact'i https://claude.ai/artifact/MAhawwnFUcLTb7J8nqapyf (özel, 3 sürüm; silinmesi Mert'e). Mola yüzünden yeni deneme verilmedi; devam yolu Mert dönünce (§0c satır 76).
- **Mert:** bilgi.

### KK-150 (2026-10-05) Yayındaki duyuru düzenlenirken geçmiş "Publish at" denetlenmez
- **Karar (ne):** Yayındaki bir duyuru düzenlenirken kişinin değiştirmediği geçmiş "Publish at" tarihi denetlenmez; K20 (geçmiş tarih seçilemez) yalnız yeni seçilen tarihe uygulanır. Akış devir notunun 2/18. adımı geçerli kalır.
- **Nerede:** duyuru akış prototipi; gerçek uygulama işi FB-6.7.
- **Ne zaman:** 2026-10-05 ~17:35Z.
- **Ne için:** dokunulmayan alan yüzünden yayındaki duyuru kaydedilemez olmasın.
- **Uygulamada etkisi:** gerçek uygulamada henüz yok (FB-6.7 kalanında).
- **Dayanak:** KARARLAR K20; akış devir notu.
- **Geri alma:** kolay.
- **Durum:** yürürlükte. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_b9b956a0…`'ın kararı, besleme #203).
- **Mert:** bilgi.

### KK-151 (2026-10-05) Verilen prototip işleri (bilgi)
- **Karar (ne):** koordinatör şu işleri verdi: PROTO-PHONE-KARAR (`d8686bdf`), PROTO-X-KARAR-2 (`e4bbe6fe`), PROTO-ESIT-ACCOUNT (`59616a96`), PROTO-EXPORT-VAR (`5ffce2bb`), FB-6.7-AKIS-YAYIN (`575ba63c`), PROTO-ESIT-P4 (`10a5177a`), PROTO-ESIT-P1 (`d75967aa`), PROTO-ESIT-SET (havuzdan `863130bd`).
- **Durum:** bilgi. Kayıt oturumu `local_d96f34f3-0d4a-4e84-a44b-6b653641d258` yazdı (koordinatör `local_b9b956a0…`, besleme #203).

### KK-152 (2026-10-05) Mola: işi biten oturuma yeni iş verilmez; yoldaki işler biter
- **Karar (ne):** Mert'in talimatı (2026-10-05 ~17:35Z, koordinatörün penceresinde): "işi biten sessionlar rapor verince onlara tekrar iş verme. mola alacağız." Mola süresince "rapor gelince boş oturuma sormadan yeni iş ver" kuralı (koordinatör hafızası keep-sessions-busy, 2026-10-05) askıda. Yolda olan işler biter: PROTO-PHONE-KARAR (`d8686bdf`), PROTO-X-KARAR-2 (`e4bbe6fe`), PROTO-ESIT-ACCOUNT (`59616a96`), PROTO-EXPORT-VAR (`5ffce2bb`), FB-6.7-AKIS-YAYIN (`575ba63c`), PROTO-ESIT-P4 (`10a5177a`), PROTO-ESIT-SET (`863130bd`). PROTO-ESIT-P1 (Workspace + Requests; KK-151'de `d75967aa`) başlamadan park edildi — oturumun bağlamı %61 (koordinatörün aktardığı); dönüşte taze oturuma verilir.
- **Nerede:** koordinatörün oturum yönetimi; KK-151'deki iş listesi.
- **Ne zaman:** 2026-10-05 ~17:35Z (Mert'in talimatı); kayıt 17:37Z (`date -u`).
- **Ne için:** Mert mola veriyor; yeni iş açılmaz, yarım iş kalmaz.
- **Uygulamada etkisi:** yok; süreç kuralı.
- **Dayanak:** Mert'in talimatı (ILKELER dayanak sırası 1).
- **Geri alma:** Mert dönünce kalkar.
- **Durum:** yürürlükte (mola süresince). Kayıt oturumu `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` yazdı (koordinatör `local_b9b956a0…`, besleme #204).
- **Mert:** kendi talimatı.

### KK-153 (2026-10-05) Prototip için iki teknik not (bilgi; gerçek uygulama bulgusu değil)
- **Karar (ne):** (1) Bir sonraki Schedule eşitleme turunun görev metnine: `parts\schedule.css`'teki kapsamsız `.schedule-cell` kuralı başka parçalara sızıyor (EMP-SCHED turu `empview.css`'te sıfırladı); kaynakta Schedule kuralları `.schedule-page` altına alınır, öteki parçalarda sıfırlama yazılmaz. Önceki koordinatör `local_863130bd…`'dan; yalnız sohbette kalmıştı. (2) Prototip derleme kilidi tuzağı (telefon kabuğu işçisinden): `sched_lock.py` "already yours" dediğinde kilidin zamanını yenilemiyor; 15 dakikadan uzun tutulan kilit sessizce bayatlar. Uzun derlemede kilit bırakılıp yeniden alınır.
- **Nerede:** prototip kaynağı `C:\Users\TheWe\Documents\Codex\newfork-prototype` (KK-147). Prototip kurallarına (`KANONIK.md` / devir notu) eklenmesi gerekiyor; o dosyalar repo ve `docs/plan` dışında olduğu için kayıt oturumu yazmadı; koordinatör `KANONIK.md`'ye ekledi (satır 12–13, ölçüldü 2026-10-05 17:40Z, besleme #205).
- **Ne zaman:** 2026-10-05; kayıt 17:37Z (`date -u`).
- **Ne için:** iki bilgi yalnız sohbette kalıp kaybolmasın.
- **Uygulamada etkisi:** yok (yalnız prototip).
- **Dayanak:** CLAUDE.md §11.7 (ikinci kez gerekecek bilgi yazılır).
- **Geri alma:** —
- **Durum:** bilgi. Kayıt oturumu `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` yazdı (koordinatör `local_b9b956a0…`, besleme #204).
- **Mert:** bilgi.

### KK-154 (2026-10-05) Yarım iş varken prototip ayrı hazırlık kopyasında derlenip yayınlanır (sürüm 35)
- **Karar (ne):** Mert'in talimatı (~17:50Z, koordinatörün penceresinde): "biten herşeyi yayınla". Yarım işler aynı kanonik klasöre (`newfork-prototype`) yazdığı için yayın ayrı bir hazırlık kopyasında derlendi: `C:\Users\TheWe\Documents\Codex\newfork-prototype-stage` = 17:25'te dondurulmuş taban + yalnız biten işlerin dosyaları. Yayıncı koordinatör. Sürüm 35 (`1791223295-94d3`, ~17:58Z) içeriği: sürüm 33 + E-9005 / E-9039 sahte adresler + PROTO-X-KARAR-2 (+1, Welcome düğmesi, kurulum satırı) + PROTO-PHONE-KARAR (telefonda kart satırı iki panoda, Terminate / Restore) + PROTO-EXPORT-VAR (Export'ta zamanlanmış e-posta A / B, Mockup çubuğundan geçişli) + PROTO-ESIT-SET (Settings eşitleme E1–E3). Girmeyenler: PROTO-ESIT-P4 ve PROTO-ESIT-ACCOUNT (sürüyor), PROTO-ESIT-P1 (park, KK-152).
- **Kontroller (hazırlık kopyasında, koordinatörün aktardığı):** `gen_app` ok / js ok / WARN yok; sweep 46 / 46 temiz, ızgara 56 / 56; regress 175 / 0; PhoneManager sweep 23 / 23; PhoneManager2 `karar.json` temiz (`all.json`'daki s5 `.settings-jjobs` zaman aşımı önceden biliniyordu). `finalcheck` tam koşusu (~1 saat) yapılmadı. `canvas.json` gönderilmedi (düzen sürüm 33'le aynı). Önceki canlı `1791222679-ace0` içerikte sürüm 33'ün aynısıydı (karşılaştırıldı).
- **Nerede:** https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK; hazırlık kopyası `newfork-prototype-stage` (klasör var, son değişiklik ~17:59Z — kayıt oturumu ölçtü; sürüm ve kontroller ölçülmedi).
- **Ne zaman:** 2026-10-05 ~17:58Z; kayıt 18:02Z (`date -u`).
- **Ne için:** biten işler yarım işleri beklemeden Mert'e görünsün; yarım dosyalar yayına sızmasın.
- **Uygulamada etkisi:** gerçek uygulamada yok.
- **Dayanak:** Mert'in talimatı; KK-142 (tek doğru sürüm), KK-147 (kanonik kaynak).
- **Geri alma:** kolay (önceki sürüme dönülebilir).
- **Durum:** uygulandı. Kayıt oturumu `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` yazdı (koordinatör `local_b9b956a0…`, besleme #206).
- **Mert:** kendi talimatı.

### KK-155 (2026-10-05) Prototip iki artifact'e ayrıldı: Newfork Desktop ve Newfork Phone
- **Karar (ne):** Mert'in talimatı (~18:20Z, koordinatörün penceresinde): "desktop arayüzünü gösteren prototipi ayrı artifact olarak kaydet phonedan ayır". (1) Yeni "Newfork Desktop" https://claude.ai/artifact/VWK5TmCgVvicJ7EKoLcDCx (Design türü, özel): tek pano `App.dc.html` (1920×1080, "Prototip · Masaüstü"), içerik sürüm 35'teki masaüstü, açılış odaklı. (2) Eski adres https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK artık "Newfork Phone" (Mert sayfadan yeniden adlandırdı — `1791223672-d648` kaydı), sürüm 38: `App.dc.html` panosu ve dosyası çıkarıldı; 4 telefon panosu, yerleri ve Mert'in kanvas ayarları aynen kaldı; eski sürümler artifact geçmişinde. (3) Yayın kuralı: masaüstü yalnız Desktop'a, telefon panoları yalnız Phone'a. KK-141, KK-142, KK-145 ve KK-154'teki tek adres (`SmqEkab…`) bundan sonra bu iki adres demektir.
- **Nerede:** iki artifact; kural `C:\Users\TheWe\Documents\Codex\newfork-prototype\KANONIK.md` satır 18–19 (kayıt oturumu ölçtü, 18:25Z: iki adres ve dosya ayrımı yazılı; `Artifact list`'te "Newfork Desktop" ve "Newfork Phone" görünüyor). Sürüm numaraları ölçülmedi, koordinatörün aktardığı.
- **Ne zaman:** 2026-10-05 ~18:20Z; kayıt 18:25Z (`date -u`).
- **Ne için:** Mert masaüstü ve telefon prototiplerini ayrı açıp gezebilsin.
- **Uygulamada etkisi:** gerçek uygulamada yok.
- **Dayanak:** Mert'in talimatı.
- **Geri alma:** kolay (artifact geçmişi).
- **Durum:** uygulandı. Kayıt oturumu `local_abc4d126-c833-4c60-9b47-8dfe4bf0e1e1` yazdı (koordinatör `local_b9b956a0…`, besleme #207).
- **Mert:** kendi talimatı.

### KK-156 (2026-10-05) Prototip olduğu gibi bırakıldı; geliştirme gerçek uygulamada sürüyor; koordinatör dışındaki oturumlar kapatıldı
- **Karar (ne):** Mert (~18:30Z, koordinatörün penceresinde): "koordinator hariç bütün sessionları kapat. prototipi oldugu gibi bırak gerçek uygulamada geliştirmeye devam etmek istiyorum. çok vakit kaybettik". (1) Prototip (Newfork Desktop sürüm 2, Newfork Phone sürüm 38) ve kaynakları (`C:\Users\TheWe\Documents\Codex\newfork-prototype`, hazırlık kopyası `newfork-prototype-stage`, dondurulmuş `artifacts\prototype`) olduğu gibi kaldı; yeni prototip işi açılmaz. Yayınlanmamış biten iş: PROTO-ESIT-P4 (kanonik klasörde). Yarım kalan: PROTO-ESIT-ACCOUNT (durduruldu), P1 (hiç başlamadı), FB-6.7 akış v8 (yayın reddi). (2) Koordinatör dışında 19 newfork-clean oturumu arşivlendi (OPS-07'nin "arşiv yok" kuralına Mert'in açık talimatıyla tek seferlik istisna; 2026-10-04 toplu arşivi gibi). Öncesinde her worktree ölçüldü: kirli olan yalnız `friendly-blackwell` (nf-guvenlik hafıza notları; içerik main'de, worktree kopyası eski), main dışı commit'i olan yalnız `serene-heisenberg` (2 commit, `git cherry` boş → içerik main'de). `task/fb-6.7-ui` dalı (main dışı 16 commit) arşivden etkilenmedi, duruyor. "Prototip: Settings eşitleme" oturumu uygulamanın "kullanıcı için tutuyor" engeli yüzünden arşivlenemedi; Mert kenar çubuğundan kapatır. (3) Sıradaki iş gerçek uygulamada, devir notundaki sıra: SCHED-FIX (BL-607 ✓ `ba653646`, BL-606 sürüyor) → BL-562 → FB-6.4.
- **Nerede:** oturum listesi; bu dosya; BACKLOG BL-607.
- **Ne zaman:** 2026-10-05 ~18:30Z.
- **Ne için:** prototip turu gerçek uygulamaya göre fazla zaman aldı (Mert: "çok vakit kaybettik").
- **Uygulamada etkisi:** gerçek uygulamada iş yeniden başladı; ilk sonuç Schedule'daki "Keep editing?" penceresinde SAVE'in çalışması (BL-607).
- **Dayanak:** Mert'in talimatı (ILKELER P22: en güncel açık karar).
- **Geri alma:** oturumlar arşivden açılabilir; prototip dosyaları duruyor.
- **Durum:** uygulandı. Koordinatör `local_b9b956a0-10ef-4fc4-94c3-5ae26e8b6f6b` yazdı (kayıt oturumu kapandığı için doğrudan).
- **Mert:** kendi talimatı.

### KK-157 (2026-10-05) Ekran ekran ilerleme planı tek aktif plan; ilk ekran Schedule
- **Karar (ne):** Mert (~19:40Z, koordinatör `local_9c7e674a…`'nın penceresinde) ekran ekran ilerleme istedi: iskelet çıkarılır, bir ekran seçilip komple bitirilir, yolda çıkan backlog'a gruplu ve işaretli yazılır, hepsi bitince recap. Tıklamalı üç seçim, üçü de önerilen: (1) ilk ekran Schedule (dayanak ILKELER A + P02); (2) ekranın eski açık backlog maddeleri de o turda (dayanak P14 + P02); (3) ekran planı tek aktif plan; Takas (FB-6.4) Requests / Shift Hub'a, yayın öncesi güvenlik paketi ilgili ekranlara girer; ekrana bağlı olmayan CI işi (BL-562) yalnız main'i kırarsa araya girer (dayanak P17). Ek talimat (~19:55Z): keşif ajanlarının bulguları ekran ekran repoda saklanır → `docs/plan/ekranlar/<no>-<ekran>/`. BL-562'nin kök neden ölçümü yarıda bırakılıp maddeye yazıldı (`06a74d5a`).
- **Nerede:** `docs/plan/EKRAN-PLANI.md` (17 ekran, tur adımları, bitti tanımı, durum tablosu); `docs/plan/ekranlar/`.
- **Ne zaman:** 2026-10-05 ~19:40–19:55Z.
- **Ne için:** iş konu gruplarına dağılmak yerine ekran bazında bitsin; Mert her ekranın bittiğini görsün.
- **Uygulamada etkisi:** henüz yok; Schedule keşfi başladı (4 alt ajan: backlog/prototip `nf-planlama`, güvenlik `nf-guvenlik`, görsel `nf-gorsel-qa`, kod/davranış genel ajan).
- **Dayanak:** Mert'in talimatı ve seçimleri (P22). CLAUDE.md §1 hâlâ "Aktif program: FOUNDATION-B" diyor; değişikliği Mert onayı ister (CLAUDE.md §8), soruldu olarak açık.
- **Geri alma:** plan dosyası; FOUNDATION-B kaydı `ILERLEME-PLANI.md` ve `tasks/FOUNDATION-B.md`'de duruyor.
- **Durum:** uygulanıyor.
- **Mert:** kendi talimatı ve seçimleri.

### KK-158 (2026-10-05) Requests keşfinden sormadan verilen kararlar
- **Karar (ne):** EKRAN-02 özetindeki 7 sorudan üçü KARARLAR / ILKELER'le birebir kapsandığı için sorulmadan verildi: S2 belgesi eksik müdür Requests'i görür, oy veremez (Mert'in 2026-10-01 kararı, P22); S4 vardiya değişikliği bildirimi yalnız karar verecek lokasyon müdürüne, müdürsüz lokasyonda yedek admin / owner (P07); S6 Requests bu turda ortak liste diline geçer (KARARLAR "Liste sayfalarının ortak dili" + EKRAN-PLANI seçim 2). Özetin §6 önerileri de kabul (yıkıcı düğme iki tık, yol/dinlenme işaret, gerçek çakışmada kabul düşer, tek karar tek bildirim, metin düzeltmeleri, geçmiş izinde Revoke gizli, Shorten kapanırken sormaz, BL-508 bayat). Kalan dört soru Mert'e soruldu (S1, S3, S5, S7).
- **Nerede:** KARARLAR "Schedule → Requests"; `docs/plan/ekranlar/02-requests/OZET.md` §10.
- **Ne zaman:** 2026-10-05 ~22:00Z.
- **Ne için:** Mert'e yalnız kuralın cevaplamadığı soruları sormak (CLAUDE.md §13).
- **Uygulamada etkisi:** henüz yok; Requests turunun görev dosyasına girer.
- **Dayanak:** yukarıda her biri için.
- **Geri alma:** KARARLAR satırları; Mert ters çevirirse "ters çevrildi" yazılır.
- **Durum:** kayda geçti, uygulama bekliyor.
- **Mert:** görmedi; iş raporunda "Senin yerine verdiğim kararlar" listesinde gösterilir.

### KK-159 (2026-10-06) Koordinatör işçi değil; alt ajan yok; main'e işi yapan oturum gönderir; görev dosyasını planlama oturumu yazar; 2 dk bekçi
- **Karar (ne):** Mert'in talimatı (~01:35Z, koordinatörün penceresinde): "koordinatör olarak bu sessionda (şuan çalışan 3 agent hariç) bir daha asla işçi olarak çalışmanı istemiyorum. Sadece plan yapacaksın, logları tutacaksın, ilerlemeyi takip edeceksin, diğer sessionlara taskleri delege edeceksin, do ve don'tsları belirleyeceksin, mvpye hazırlık yapacaksın, dokümantasyon yapacaksın. İlerleyişin hızından, efficient oluşundan, kalitesinden ve agentları/sessionları kontrol etmeden ve benimle iletişim kuran tek kişi olmaktan sorumlu olacaksın." Aynı turda üç tıklamalı seçim, üçü de önerilen: (1) koordinatör alt ajan çağırmaz, inceleme ve görsel QA dahil her iş oturuma gider; (2) main'e işi yapan oturum, koordinatörün açık "gönder" izniyle gönderir, koordinatör sonra commit'i ve main CI'ı kontrol eder; (3) ayrıntılı görev dosyasını planlama oturumu yazar, koordinatör çerçeveyi koyar ve onaylar. Ek talimat (~01:40Z): "mailboxu her 2dk'da bir kontrol edeceksin. Eğer bir session (idle beklediğinden eminsen sorun yok) 20dk boyunca hiç iletişim kurmazsa, akıbetini kontrol etmek için o sessionı gidip bizzat sen kontrol edeceksin."
- **Nerede:** `DELEGASYON.md` (baştan yazıldı: §1 ilke, §3 sınıflarda "yazan", §4 adım 5, §6); `CLAUDE.md` §3 (koordinatör tanımı, "Her iş bir oturumda koşar", el kitabına bekçi), §4 (koordinatörün dosyaları), §5 adım 0/2/4/5/6/7, §6 (main'e gönderme), §11.10.
- **Ne zaman:** 2026-10-06 ~01:35–01:50Z.
- **Ne için:** koordinatörün bağlamını plan, kayıt ve denetime ayırmak; Schedule görev dosyası alt ajanla ~320 bin, Requests ~370 bin token harcadı.
- **Uygulamada etkisi:** ekranda yok. Süreçte: koordinatör kod, ölçüm, test, ekran görüntüsü yapmaz; her iş havuz ya da rol oturumuna gider; bekçi döngüsü (120 sn) okunmamış raporda ya da 20 dk sessiz "working" oturumda koordinatörü uyandırır. İlk bekçi turunda ölü bir oturumun artık heartbeat'i (`e9d6534f…`, worktree silinmiş, son commit `6358125b` main'de) `.newfork-inbox/status-stale/`'e taşındı.
- **Dayanak:** Mert'in açık talimatı (ILKELER dayanak sırası 1).
- **Geri alma:** iki dosyanın bu commit'ten önceki hâli (`9bb4373a`).
- **Durum:** yürürlükte. 09-29 kararının "koordinatör kendisi yapar" varsayılanı ters çevrildi.
- **Mert:** kendi talimatı ve seçimleri.

### KK-160 (2026-10-06) İki ekranın görev dosyaları main'e; yerel oturum dosyaları silindi
- **Karar (ne):** `docs/plan/tasks/EKRAN-01-SCHEDULE.md` (19 dilim) ve `docs/plan/tasks/EKRAN-02-REQUESTS.md` (11 dilim, FB-6.4 dahil) bu devrin ilk işinde, KK-159'dan önce başlatılmış iki `nf-planlama` alt ajanıyla yazıldı ve main'e alındı. Mert'in seçimiyle yerel test girişlerinin 11 `*state.json` dosyası silindi (soruda 10 dendi; listeleme kesikti, koordinatörün hatası).
- **Nerede:** iki görev dosyası; `.temp/`, `artifacts/` (git dışı).
- **Ne zaman:** 2026-10-06 ~01:20–01:45Z.
- **Ne için:** ekran planının 4. adımı.
- **Uygulamada etkisi:** ekranda yok. Açık sorular: Schedule 6, Requests 2 (Mert'e); Requests Q3 (kenar rengi tek yerde) koordinatörde.
- **Dayanak:** EKRAN-PLANI "Bir ekranın turu" madde 4 (onaylı planın sıradaki adımı, CLAUDE.md §11.3).
- **Geri alma:** dosyaları silen commit.
- **Durum:** görev dosyaları onay bekliyor; dilimler Mert'le plan konuşmasından sonra oturumlara verilecek.
- **Mert:** silmeyi seçti; görev dosyalarını henüz görmedi.

### KK-161 (2026-10-06) Schedule ve Requests paralel, hatlara göre; varyantlar kodlamayla aynı gün başlar
- **Karar (ne):** Mert iki soruyu koordinatöre bıraktı ("en doğru kararı sen ver"). (1) İki ekran paralel yürür, işler ekrana göre değil hatta göre dağılır: veri hattı (tek `nf-db`), web hattı (tek `nf-backend`), arayüz hattı (tek `nf-arayuz`), planlama (havuz). İlk veri işi EKRAN-02 A0 (Requests "Older" sayfalaması talep kaybediyor). (2) Görsel varyantlar kodlamayla aynı gün başlar ve görsel dilimlerden önce Mert'e gösterilir; veri ve oturum dilimleri seçimi beklemez.
- **Nerede:** `docs/plan/EKRAN-PLANI.md` "Uygulama düzeni: hatlar".
- **Ne zaman:** 2026-10-06 ~02:00Z.
- **Ne için:** iki veri oturumu aynı yetki/test dosyalarında ve tek makinede birbirini keser; varyantı kodun önüne koymak veri hattını boşuna bekletir, arkasına koymak görsel dilimde yeniden iş doğurur.
- **Uygulamada etkisi:** ekranda henüz yok; üç hat oturumu açılır.
- **Dayanak:** Mert'in açık devri; CLAUDE.md §3 (en çok iki ağır iş), §4 (aynı dosyaya iki rol); ILKELER P04, P17 (hızlanmak işi bölmektir).
- **Geri alma:** ikinci veri oturumu ölçüme göre açılır; hat düzeni EKRAN-PLANI'da değişir.
- **Durum:** yürürlükte.
- **Mert:** kararı koordinatöre bıraktı; raporda gösterildi.

### KK-162 (2026-10-06) Görev dosyalarındaki dört soru sorulmadan cevaplandı
- **Karar (ne):** KARARLAR / ILKELER birebir kapsadığı için: EKRAN-01 Soru 1 (kilidi düşenin işi "Auto-save" adlı ayrı taslak, ikisine tek satır, bildirim yok), Soru 3 (Replace iki tık, ilk tıkta etki yazısı; P22), Soru 4 (BL-362 Requests turuna; P18); EKRAN-02 Q2 (belgesi eksik müdür iki sekmeyi görür, kararlar kapalı), Q3 (kenar rengi token'ı tek yerde C3'te, S7 seçimine bağlı; BL-450 C3'ü bekler). Mert'e dört soru soruldu: üç renk (a), Undo kaydedileni geri almaz (a), Shift changes View kalır (a); e-posta haftası "kapsam dışı" (BL-437 notu).
- **Nerede:** KARARLAR "Schedule" ve "Schedule → Requests"; iki görev dosyasının soru bölümü; BL-437.
- **Ne zaman:** 2026-10-06 ~02:00Z.
- **Ne için:** Mert'e yalnız kuralın cevaplamadığı soruları sormak (CLAUDE.md §13).
- **Uygulamada etkisi:** henüz yok; ilgili dilimlere girer.
- **Dayanak:** yukarıda her biri için.
- **Geri alma:** KARARLAR satırları; Mert ters çevirirse "ters çevrildi".
- **Durum:** kayda geçti.
- **Mert:** raporda "Senin yerine verdiğim kararlar" tablosunda gördü.
- **Açık nokta:** e-posta haftası "kapsam dışı" cevabının yalnız hafta kuralını mı yoksa Export e-posta panelini (W-3) de mi kapsadığı; W-3 başlamadan Mert'e tek satırla sorulur.

### KK-163 (2026-10-06) Ekran turunun uygulama raporları repoda arşivlenir ve ekran kapanınca damıtılır
- **Karar (ne):** Mert (~03:05Z): oturumlara verilen inceleme işlerinin sonuçları hem plan için kullanılsın hem repoda belge olarak kalsın; "formatı, konumunu, adını, içeriğini sen belirle… you can roast me". Koordinatörün biçimi: dilim başına `docs/plan/ekranlar/<no>-<ekran>/uygulama/<dilim>.md` (künye + "Sonrası için" en çok 5 madde + rapor + incelemeler olduğu gibi), işi yapan oturum kendi dilim commit'ine ekler; ekran kapanınca koordinatör "Sonrası için" maddelerini rol hafızasına, KARARLAR'a ve backlog'a taşır, OZET'e "Uygulama kaydı" tablosu yazar. Mert'e söylenen eleştiri: ham rapor okunmaz, değer dersin kendiliğinden okunan yere taşınmasında; kodu anlatan kısım ilk eskir, bu yüzden arşiv tarihli kalır.
- **Nerede:** `docs/plan/EKRAN-PLANI.md` "Uygulama arşivi ve damıtma"; `CLAUDE.md` §10.
- **Ne zaman:** 2026-10-06 ~03:10Z.
- **Ne için:** harcanan token ve zamanın bulguları kaybolmasın; bir sonraki oturum aynı tuzağa düşmesin.
- **Uygulamada etkisi:** ekranda yok; her dilim commit'ine bir belge dosyası eklenir (ek gönderim yok).
- **Dayanak:** Mert'in talimatı ve biçimi koordinatöre bırakması.
- **Geri alma:** EKRAN-PLANI bölümü ve CLAUDE.md §10 satırı.
- **Durum:** yürürlükte; A0 (kuraldan önce gönderime çıktı) arşivini veri hattı bir sonraki dilim commit'iyle ekler.
- **Mert:** talimat onun; biçim koordinatörün.

### KK-164 (2026-10-06) Düzenlerken başka haftaya geçiş: o hafta görünüm modunda, düzenleme açık kalır
- **Karar (ne):** W-1a raporundaki ürün sorusu (D-Y4'ün ikinci yarısı) sorulmadan cevaplandı: (a). Bkz. KARARLAR "Schedule".
- **Nerede:** KARARLAR "Schedule"; uygulama EKRAN-01 W-1b.
- **Ne zaman:** 2026-10-06 ~03:10Z.
- **Ne için:** kural birebir kapsıyor; Mert'e yalnız kapsanmayan sorular gider (CLAUDE.md §13).
- **Uygulamada etkisi:** W-1b sonrası Schedule → Edit → "Next week" boş ızgara yerine o haftanın görünümünü açar.
- **Dayanak:** ILKELER P10 + A bölümü anti-hedef (ek onay adımı yok).
- **Geri alma:** KARARLAR satırı; Mert ters çevirirse "ters çevrildi".
- **Durum:** kayda geçti, W-1b'de uygulanacak.
- **Mert:** raporda "Senin yerine verdiğim kararlar"da gösterilir.

### KK-165 (2026-10-06) Mert'le çalışmanın beş kuralı ve dört iş akışı eki
- **Karar (ne):** Mert (~03:20Z): koordinatör bir isteği uygulamadan önce (1) sorularla netleştirir, (2) isteğin mantığını ve daha iyi yolunu sorgular, israf ya da zararlıysa dürüstçe söyler, (3) hedef / kapsam / planı önce kararlaştırır, (4) her işin sonunda en sade Türkçeyle rapor verir (öncesi / sonrası, tablo, 🟢🟠🔴, uygulamadaki yer, ekran görüntüsü, kopyalanabilir yol), (5) bunları gösteriş için değil gerçek bulgu için yapar. Netleştirme turunda üç seçim (üçü önerilen): ölçek işin boyuna göre; tam rapor iş sonunda, arada 2–3 satır; kapsam koordinatör + oturum raporlarının dili. Mert'in "iş akışına eklemek istediğin bir şey var mı" sorusuna koordinatörün dört önerisi, dördü seçildi: A dürtme mesajı yok (30 dk cevapsızlık hariç); B R0–R2'de ONAY + tam kapı + Done when tamamsa oturum izin beklemeden gönderir, R3 ve canlı migration izinle; C raporun başında koordinatör için 5 satır; D hattı durdurmayan sorular birikir, üçü geçince ya da "soru turu"nda gelir.
- **Nerede:** `CLAUDE.md` §3 (posta kutusu), §5 adım 6, §6 (main'e gönderme), §10, §11.2, §11.12.
- **Ne zaman:** 2026-10-06 ~03:20–03:40Z.
- **Ne için:** sorgusuz uygulama yerine ortak karar; hatların koordinatörü beklememesi; koordinatör bağlamının yavaş dolması.
- **Uygulamada etkisi:** ekranda yok; süreçte R0–R2 dilimleri koordinatörü beklemeden main'e girer.
- **Dayanak:** Mert'in talimatı ve seçimleri. B, KK-159'daki "her gönderim izinle" seçimini R0–R2 için gevşetti (Mert seçti).
- **Geri alma:** CLAUDE.md'nin bu commit'ten önceki hâli.
- **Durum:** yürürlükte.
- **Mert:** kendi talimatı ve seçimleri.

### KK-166 (2026-10-06) Varyant turunun 1. bölümü ve BE-2 sorusu: sorulmadan verilen dört karar
- **Karar (ne):** (1) Publish özetinin metni: "1 shift needs a fix before you can publish. 1 more to review." (Mert "developer dili olmasın, sen bul" dedi). (2) "Telefon" ölçüsü 768 px (mevcut mobil sınır). (3) Telefon düzeni sorusu (C-P2) Mert'in "Schedule telefonda tamamen kapalı" kararıyla düştü; W-5 bu kararın uygulamasına döner. (4) BE-2: haftalık e-postada kısmi teslim kapanma sayacına girmez (P09). Mert'in kendi seçimleri ve tarifi KARARLAR "Schedule"da: telefonda kapalı (ters seçim), müsaitlik/izin hücre gösterimi (seçenek dışı), ad "!" Durum 1, Publish özeti üstte. Açık: dar pencere üst çubuğu (BL-445) — Mert görsel olarak görmek istedi, dört görüntü gönderildi; hız testi (BL-562) — Mert "50 ile 80 ms arasında hissedilir fark var mı?" diye konuşmak istedi, cevap verildi, karar bekliyor.
- **Nerede:** KARARLAR "Schedule"; ILKELER A "Cihaz" ve P04 kanıtı; BACKLOG BL-756.
- **Ne zaman:** 2026-10-06 ~04:20–05:10Z.
- **Ne için:** Mert'e yalnız kuralın cevaplamadığını sormak (CLAUDE.md §13).
- **Uygulamada etkisi:** henüz yok; web hattı telefonda kapalı Schedule'ı, arayüz hattı yeni hücre modelini varyant olarak kuracak.
- **Dayanak:** (1) Mert'in "sen bul"u + P21; (2) P19; (3) Mert'in kararı; (4) ILKELER P09.
- **Geri alma:** KARARLAR satırları.
- **Durum:** kayda geçti.
- **Mert:** raporda "Senin yerine verdiğim kararlar"da gösterilir.

### KK-167 (2026-10-06) Uygulama sırasında sorulmadan verilen kararlar ve ayrımlar
- **Karar (ne):** (1) Availability düğmesi kapalıyken yeni hücre modelinde turuncu her şey gizlenir, TIME OFF kalır (M8, M10/S1). (2) BE-2b: kısmi teslim ardışık başarısızlık sayacını sıfırlar ("yalnız tam başarısızlık sayılır"); işin veritabanı kısmı veri hattına (BE-2b-DB). (3) TEL-KAPALI-2: telefonda Schedule'a götüren sayfa içi bağlantılar gizlenir (Mert'in "tamamen kapalı" kararı). (4) Kırmızı main ayrımları: üç kez kod değil yük (50 ms testi 67/57 ms; TEL-KAPALI e2e zaman aşımları pc-2; ShiftQuickEditor 1181 ms) — koda düzeltme yazdırılmadı, yalnız düşen iş yeniden koşturuldu; kalıcı çözüm CI-HIZ (Mert'in seçimi). (5) M2 metni ölçümle düzeltildi (müdür çalışanın müsaitliğini yazamaz; kod zaten böyle). (6) Müsaitlik "!" penceresinde "by" her zaman çalışan (yalnız çalışan yazar).
- **Nerede:** KARARLAR "Schedule" ve "Ürün kuralları → Müsaitlik" M2; BACKLOG BL-101, BL-562, BL-756, BL-757; DONE.
- **Ne zaman:** 2026-10-06 ~05:00–06:40Z.
- **Ne için:** Mert'e yalnız kuralın cevaplamadığını sormak; kırmızıyı koda yüklemeden ayırmak (CLAUDE.md §11.9).
- **Dayanak:** her biri için yukarıda.
- **Geri alma:** KARARLAR satırları.
- **Durum:** kayda geçti.
- **Mert:** devir raporunda "Senin yerine verdiğim kararlar"da.

### KK-168 (2026-10-06) DB-2 sırası ve ad "!" okuması
- **Karar (ne):** (1) DB-2 (Schedule canlı kanalı lokasyon başına; R3) API ve web parçasını beklemeden main'e ve canlıya girer; aradaki sürede Schedule başka müdürün kaydında kendiliğinden yenilenmez, HTTP yeniden çekme sürer. Web hattı API yayınını ve W-1b aboneliğini hemen, DB-2 sözleşmesiyle başlatır; boşluk web hattının bir sonraki gönderimiyle kapanır. Veri hattının önerisi "üçü tek pencerede" idi; reddedildi. (2) Ad "!" gün sayımında izin (TIME OFF) sayılmaz.
- **Nerede:** EKRAN-01 DB-2 (`task/ekran-01-db-2`, `d271cd09`, `nf-guvenlik` ONAY @bcfbb0a5); KARARLAR Schedule.
- **Ne zaman:** 2026-10-06 ~07:15Z.
- **Ne için:** (1) Canlı kullanıcı yok; dal üstüne dal kurup üç parçayı aynı pencereye sıkıştırmak (ILKELER P01'in reddettiği aşamalı geçiş töreni) web hattını bekletir. Güvenlik tarafı sıkılaşıyor, açık yok; tek etkisi geçici yenileme kaybı. (2) İzin ayrı kavram (kırmızı TIME OFF), "!" turuncu müsaitlik.
- **Dayanak:** (1) ILKELER P01 + P15; koordinatör diff'in riskli kısmını okudu (iki politika: konu deseni ^…$ ile tam, uuid dönüşümü desen tuttuktan sonra, yazma yalnız presence). (2) KARARLAR Müsaitlik M8 / M10.
- **Geri alma:** (1) yeni migration ile eski politika; (2) KARARLAR satırı.
- **Durum:** kayda geçti.
- **Mert:** raporda "Senin yerine verdiğim kararlar"da.

### KK-169 (2026-10-06) Employees keşif önerileri K1–K12 ve iki Schedule okuması
- **Karar (ne):** (1) EKRAN-03 OZET §3'teki K1–K12'nin hepsi verildi (KARARLAR Employees, tek satır). K5 için ayrıca KARARLAR "Preferred name → Manager approval" satırına bakıldı: onaylayan müdür, bildirim de ona. (2) Schedule "!" penceresinde "Changed after publishing" satırı kalır (K18 + M11; arayüz hattının sorusu). (3) Çok vardiyalı hücrede kısmi çakışmanın ad "!"ini tetiklememesi Mert'e soruldu, onaylandı.
- **Nerede:** KARARLAR "Employees", "Schedule"; OZET §9.
- **Ne zaman:** 2026-10-06 ~07:30–07:50Z.
- **Ne için:** Mert'e yalnız kuralın cevaplamadığını sormak (CLAUDE.md §13); 12 önerinin her biri bir KARARLAR satırına ya da ilkeye birebir dayanıyor.
- **Dayanak:** OZET §3'te her önerinin yanında; (2) KARARLAR K18 (Mert 2026-10-02).
- **Geri alma:** KARARLAR satırları.
- **Durum:** kayda geçti.
- **Mert:** raporda "Senin yerine verdiğim kararlar"da.

### KK-170 (2026-10-06) Restore'da geçerli belge, DB-3 çift okuması
- **Karar (ne):** (1) "Invite to a new email" ile geri dönen kişide süresi dolmamış onaylı belge sayılmaya devam eder; süresi dolmuş ya da eksik olan yeniden istenir; politika imzaları yeni hesapla baştan. Mert "claude karar versin. profesyonel kurumsal bir saas için hangisi olmalı" dedi. (2) S1-restore.md'deki kurala dayanan yedi senaryo ve üç teknik karar kabul. (3) DB-3: şablon Replace lokasyon ve departmanı çift olarak eşler (veri hattının okuması), KARARLAR satırı düzeltildi.
- **Nerede:** KARARLAR "Employees" (Restore satırı), "Schedule" (Overwrite satırı).
- **Ne zaman:** 2026-10-06 ~08:45Z.
- **Ne için:** (1) Belge çalışan kaydının, hesabın değil; işveren onu zaten incelemiş. Geçerli gıda kartını yeniden istemek "kurumsal hantallık" (ILKELER A anti-hedef). ABD'de I-9'da da işe yeniden alınan kişi için (3 yıl içinde) mevcut kayıt kullanılabiliyor; süresi dolan yeniden doğrulanır. İmza ise kişinin hesabına bağlı beyan: yeni hesap yeniden imzalar. (3) ILKELER P09.
- **Dayanak:** ILKELER A anti-hedefler + P09; Mert'in "poliçe imzalama sıfırlanır"ı.
- **Geri alma:** KARARLAR satırları.
- **Durum:** kayda geçti.
- **Mert:** sohbette söylendi.

### KK-171 (2026-10-06) Edit'te "changed after publishing" kişiye bağlı; Undo sunucuda tek adım; veri hattı sırası
- **Karar (ne):** (1) Edit modunda vardiyanın kişisi yayındakinden farklıysa `availability_changed_after_publish` false (Emre'nin Salı'sı Ali'ye verilince işaret kalkar). (2) W-1b S2: Undo sunucuda tek ve bölünmez "son adımı geri al" yoluyla geri alır (DB-1c, veri hattı); web yalnız ekranla sırayla tekil işlem göndermez. (3) Veri hattı sırası: DB-1c, EKRAN-02 A1'den önce (ekran planı: ekran 1 komple biter; W-1b'yi kapatır).
- **Nerede:** VAR-UYG-DB-2 (main `c8294ccb`, canlı `20261007110000`); görev dosyası EKRAN-01 DB-1c.
- **Ne zaman:** 2026-10-06 ~09:35–10:10Z.
- **Ne için:** (1) İşaret yayındaki kişinin işaretiydi; başka kişinin kartında yanlış bilgi olur. (2) Şablon, Auto-fill, yapıştırma tek Undo adımında 24 vardiyaya dokunabiliyor; tekil işlemler yarıda kalırsa ekran ve kayıt ayrışır.
- **Dayanak:** (1) KARARLAR K18 + ILKELER P11; (2) KARARLAR Schedule "Undo sunucuda da geri alır" + görev dosyası DB-1c (atomik geri dönüş) + P19; (3) EKRAN-PLANI.
- **Geri alma:** (1) yeni migration; (2)–(3) sıra değişikliği.
- **Durum:** kayda geçti.
- **Mert:** sohbette söylendi (Undo).

### KK-172 (2026-10-06) Liste düzeni Sistem 1; yeşil ekleme düğmesi hemen; aralıklı kırmızının kökü kodda çıktı
- **Karar (ne):** (1) Mert'in Sistem 1 (C) seçimi ve Requests tek tablo isteği arayüz hattına VAR-ART-LIST-2 olarak verildi: artifact güncellenir, öteki sistemler kalkar; önerilen tek sekme satırı Needs review / In progress / Closed, ortak sütunlar Employee, Type, When, Decide by, Status, Review. (2) Mert "Hemen, tek küçük işle" dedi: LIST-YESIL (R1, arayüz hattı) Settings → Documents, Announcements, Important Dates ekleme düğmelerini ve boş hâl düğmelerini yeşile çevirir; `styles.css`'e dokunmaz (web hattında). (3) VAR-UYG-KIRMIZI: main CI 37443040170'daki aralıklı kırmızı yük değil, kod çıktı (Publish menüsünün dışarı-basış dinleyicisi pencere içindeki basışı dışarı sayıyordu); arayüz hattı kırmızı testle düzeltti, main `88f5e7a1` (R1, izinsiz gönderim).
- **Nerede:** KARARLAR Genel → "Liste sayfalarının ortak dili", Employees G1, Schedule → Requests; BACKLOG BL-757, BL-760.
- **Ne zaman:** 2026-10-06 ~10:20–10:30Z.
- **Ne için:** (1)–(2) Mert'in seçimi; ortak dil bütün liste sayfalarında tek. (3) "Yük" sınıflandırması kodun gerçek yarışını gizleyecekti; sınıflandırma görevi kökü buldu.
- **Dayanak:** Mert'in 2026-10-06 seçimi; CLAUDE.md §9 düğme dili; §11.9 kırmızı ayrımı.
- **Geri alma:** KARARLAR satırları; LIST-YESIL tek commit.
- **Durum:** (1)–(2) arayüz hattında sırada; (3) main'de, CI 37449526408 izleniyor.
- **Mert:** sohbette söylendi.

### KK-173 (2026-10-06) DB-1c gönder + canlı izni; Requests'in küçük kararları; giriş zaman aşımı test kurulumunda
- **Karar (ne):** (1) EKRAN-01 DB-1c (Undo sunucuda): R3 gönder izni ve canlı migration izni (`20261007120000`), main yeşil olunca; önce tam test:db, canlıda yedek + md5 + advisors + SELECT. Riskli kısmı koordinatör okudu: servis security definer + boş search_path, sahip kontrolü, `authorize(edit.location_ids)`, revizyon/kira kontrolü, belge kuralı; tablo `app_private`, RLS açık, grant'lar kapalı. Üç Düşük not ve yayın kontrolü backlog'a (BL-761, BL-762), şimdi düzeltilmez. (2) Requests: Open shift dördüncü tür; tür adı "Cover"; Open shift satırında boş vardiya işareti; When tek tarih biçimi; Closed en yeni karar üstte; açık sekmeler istemcide iki listeyi birleştirir, Closed'un sayfalaması sunucuda tek okuma yolu ister (ayrı dilim, `nf-backend`, yetki iki kapıyı ayrı uygular). (3) VAR-E2E-GIRIS: iki giriş zaman aşımı kod değil, test gövdesindeki eşzamanlı SQL kurulumu + yük; düzeltme (BL-763, R0, yalnız test dosyası) arayüz hattına LIST-YESIL'den sonra, nf-test kurallarıyla; CI sırası (BL-764) BL-763'ün ölçümünden sonra. (4) W-1b CI 37452022042: yalnız düşen e2e yeniden koşturuldu (web hattı).
- **Nerede:** EKRAN-01 DB-1c (dal `task/ekran-01-db-1c` @86cfd059); KARARLAR Schedule → Requests ve Genel → "Liste sayfalarının ortak dili"; BACKLOG BL-761…BL-764.
- **Ne zaman:** 2026-10-06 ~10:50–11:10Z.
- **Ne için:** (1) Ekran 1'in son veri dilimi; Undo ekran ve kayıt ayrışmadan geri alır. (2) Open shift talebi Requests'ten çıkarsa hiçbir yerde görünmez (P09); iki küçük düzeltme görsel tutarlılık (§9). (3) Kırmızı main bütün gönderimleri donduruyor; bugün üç kez.
- **Dayanak:** DELEGASYON §3 (R3); ILKELER P09, P19; CLAUDE.md §9, §11.4 (işin önündeki), §11.9.
- **Geri alma:** (1) canlıda yedekten fonksiyonlar + yeni migration; (2) KARARLAR satırı; (3) test commit'i.
- **Durum:** (1) main yeşilini bekliyor; (3) arayüz hattında sırada.
- **Mert:** sohbette söylendi.

### KK-174 (2026-10-06) İşten çıkarma bildirimi; hat sırası; B1 bölündü; e2e yükü; canlı = main
- **Karar (ne):** (1) EKRAN-03 Q2: işten çıkarmada boşalan yayınlanmış vardiya varsa yalnız o lokasyonun müdürüne uygulama içi bildirim ("Ali's 2 shifts are unassigned"); çıkarılan kişiye yok; `employee_offboarding_followups` bu bildirime bağlanır (BL-768). (2) Hat sırası: veri EKRAN-02 A1→A4, sonra EKRAN-03 A1→A4 (aynı matris ve katalog test dosyaları, ekran ekran); web EKRAN-02 B1→B3, sonra EKRAN-03 B; arayüz E2E-YUK → EKRAN-02 C3→C1→C2, sonra EKRAN-03 V/C. (3) EKRAN-02 B1 ikiye bölündü: B1a (A1–A3'e bağlı olmayan kısım: açık sekmelerin istemci birleşimi, Request type süzgeci, sayfalamanın veri tarafı, R2-10/-11/-20/-21/-32) şimdi; B1b A1–A3 main'e girince. Sayfalamanın veri tarafı web hattında, görünüm bileşeni C3'te arayüz hattında (hook şekli sözleşme). (4) e2e yükü: CI'da `e2e` işi `needs: [check, db]` (BL-764) + yalnız flow 7'ye `test.slow()` (dört kişiyle sırayla giriş); flow 7'yi bölmek yok. (5) Mert'in "biten işleri live a uygula"sı ölçüldü: canlı web/API = main başı `48de63c5` (bugünkü 30 production yayını başarılı, /health 200, paket taramasında bugünkü değişiklikler var); main'e girmemiş bitmiş ürün işi yok; canlı DB karşılaştırması veri hattında (CANLI-ESIT-DB). E-posta canlıda kapalı: Resend anahtarı Mert'te (MVP-RESEND adımları 12:35Z iletildi).
- **Nerede:** EKRAN-03 görev dosyası (Q2), EKRAN-PLANI hatlar, EKRAN-02 B1, `.github/workflows/ci.yml` + `announcement-reaches-its-people.spec.ts`, BACKLOG BL-764/BL-768.
- **Ne zaman:** 2026-10-06 ~12:30–12:58Z.
- **Ne için:** (1) P07: bildirim işi doğrudan etkilenene. (2)–(3) Tek veri hattı aynı test dosyalarını iki ekranda aynı anda yazamaz; web hattı boşta kalmasın (P17 "hızlanmak işi bölmektir"). (4) Bugün 5 e2e kırmızısı, her biri bütün gönderimleri dondurdu; kök neden yük ve dört girişli test (VAR-E2E-2 iz ölçümü). (5) Mert canlıyı istedi; kanıtla.
- **Dayanak:** ILKELER P07, P17, P19; CLAUDE.md §3 (en çok iki ağır iş), §11.9.
- **Geri alma:** (1) görev dosyası satırı; (4) iki satırlık commit.
- **Durum:** (1)–(3) kayıtta ve hatlarda; (4) arayüz hattında; (5) DB karşılaştırması bekleniyor.
- **Mert:** sohbette söylendi.

### KK-175 (2026-10-06) Gece kuralı: ekran değişiklikleri sabahı bekler; Q1, O1, sayfalama zamanı
- **Karar (ne):** Mert uyumadan önce (~13:05Z) dört cevap verdi. (1) Gece planı: "Ekran değişiklikleri sabahı beklesin" — veri ve API dilimleri main'e ve canlıya gider (R3'te koordinatör izni, canlı migration yedekli); ekranda görünen bir şeyi değiştiren dilim dalında hazırlanır, tam kapı + öncesi/sonrası görüntüleri, push yok; sabah Mert görüntülere bakıp onaylar. Etkilenen: EKRAN-02 B1a, C3, C1, C2 (ve B1b/B2/B3'ün ekran kısmı). (2) EKRAN-03 Q1 (seçenek dışı): bekleyen izin sessizce geri çekilir, pencere yalnız açığa düşecek vardiyaları söyler (KARARLAR Employees, ILKELER P09 istisna kanıtı). (3) BE-2b O1: geçici hatada bir kez yeniden deneme + hız sınırı altında sıra; web hattında yeni dilim BE-2b-O1 (R2, ekran değişmiyorsa gider). (4) Sayfalama: kalan altı liste sayfası kendi ekran turunda (BL-787; ayrı tarama yok).
- **Nerede:** dört hatta mesajla (13:00–13:05Z); KARARLAR Employees + Schedule; ILKELER P09; BL-787 ve EKRAN-03 görev dosyası planlama hattında.
- **Ne zaman:** 2026-10-06 ~13:05Z.
- **Ne için:** Mert sabaha kadar yok; görünür değişiklikleri kendi gözüyle onaylamak istiyor (P04), veri ve API işleri durmasın (P15, P17).
- **Dayanak:** Mert'in cevapları; CLAUDE.md §8 sürekli yetki.
- **Geri alma:** dallar main'e girmediği için yok; KARARLAR satırları.
- **Durum:** hatlarda yürüyor; sabah raporu.
- **Mert:** kendisi seçti.

### KK-176 (2026-10-06) PC aşırı yükten kapandı: tek runner, tek ağır iş; uzak CI araştırması
- **Karar (ne):** Mert (~13:50Z): "e2e ci gibi ağır test ve koşuları aynı anda yapma hatta mümkünse bunları benim pc de yapmayalım artık remote yapalım"; seçimi "Tek runner, tek ağır iş" (önerilen). Koordinatör runner 2 ve 3'ün servislerini ve CI Supabase konteynerlerini durdurdu (Mert'in onayıyla, kendi penceresinde); hatlara kural: ağır iş öncesi `gh run list`, yerel ağır iş `db.lock` ile. Ek: CI-DOCS (yalnız docs/agent-memory push'u CI koşturmaz) arayüz hattına; REMOTE-CI araştırması (GitHub-hosted, bulut VM, Claude bulut oturumu; dolar; P06 çelişkisi) planlamaya. Mert'in sabitli oturumlarında Remote Control açıldı (Mert'in isteği; kendi BofA oturumu bir sonraki turunda bağlanır).
- **Nerede:** WSL `~/actions-runner-2`, `~/actions-runner-3`; KARARLAR OPS-01 eki; HANDOFF §0.
- **Ne zaman:** 2026-10-06 ~13:45–13:58Z.
- **Ne için:** CI'ın üç paralel işi + her runner'ın Supabase yığını + oturumların yerel koşuları PC'yi kapattı; bugün 5 e2e kırmızısı da aynı yükten.
- **Dayanak:** Mert'in kararı; CLAUDE.md §3 (en çok iki ağır iş) sıkılaştırıldı.
- **Geri alma:** `cd ~/actions-runner-N && sudo ./svc.sh start`.
- **Durum:** yürürlükte; REMOTE-CI sabah Mert'e (`docs/plan/research/REMOTE-CI.md`, önerilen Hetzner ~$8–12/ay). Düzeltme ~14:05Z: CI-DOCS gereksizdi — `ci.yml`'de `paths-ignore` zaten var (planlama ölçtü); iptal edildi.
- **Mert:** kendisi seçti.

### KK-177 (2026-10-06) Gece: Employees görünümü öne çekildi, Requests C1 görünümü önce, ağır iş izni (Mert)
- **Karar (ne):** (1) Mert "employees ve requests sayfaları ne zaman artifactta karar verdiğimiz gibi gözükecek" diye SORDU (~15:00Z); koordinatör cevapla yetinmeyip planı değiştirdi: EKRAN-03 C1 → C1a (görünüm, veri beklemez; bu gece dalda) + C1b (Kadikoy +1, No location, telefon; B2 sonra). (2) EKRAN-02 C1 (tek tablo görünümü) B2'yi beklemeden arayüz hattında yazılıyor (`task/ekran-02-c1` = c3 + b1a); CLAUDE.md §4'ün "önce işlevsel kısım" sırasından sapma, B2 C1'in üstüne kurulur. (3) Mert ~15:05Z: ağır iş (tam kapı, e2e, test:db, build, dev sunucusuyla QA) koordinatörün izniyle, aynı anda tek oturum (sıra `AGIR-ISTEK` / `AGIR-BITTI`, push sonrası CI bitene kadar izin yok). (4) Employees API'sinin 100 kişi sınırı (P09) web hattına EMP-LIMIT.
- **Ders (Mert, ~15:30Z):** (1) ve (2) tartılmadan yapıldı; (3) için önerilen "kilit + otomatik bekçi" de P16'yı atlıyordu — bu gece Mert'in kuralı sürer, kanca sabah uyarı modunda önerilir. Tam metin CLAUDE.md §11.12'ye eklendi (Mert "Sen karar ver").
- **Nerede:** hatlar; EKRAN-03 görev dosyası C1 (bölme planlamada yazılacak); CLAUDE.md §11.12.
- **Ne zaman:** 2026-10-06 ~15:00–15:45Z.
- **Geri alma:** C1a / C1 dalları main'e girmedi; sabah Mert görüntüye bakıp karar verir.
- **Mert:** sohbette söylendi; (1)–(2) sabah geri alınabilir.

### KK-178 (2026-10-06) Availability keşfinin koordinatör kararları K1–K6
- **Karar (ne):** EKRAN-04 OZET §3: K1 liste yalnız employee rolü (pgTAP yeniden yazılır), K2 "Manager note" + çekmecede "Last edited by", K3 değişikliksiz kayıt bildirim üretmez, K4 mod bildirimi metni, K6 arşivli lokasyondaki kişi owner'ın listesinde lokasyonsuz görünür — kabul; K5 KARARLAR 69/72/73 M13/M14'e göre düzeltildi (planlama, izinle). S1–S3 Mert'e.
- **Dayanak:** KARARLAR M13/M14, ILKELER P07/P09 (OZET §3'te satır satır).
- **Ne zaman:** 2026-10-06 ~14:50Z. **Durum:** görev dosyası `tasks/EKRAN-04-AVAILABILITY.md`, BL-789–800.

### KK-184 (2026-10-07) CLAUDE.md yeniden yazımı: Mert'in açtığı oturumun verdiği ve Mert'e gösterdiği kararlar
- **Kim:** Mert'in açtığı tekil oturum (`b47f3765…`), Mert'in onayıyla. **Ne zaman:** 2026-10-06 ~23:00Z – 2026-10-07 ~06:30Z. **Nerede:** yeni `CLAUDE.md` (2026-10-07), karar tablosu `C:\Users\TheWe\.claude\plans\yeni-CLAUDE-karar-tablosu.md`.
- **Ne (Claude'un verdiği, Mert'e gösterilip itiraz gelmeyen):** (1) ekran görüntüsü `artifacts/<rol>/<iş-no>/`, masaüstü 1440, telefon 390 (Claude önce 375 dedi, ölçmeden; mevcut uygulama 390 — hata Claude'un); (2) oturum kapanış listesi (§4.4); (3) rapor posta kutusuna, ayrıca dürtme yok (eski §3–§12 çelişkisi §3 lehine); (4) kayıt dosyalarına tek yazar koordinatör (+ Mert'in oturumu); (5) işle ilgisiz güvenlik açığı → koordinatöre, ayrı acil iş; (6) bağlam %50 → ilk iş sınırında devir; (7) gece modu "gece modu" ile başlar, sabah ilk mesajla biter; (8) tek `SABAH-SORULAR.md`; (9) abonelik kuralı ROADMAP'ten KARARLAR "MVP sınırı"na; (10) dosya sahipliği rol dosyalarında; (11) canlı kural dosyalarındaki eski `CLAUDE.md` bölüm numaraları yenilerine eşlendi (KARARLAR, EKRAN-PLANI, HANDOFF, ILKELER, rol dosyaları ve hafızaları); tarihli kayıtlar (BACKLOG, KK, DONE, research, tasks, ekranlar) olduğu gibi kaldı; (12) yalnız `.md` değişen bu gönderimde yerel tam kapı yerine main CI'a bakıldı (testler `CLAUDE.md` içeriğini okumuyor, ölçüldü); (13) `nf-okur` sonnet modeliyle (Haiku alt ajanları skill yükünden başlayamıyor); (14) rol hafızasından eskimiş iki dosya silindi (`nf-planlama/kayit-oturumu-yontem.md`, `nf-backend/handoff-2026-09-27.md`).
- **Nasıl / neden:** Mert'in 2026-10-06/07 iletişim ve workflow kararları; dayanak ILKELER P15, P19, P22.
- **Mert:** taslak ve karar tablosu "Onaylıyorum, devam et" (2026-10-07 ~06:20Z).

### KK-185 (2026-10-07) Koordinatör devri ve devir notlarının işlenmesi
- **Kim:** yeni koordinatör (`local_70128f8f…`, posta kutusu `f2f4ad49…`). **Ne zaman:** 2026-10-07 ~06:08–06:30Z. **Nerede:** posta kutusu, `HANDOFF.md` başı, `DERSLER.md`.
- **Ne:** (1) Mert'in "sen yeni koordinatörsün, diğer oturumlara bildir" isteğiyle `inbox.mjs claim` yapıldı; açık 4 oturuma (hepsi Mert'in) bilgi mesajı gitti; gece hatlarının oturumları uygulamada yok, mesaj gitmedi. (2) Havuz kuralı: uygulamada yalnız 4 açık oturum var, arşivlenecek boş oturum yok; panodaki eski satırlar uygulamada karşılığı olmayan kayıtlar. (3) CLAUDEMD-REWRITE dersleri: 3. ders (kendi önerdiğin kuralı mevcut mekanizmayla tart) 2026-10-06 gecesi girişinin tekrarı sayıldı ve oraya tarihle eklendi; diğer üçü yeni giriş. (4) Eski `.claude/worktrees/handoff-koordinatorlugu-20c0b3` (dal `task/ekran-02-requests`, commit'leri main'de): commit edilmemiş `nf-gorsel-qa` / `nf-guvenlik` rol hafızası yedeklendi → `artifacts/koordinator/yedek-handoff-wt-agent-memory-20261007/`; worktree silinmedi, main'e taşınması ayrı küçük iş. (5) 3. aşama otomasyon (OTOMASYON-3) `nf-backend` rolüne, R2, görev dosyasıyla; `start_session` aracı olmadığı için Mert'e tek tıklık görev kartı olarak sunuldu; açılış yükü ölçümü (`get_usage`) o oturumun ilk işi.
- **Dayanak:** CLAUDE.md §4.2 (havuz, sürekli yetkiler), §4.6 (aynı ders tekrar), §2.B.4 (yedek), §5.1.

### KK-186 (2026-10-07) SCHEMA-SNAP raporunun kayıtları
- **Kim:** koordinatör (`f2f4ad49…`). **Ne zaman:** 2026-10-07 ~06:35Z. **Nerede:** `BACKLOG.md` "Geliştirme ortamı", `DERSLER.md`.
- **Ne:** (1) sıkı moda geçiş BL-896 olarak yazıldı (leave: medium / do: safe). (2) Önerilen KARARLAR OPS satırı YAZILMADI: aynı kural `CLAUDE.md` §6 "Veritabanı ve canlı" ve `nf-db` rol dosyasında zaten var (main `945fac37`); ikinci kopya tek dosya ilkesine aykırı (§4.8 ilke 1). (3) SCHEMA-SNAP dersi yeni giriş. (4) Uzak dal `origin/task/schema-snap` (içeriği main'de, yedek `refs/nf-backup/branch/task/schema-snap-remote-prerebase/20261007T062204Z`): ajan izinleri uzak dal silmeyi reddediyor; Mert'e bırakıldı.
- **Dayanak:** CLAUDE.md §4.7, §4.8, §4.6.

### KK-187 (2026-10-07) OTOMASYON-3 görev dosyası onayı; CI koşucu 2–3 kapatıldı
- **Kim:** koordinatör (`f2f4ad49…`). **Ne zaman:** 2026-10-07 ~06:40–06:50Z. **Nerede:** `docs/plan/tasks/OTOMASYON-3.md` (dal `task/otomasyon-3`), WSL `runner` servisleri, KARARLAR OPS-01.
- **Ne:** (1) OTOMASYON-3 görev dosyası ONAY; dört öneri kabul (14 Ekim uyarı→engel, `Rol:` ile rol oturumu ayrımı, `git commit` uyarısı, `/code-review`). İki düzeltme: kökten tek başına `lint` ağır sayılmaz (saniyelik, yanlış uyarı üretir), `typecheck` süresine göre oturum karar verir (~60 sn eşiği); `db.lock` var / `heavy.lock` yok e2e vakası teste girer. (2) Mert'in seçimiyle ("Tekrar tek koşucu (Önerilen)") CI koşucu 2 ve 3 durduruldu ve açılışta kalkmaz (`systemctl disable --now`); kök neden: dün yalnız `svc.sh stop` yapılmıştı, Ubuntu yeniden başlayınca kalktılar.
- **Dayanak:** CLAUDE.md §4.3.3, §4.3.7 (R2), ILKELER P16, P19; Mert'in 2026-10-06 ~13:50Z kararı (KK-176) ve bugünkü seçimi.

### KK-188 (2026-10-07) Görev mesajı `Görev: <İŞ-ID>` ile başlar; OTOMASYON-3 işçi ayrımı buna geçti
- **Kim:** koordinatör (`f2f4ad49…`). **Ne zaman:** 2026-10-07 ~06:55Z. **Nerede:** OTOMASYON-3 görev dosyası (kayıt koruması "İzinli" maddesi), `HANDOFF.md` §000.
- **Ne:** CLAUDE-INCE (`3050021b`) rol oturumlarını kaldırdı; KK-187'de onaylanan "işçi = ilk mesajı `Rol:` ile başlayan oturum" ayrımı artık her oturumu Mert'in sayardı (koruma hiç uyarmazdı). Yeni ayrım: işçi = ilk mesajı `Görev:` ile başlayan oturum (geçişte `Rol:` da, 14 Ekim'e kadar); koordinatör `coordinator.json`; geri kalan Mert'in. Bu koordinatörün kendi mesaj biçimi, CLAUDE.md kuralı değil.
- **Neden:** yeni tören yok (Mert'in oturumu kendini kaydettirmez), yanlış engel üretmez; zayıf yanı başlıksız işçinin kaçması. **Dayanak:** CLAUDE.md §4.1, §5.1 (süreç kararı), ILKELER P16, P19.

### KK-189 (2026-10-07) Requests önce; sahipsiz gece dalları ekranın sahip oturumuna
- **Kim:** koordinatör (`f2f4ad49…`), seçim Mert'in. **Ne zaman:** 2026-10-07 ~07:10Z. **Nerede:** EKRAN-PLANI Ekran 2 satırı; görev kartı "Own the Requests screen end to end (EKRAN-02)".
- **Ne:** Mert "Önce Requests (Önerilen)"i seçti (reddedilen: önce Schedule; şimdi değil). Dün gece hat oturumlarının push etmediği 9 Requests dalı (A1A2, A3, AUTHZ-DUMP, A4, B1a, B1b, C1, C2-css, C3) tek sahip oturuma verildi: önce dal envanteri + `ekranlar/02-requests/EKRAN.md` taslağı, kod yok; Mert listeyi onaylayınca uçtan uca uygulama. R3 maddeler güncel main'e taşındıktan sonra `nf-guvenlik` yeniden bakar. Requests'in açık BACKLOG maddelerini listeye taşıma kaydını koordinatör yapar (kayıt dosyası). Schedule DB-4 ve Employees C1a dalları kendi ekran turlarını bekler (silinmez).
- **Dayanak:** CLAUDE.md §2.B (kod kaybı olmaz), EKRAN-PLANI "Bir ekranın turu" 4–5 ve "Yerini aldı", ILKELER P17.

### KK-190 (2026-10-07) EKRAN-02: onay biçimi önce/sonra; görünüm dilimi önce; oturumun dört sorusu
- **Kim:** koordinatör (`f2f4ad49…`). **Ne zaman:** 2026-10-07 ~07:15–07:45Z. **Nerede:** EKRAN-02 sahip oturumu (`local_224535dd…`), `ekranlar/02-requests/EKRAN.md`.
- **Ne:** (1) Mert "107 maddeyi okumam mümkün değil, before after göndermen lazım" dedi, sonra "kararlar.md'de yazan ui değişikliklerini uygulamak istiyorum": 107 maddelik liste onayı ve büyük önce/sonra sayfası bırakıldı; ilk dilim görünüm: `c3` → `b1a` → `c1` cherry-pick, KARARLAR:535 (+ bugünkü ek) ve :372'ye göre; c1 `/code-review`, b1a `nf-guvenlik` ONAY @5bc0874d geçerli (çakışma yoksa); önce/sonra görüntüleri Mert'e, push Mert'in bakışından ve koordinatörün "gönder"inden sonra. (2) Decide by'da dilim adı kesiliyor ("Istan…"): KARARLAR:133 gereği kesilmeyen biçim, oturum seçer. (3) Oturumun soruları: A4 (c) "sahibi görür" yalnız KARARLAR satırıyla kabul, yoksa Mert'e; soluk yazı `#aeb9b4` → BL-905 (ortak değer, önce Mert); BL-801/802/803/900/334 Requests listesinin dışında, BL-840 içinde; §5 sırası kabul. (4) A4 yolda bulunan indeks → BL-904; `inbox.mjs` pano etiketi kök nedeni BL-755'e.
- **Dayanak:** Mert'in 2026-10-07 sözleri; CLAUDE.md §4.3.7, §4.7; ILKELER P03, P09, P19; KARARLAR:133, :372, :535.

### KK-191 (2026-10-07) İkinci hat: Schedule (Ekran 1) tek sahip oturuma
- **Kim:** koordinatör (`f2f4ad49…`), Mert'in isteğiyle ("şimdi sen başka bi sessiona önümüzdeki en önemli tasklerden bitanesini ver", ~08:10Z; ILKELER P17: ikinci işi Mert açar). **Nerede:** görev kartı "Own the Schedule screen to the finish (EKRAN-01)"; EKRAN-PLANI Ekran 1 satırı.
- **Ne:** en önemli iş olarak Schedule'ın kalanı seçildi: 19 dilimin 7'si başlamadı, kapsamdaki BL'lerin çoğu kayıtta açık; içinde iş kaybı (BL-688 hareketsizlikte silinen iş, BL-689–692) ve ABD saat dilimi (BL-238 Pacific'te Pazar akşamı düzenlenemiyor) var. İlk aşama tazelik + kısa `EKRAN.md` ("Mert için özet" ≤10 satır); hata düzeltmeleri Mert onayı beklemez, görsel maddeler önce/sonra ile gider (KK-190 dersi). Çakışma: DB-4 EKRAN-02 veri paketini bekler (dal o dört migration'ı içeriyor) ve S24'ü; yetki matrisi / katalog / `ci-green.txt` EKRAN-02 paketi girene kadar kapalı; `styles.css` önce koordinatöre.
- **Reddedilenler:** güvenlik maddeleri BL-178 / BL-276 (yetki çekirdeği ve matris; EKRAN-02 veri paketiyle aynı dosyalar, şimdi paralel yürüyemez — paket girince sıradaki aday); BL-897 (önemli ama küçük, araç işi; Schedule oturumunun ilk `test:db`'sinden önce gerekirse ayrı ele alınır).
- **Dayanak:** CLAUDE.md §4.1 (dosya çakışmasız dağıtım), §5.1; ILKELER P02, P17, P23; vizyon (Schedule = kokpit, ABD lansmanı).

### KK-192 (2026-10-07) Üçüncü hat: Employees (Ekran 3) tek sahip oturuma
- **Kim:** koordinatör (`f2f4ad49…`), Mert'in isteğiyle ("1 session daha aç ve bir task daha ver", ~08:15Z). **Nerede:** görev kartı "Own the Employees screen to the finish (EKRAN-03)"; EKRAN-PLANI Ekran 3 satırı.
- **Ne:** ekran sırasında sıradaki ve iş kaybı hataları olan Employees seçildi (BL-777 yazılan ad kaydolmuyor, BL-766 geçmiş tarihli işten çıkarma çalışılmış vardiyaları boşaltıyor, BL-765, BL-767, BL-768, BL-778; KK-177 100 kişi sınırı). Sahipsiz `task/ekran-03-c1a` dalı bu oturuma. İlk aşama tazelik + kısa `EKRAN.md`; hata düzeltmeleri Mert onayı beklemez, görsel maddeler önce/sonra ile. Çakışma: EKRAN-03 veri dilimleri ve yetki matrisi / katalog / `ci-green.txt` EKRAN-02 veri paketinden sonra; `styles.css` ve ortak bileşenler koordinatörün sırasıyla (c1a ile Requests C3 aynı ortak parçalara dokunabilir).
- **Reddedilenler:** Workspace (Ekran 5; daha az çakışma ama sırada sonra, BL-804 tek yüksek madde), Giriş ve katılım (Ekran 16; MVP için kritik ama e-posta canlıda yok, S8 Mert'te), güvenlik BL-178 / BL-276 (matris çakışması; EKRAN-02 paketinden sonra ilk aday).
- **Not:** üç hat aynı bilgisayarda; ağır koşular `heavy.lock` ile sıraya girer, CI tek koşucuda (~16–25 dk). Darboğaz büyürse dördüncü hat açılmaz.
- **Dayanak:** CLAUDE.md §4.1, §5.1; ILKELER P02, P09, P17; EKRAN-PLANI sırası.

### KK-193 (2026-10-07) Dördüncü hat: paralel çalışma altyapısı (PARALEL-1)
- **Kim:** koordinatör (`f2f4ad49…`), Mert'in isteğiyle ("1 session daha başlat önemli bir task daha ver", ~08:20Z; dördüncü hattın darboğaz uyarısı bir önceki mesajda söylendi, Mert yine istedi). **Nerede:** görev kartı "Make three parallel lines safe on one machine (PARALEL-1)".
- **Ne:** dördüncü iş ekran değil araç: BL-897 (test:db dalın test dünyasını ortak DB'ye kalıcı yüklüyor — üç hat aynı DB'de çalışırken birinin testi ötekini habersiz bozar), BL-755 (pano etiketleri 40 karakterde kesilip oturumları karıştırıyor — koordinatörün 20 dk gözetimi buna bakıyor), BL-760 (gönderim kancası gönderilen ref yerine klasörün HEAD'ini okuyor). R2, görev dosyası + `/code-review`; ekran dosyalarına dokunmaz, ağır koşusu az.
- **Neden bu:** üç paralel hattı güvenli kılar ve bilgisayara en az yükü ekler; ekran işi seçilseydi dördüncü ağır koşu kuyruğu ve yeni dosya çakışmaları gelirdi. **Reddedilenler:** Workspace (Ekran 5), Giriş ve katılım (Ekran 16; e-posta canlıda yok), güvenlik BL-178 / BL-276 (EKRAN-02 paketinden sonra).
- **Dayanak:** CLAUDE.md §4.1, §4.2 (tek ağır koşu), §6; ILKELER P19.
