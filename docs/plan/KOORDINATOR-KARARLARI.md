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
  ilgili e2e (`owner-legal-name-setup.spec.ts` dahil) — bu tur KK-2'yi de taşır.
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
