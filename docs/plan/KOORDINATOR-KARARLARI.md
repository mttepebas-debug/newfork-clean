# Koordinatör kararları (kullanıcı yokken)

Kullanıcı talimatı 2026-09-29: "Karar vermen gereken yerde benim vizyonuma, uygulamamızın planına göre
karar ver ve verdiğin kararları tek tek ayrı bir md'ye logla. Ben gelince bana raporlayacaksın."
Dayanak sırası: SaaS mantığı, `ROADMAP.md` MVP sonucu, `KARARLAR.md`. Ürün bağlamı: çok kiracılı, çok
lokasyonlu, çok rollü; çalışan birden fazla lokasyonda çalışabilir; yönetici hem yönetir hem vardiya alır;
lokasyonlar farklı saat dilimlerinde olabilir. Uygulamanın yönünü değiştiren kritik kararda önce alt
ajanlarla tartışılır.

Her madde: kimlik, tarih, karar, dayanak, geri almanın maliyeti, durum. Kullanıcı düzeltirse maddenin
altına "Kullanıcı: …" yazılır ve madde uygulanır. Başka oturumların kendi karar dosyaları:
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
