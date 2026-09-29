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
