# Devir raporu: Bildirim sistemi araştırma ve plan

Yazıldı: 2026-10-14 ~22:45 California (2026-10-15 05:45Z). Yazan: bu thread'in Claude'u (eski hesap).

> Yeni hesaptaki Claude için: bu dosyayı baştan sona oku, sonra §9'daki sırayla ilerle. Bu iş için **kod yok**: Mert açıkça "Başla" diyene kadar kod silme, sökme ve yazma yapılmaz.

## 1. Thread adı ve amacı
- **Ad:** "Bildirim sistemi araştırma ve plan" (eski hesapta proje thread'i, kök mesaj Mert'in 2026-10-14 16:16 California isteği).
- **Amaç:** Uygulamanın bütün bildirim sistemini sıfırdan tasarlamak. Eski sistem tamamen sökülecek, yenisi profesyonel SaaS uygulamalarının yaptığı gibi kurulacak.
- **Aşama:** Araştırma ve plan **bitti**. Kod aşaması Mert'in iznini bekliyor.

## 2. Mert'in isteği ve verdiği cevaplar (kelimesi kelimesine özet)
- **Kök istek (2026-10-14 16:16 California):** Bildirim üretimi ve motoru; hangi sayfada hangi olay bildirim üretir, kime, hangi yoldan; organizasyon neyi açar, kapatır, ayarlar; kişi kendine gelenleri nasıl kişiselleştirir; hangileri zorunlu, hangileri isteğe bağlı. Bugün üç ilgili sayfa var: Settings → Notifications (organizasyon), sol menüdeki Notifications sayfası, Account → bildirim tercihleri. Mert: "bildirim konusunda deneyimim yok"; profesyonel SaaS, web ve mobil bildirim sistemlerinin nasıl çalıştığı derin araştırılsın; mevcut sistem temel alınmasın; eski sistem emekliye ayrılsın, devre dışı bırakılsın, koddan sökülsün; yenisi kestirmesiz, gerekirse hazır araçlarla ya da kendi kodumuzla, test edilerek kurulsun.
- **Mert'in koşulu (kelimesi kelimesine):** "Öncelikle gereken altyapıyı hazırlamak için Deep Search, Code Review, Explore, Araştırma, Brainstorming gibi süreçleri High Effort kullanarak, derin düşünme yöntemleri kullanarak ilerlet. Read Only Call, her şey tamam olduğunda böyle kod Kod silme, kod sökme, kod yazma gibi süreçlere başlamak istediğinde bana mutlaka haber ver ve benden izin al."
- **Koordinatörün aktardığı cevaplar:**
  - 16:04 California: "Plan modunda kal… soru cevap… kapsamı daralt."
  - 16:20 California, kanallar: uygulama içi; e-posta (Resend, henüz bağlı değil, bağlanacak); telefona bildirim (web push): "kesinlikle yapmak isterim… insanlar real time bildirim alsın". Kısa mesaj (SMS) altyapısı hazır olsun ama ücretli olduğu için açılmasın. Mobil uygulama push'u sonra. Bildirimlerin nerede görüneceği (sol menüdeki sayfa kalsın mı gitsin mi) araştırmaya bırakıldı.
  - 16:21 California: "bana sorduğun bütün soruların cevabı best practices": organizasyon kapatınca kişi açabilir mi, hangileri zorunlu gibi sorular sektörde nasıl yapılıyorsa öyle önerilecek.
- **Kararlaştırılan teslimler:** (1) bildirim listesi: sayfa, olay, kime, kanal, zorunlu mu; (2) motor: kendimiz mi, hazır mı, artı ve eksileriyle; (3) ekranlar: Orijinal + varyantlar; (4) eski sistemin söküm planı. Plan tek sayfa olarak gösterilecekti.

## 3. Biten işler
- **Plan sayfası yayınlandı** (eski hesap, 2026-10-14 17:00 California, sürüm 2): https://claude.ai/artifact/CTcaw7mbDqSwArVWcv5TPD. Yeni hesapta bu link açılmaz; §8'e göre yeniden yayınlanır.
- Sayfanın sekmeleri:
  - Özet: Anladığım, Eksik ya da yanlış olabilecek, Sorularım, Bence (CLAUDE.md §2.5).
  - Araştırma: kaynaklarıyla.
  - Kanallar.
  - Kurallar: üç seviye ve karar sırası.
  - Bildirim listesi: 68 satır, 65 gerçek tür, süzgeçli.
  - Motor: kendimiz mi hazır mı.
  - Ekranlar: Orijinal + varyantlar, tıklanır.
  - Söküm.
  - Yol haritası: 10 dilim.
- **Ekran varyantları** (5 başlık):
  - Bildirim kutusu: A, B, C.
  - Telefon: A, B.
  - Kişisel ayar: A, B.
  - Organizasyon ayarı: A, B, C.
  - Telefona bildirim izni: A, B.

  Her başlıkta önerilen A. Varyantlar gerçek uygulama kabuğuyla çizildi (PAGES'ten alınan menü, ayar rayı, telefon menüsü ve CSS). Orijinal sekmesi gerçek PAGES `app.html`'i gösterir.
- **Mert'in sorusu cevaplandı (2026-10-14 22:24 California):** "Schedule bitsin dediğin ne, bitmeyen ne var, bildirime engel olur mu?" Cevabın özü §6'da.
- Repo'da kod değişikliği **yok**. Bu thread'in dalı `claude/project-thread-bb8xot`, yalnız bu devir dosyalarını taşır (§7).

## 4. Yarım kalanlar ve sıradaki adım
1. **Mert'in kararı bekleniyor:** eski hesapta bir karar kartı açık: "Bildirim planına göre koda başlayayım mı?" Seçenekler:
   - **Başla (önerilen):** önce 5 işi taşı, sonra sök.
   - **Önce düzelt.**
   - **Schedule bitsin.**

   Mert henüz seçmedi. Yeni hesapta bu soru yeniden sorulur (aynı seçeneklerle, karar kartıyla).
2. **Ekran seçimleri:** Mert önerilen A'ları beğenmediği yer olursa yazacak. Varyant sayfasında "hangisi?" kartı **gönderilmez** (Mert'in kuralı).
3. **Kod aşaması** (izin gelince): §9'daki yol haritası.

## 5. Önerilen tasarım (Mert'in onayını bekliyor)
- **Motor:** Kendi Postgres veritabanımızda kurulur; ek maliyet $0. Yedek plan Novu Cloud ($30/ay).
  - Elenenler:
    - Knock: 10 bin mesajdan sonra $250/ay.
    - SuprSend: tercihler $250'lık planda.
    - Courier: gönderim başı $0.005.
    - MagicBell: $249.
    - Kendi sunucumuzda Novu: MongoDB, Redis ve S3 ister.
  - Yapı:
    - Uygulama içi bildirim, işle aynı işlemde tek tabloya yazılır.
    - Kuyruk yalnız dış kanallar (e-posta, telefon) için.
    - Realtime yalnız sinyal taşır.
    - Bu yapı KARARLAR S-91 ile aynı.
  - Zamanlayıcı: pg_cron → pg_net → API, bugünkü yol. Vercel Hobby dakikalık cron'a izin vermiyor.
- **Üç seviye:**
  - **Zorunlu:** hesap ve güvenlik, ödeme, sahiplik, rol değişikliği, workspace'ten çıkarılma, kapanış. Kimse kapatamaz, hep e-posta da gider.
  - **Önemli:** onaylar, kişinin kendi vardiya değişiklikleri, kendi talebinin sonucu, isimle sorulan kapatma ve takas, belgeler, duyurular. Owner kapatamaz; kişi uygulama içini kapatamaz, yalnız telefon ve e-postayı seçer.
  - **İsteğe bağlı:** açık vardiyalar, müsaitlik güncellemesi, yeni üye. Sonra gelecekler: vardiya hatırlatması, yayınlanmamış hafta. Owner kapatırsa kimse açamaz; kişi de kendisi için kapatabilir.
- **Karar sırası:**
  1. Zorunlu.
  2. Owner kapattı.
  3. Kanal kapandı (abonelikten çıkış, geri dönen adres, telefon izni geri alındı, STOP).
  4. Kişinin seçimi.
  5. Ürün varsayılanı.

  Uygulama içi bu sıraya girmez: owner'ın kapatmadığı her bildirim listeye düşer.
- **Varsayılan kanallar:**
  - Zorunlu: uygulama + e-posta (telefon açıksa o da).
  - Önemli: uygulama + telefon + e-posta.
  - İsteğe bağlı: uygulama + telefon, e-posta kapalı.
  - Telefon seçilmiş ama hiçbir cihaz abone değilse e-postaya düşer.
- **Alıcı kuralı:** rol adından değil, yetkiden (authorize/scope_set).
  - Karar veren lokasyon müdürüdür; müdür yoksa admin ve owner.
  - Mert'in istisnaları korunur: müsaitlik değişikliği kişinin bütün müdürlerine gider; tercih edilen ad owner, admin'ler ve karar veren müdüre gider.
  - Yazan ya da yapan kişi kendi işi için bildirim almaz.
- **Gürültü kuralları:**
  - Bir olay, kişi başına tek bildirim (S-95).
  - İlk karar öbür karar verenlerin kartını "Approved by …" yapar.
  - Değişmeyen kayıt sessiz kalır.
  - Yeniden yayında yalnız vardiyası değişene bildirim gider.
  - Aynı anda gelen benzer bildirimler birleşir.
  - Belge hatırlatması son tarihten 7 gün önce, 1 gün önce ve gününde gider.
- **Okundu modeli:** rozet = görülmemiş (kutu açılınca söner); okundu = satır tıklanınca. Saklama 90 gün, hesap güvenliği 1 yıl. Sessiz saat ve günlük özet MVP'de yok (S-92).
- **Schedule yayını:** "Notify" seçimi kalkar. Değişen herkes kendiliğinden haber alır. Pencerede "12 people will be told" satırı ve isteğe bağlı "What changed?" notu olur. Neden: bazı ABD şehirlerinde (Berkeley, Emeryville) programın bildirildiğinin kaydı yasal olarak gerekiyor.
- **Ekranlar (önerilen A'lar):**
  - Sol menüdeki Notifications sayfaya gitmez; yanında bir **panel** açar (All / Needs action / Unread). Panelden "See all" ile tam sayfaya geçilir. Neden: uygulamada üst çubuk yok.
  - Telefonda Home'daki zil **tam ekran liste** açar; Accept / Decline satırın içindedir.
  - Account → Notifications: kanallar bloğu + 5–7 konu × e-posta / telefon tablosu. Hesap satırı kilitli.
  - Settings → Notifications: kanallar, isteğe bağlı anahtarlar ve kapalı duran "Always sent" listesi.
  - Telefon izni: kişi programını ilk kez gördükten sonra Home'da küçük bir kart çıkar. iPhone Safari'de önce "Ana Ekrana Ekle" adımları gösterilir.
- **Para:**
  - Resend Pro $20/ay, ilk müşteriyle (ücretsiz plan günde 100 e-posta).
  - Web push $0.
  - Kısa mesaj kapalı. Açılırsa: Telnyx $0.004 ya da Twilio $0.0083 mesaj başı. Kayıt için ücretsiz toll-free doğrulama ya da 10DLC: bir kez $4.50–46, $15 inceleme, ayda $1.50–10.

## 6. Bilinmesi gereken bulgular (doğrulanmış)
- **Öncelik çakışması:** S-117 (Mert, 2026-10-09) "önce Schedule bitsin, bildirim sonra" diyor. Mert'in yeni isteğinin onun yerine geçtiği varsayıldı; sayfada ve thread'de söylendi.
  - 2026-10-14 22:24 California'da Mert sordu: S-117'nin saydığı 4 hazır iş (Undo, izinli güne vardiya engeli, yayın kuralları, şablon penceresi) **main'de**. Kanıt: main'deki migration'lar `20261009080320_undo_keeps_its_order_and_full_depth`, `20261009235813_publish_rules_name_and_override` ve `20261010150000_time_off_blocks_every_shift`.
  - Kalanlar: turuncu nokta (Mert'in kararında); şablonun ızgarada önizleme ve düzenlenmesi (12 Ekim'de onaylandı, kodlanmadı); `docs/plan/ekranlar/01-schedule/EKRAN.md` (7 Ekim'den kalma, 100 maddenin 66'sı o gün açıktı, yeniden ölçülmedi).
  - Tek çakışma yayın penceresi ve yayın fonksiyonu; sırayla yapılırsa sorun yok.
  - Öneri: önce bildirim. Vardiya değişimi, Lineup paylaşımı ve müsaitlik yeni sistemi bekliyor.
- **Bildirim kodunun içinde yaşayan 5 iş**, sökümden önce taşınmalı. Kaynak `docs/plan/research/BILDIRIM-INCELEME.md` §1.1, K1–K5:
  - belgesi geciken kişiyi kısıtlama (`documents_maintain_service`, bildirim işçisi çağırıyor);
  - süresi dolan takası kapatma (`shift_exchanges_maintain_service`);
  - takas geçmişi (`shift_exchange_emit_notification_base` içindeki `shift_exchange_events` yazımı);
  - hesap güvenliği denetim kaydı (`record_account_security_notification_service` → `record_security_audit_event_service`);
  - Workspace belge to-do'ları (`sync_expiring_document_todos_service` + `get_workspace_dashboard_service` eski `notifications` tablosunu okuyor).
- **Söküm listesi 7 Ekim ölçümü:**
  - 18 tablo, 50 fonksiyon, 3 tetikleyici, 1 cron, 10 API yolu;
  - web 17, shared 5, test 10 dosya;
  - 21 domain fonksiyonu düzenlenecek.

  Main değişti; **söküm başlamadan yeniden ölçülmeli**. Belgedeki EKRAN-02 dal notları eski olabilir.
- **Ayrı e-posta yolları** sökümde dokunulmaz (S-96): davet, parola sıfırlama, haftalık program e-postası, hesap silme. Resend `apps/api/src/email/resend-email.ts` içinde `fetch` ile çağrılıyor; e-posta için yeni bağımlılık gerekmez. Canlıda `RESEND_API_KEY` yok (S-118).
- **Telefona bildirim için** uygulamada manifest ve service worker **yok** (`apps/web/public` yalnız favicon, fonts, licenses). Yeni kurulacak. `web-push` npm (MPL-2.0) yeni bağımlılık; Mert'in onayı gerekir. iPhone: yalnız ana ekrana eklenmiş web uygulaması, iOS 16.4+, izin bir dokunuştan istenir. Declarative Web Push biçimiyle gönderilir.
- **Uygulama kabuğu:** üst çubuk yok; Notifications sol menüde (`apps/web/src/shell/AppShell.tsx`), rozet `getNotifications(limit 1)`'den geliyor.
- **Git:** bulut klonu sığ (main'de 50 commit görünüyor). Eski dallarla `git cherry` "no merge base" verir. Bir işin main'de olup olmadığını migration adı ya da dosya içeriğiyle doğrula.
- **Eski kararlar:**
  - S-91: katalog yalnız DB'de, senkron tek tablo, kuyruk yalnız e-posta, Realtime yalnız sinyal, eski veri taşınmaz.
  - S-92: 90 gün, güvenlik 1 yıl, sessiz saat ve özet yok.
  - S-95: tek karar, tek bildirim.
  - S-96: e-postalar ayrı; söküm ilk dilim; arada bildirim olmaması kabul.

  Plan bunlarla uyumlu. `docs/plan/tasks/BILDIRIM.md` eski plandır; altı sorusu (G8) bu planla cevaplanmış sayılır, ama Mert onaylamadan KARARLAR'a yazılmaz.

## 7. Dal ve git durumu
- Dal `claude/project-thread-bb8xot`. Taşıdığı tek şey bu devir paketi: `docs/plan/devir-2026-10-15/bildirim-sistemi/`. Kod değişikliği yok. Main'e gitmez; yeni hesap okuyup kullanır.
- Push edilmemiş iş yok.

## 8. Dosyalar: ne işe yarar, nasıl kullanılır
Paket iki yerde aynı: proje dosyalarında `/mnt/project-files/devir/threadler/bildirim-sistemi-kaynak/` ve GitHub'da dal `claude/project-thread-bb8xot`, klasör `docs/plan/devir-2026-10-15/bildirim-sistemi/`.

| Dosya | Ne | Nasıl kullanılır |
|---|---|---|
| `README.md` (bu rapor) | Devir raporu | Önce bu okunur |
| `arastirma.md` | Araştırma raporu, İngilizce, her iddia kaynak linki ve tarihiyle | Karar gerekçesi; plan sayfasının Araştırma ve Motor sekmeleri buradan |
| `site/index.html` | Plan sayfası (Türkçe, 9 sekme, bildirim listesi içinde JS dizisi `C`, yol haritası dizisi `S`) | Artifact olarak yayınlanan ana sayfa |
| `site/screens.html` | Varyant görüntüleyici: 5 başlık, Orijinal + A/B/C, rol ve cihaz seçimi | Plan sayfasının Ekranlar sekmesi bunu iframe'de açar |
| `site/mock.html` | Varyantların kendisi (yapılmış dosya; uygulamanın CSS'i ve kabuk HTML'i gömülü) | `screens.html` bunu `#v=inbox-A&f=desktop&r=manager` gibi adreslerle açar |
| `mock-src.js`, `mock.css` | Varyant kaynak kodu | Değiştirince `python3 build-mock.py <paket klasörü>` → `site/mock.html` yeniden yazılır |
| `ext/frag.json`, `ext/icons.json` | PAGES'ten çıkarılmış gerçek kabuk parçaları (menü, ayar rayı, hesap menüsü, telefon menüsü) + 101 lucide ikonu | `build-mock.py` bunları okur |
| `extract2.mjs` | `frag.json`'u PAGES `app.html`'den yeniden çıkarır (Playwright) | Yalnız PAGES değişince; yol içinde `/mnt/project-files/PAGES/app.html` yazılı, yeni yerde düzelt |
| `shotmock.mjs`, `shotpage.mjs` | Ekran görüntüsü betikleri (1440 ve 390) | Kontrol için; Playwright yolu `/opt/node-tools/...` bulut ortamına göre, değiştirilmeli |
| `site/app.html` (3 MB) | PAGES'in tam uygulama kopyası (main 28aeb82b); "Orijinal" sekmeleri bunu açar. Demo parola değerleri `demo-password-1/2` ile değiştirildi | Yayında `site/` içindeki öbür dosyalarla birlikte gider; ayrıca bir şey yapılmaz |

**Yeni hesapta yeniden yayın:**
- Artifact `publish`, `file_path` = `site/index.html`.
- `files` = `{"screens.html": "site/screens.html", "mock.html": "site/mock.html", "app.html": "site/app.html"}`, icon `bell`.
- Sayfa dosyasının kalıcı yeri (CLAUDE.md §7): `C:\Users\TheWe\Documents\Codex\newfork-pages\bildirim-sistemi\`.
- Yeni link `pages/LISTE.md`'ye ve README satırına yazılır.

**Repo'daki ilgili belgeler (okunacak):**
- `docs/plan/research/BILDIRIM-INCELEME.md`: söküm listesi (§1) ve 162 olay envanteri (§2). Bildirim listesinin tabanı.
- `docs/plan/tasks/BILDIRIM.md`: eski plan (Y1, B0–B8). Yerine bu plan geçiyor; yalnız geçmiş için.
- `docs/plan/KARARLAR.md`: S-91, S-92, S-95, S-96, S-117, S-118. Satırları `grep -n "S-91\|S-92\|S-95\|S-96\|S-117\|S-118"` ile bul.
- `apps/web/src/shell/AppShell.tsx` (menü ve rozet), `apps/api/src/email/resend-email.ts` (e-posta), `supabase/CLAUDE.md` (migration kuralları).

**Mert'in bilgisayarındaki proje dosyası kopyasında ilgili notlar:** kök `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\`.
- `notes\vardiya-degisim\PLAN.md`: vardiya değişimi tasarımı. Listedeki "Vardiya değişimi" satırları bundan.
- `notes\oturum-ozetleri\bildirim.md`: eski bildirim konuşmalarının özeti.
- `pages\gorsel-kararlar\gelen\bildirim-sistemi\`: varyant dosyaları. Bu klasör 14 Ekim kopyasından sonra yazıldı, kopyada yok. Aynısı bu pakette.

## 9. Yeni hesaptaki Claude ne yapar (sırayla)
1. Repo'yu güncel `origin/main`'e göre oku. Bu raporu ve `arastirma.md`'yi oku. KARARLAR'daki altı satırı oku.
2. Plan sayfasını kendi hesabında yeniden yayınla (§8). Mert'e linki ver, açılıp açılmadığını sor.
3. Mert'e tek karar kartı: "Bildirim planına göre koda başlayayım mı?"
   - Başla (önerilen) / Önce düzelt / Schedule bitsin.
   - Dayanak: S-96 ve Mert'in 2026-10-14 isteği.
   - Ekran varyantı için kart gönderme.
4. "Başla" gelirse yol haritası şöyle. Her dilim ayrı dal ve tren; aynı anda tek kod işi; incelemeli dilimler `nf-guvenlik` ONAY'ından geçer; her dilim dokunduğu PAGES sayfasını günceller.
   1. **Korunacak 5 işi taşı** (K1–K5). Bitti: eski kod hâlâ var ama bu 5 iş onsuz çalışıyor, testler yeşil.
   2. **Sök.** Önce söküm listesini yeniden ölç. Yedek al (silinecek fonksiyon ve tabloların tanımı). Silen migration riskli sayılır: ONAY + koordinatör "gönder" + tren CI yeşil. Silinenler `retired_objects_stay_gone`'a girer. Canlı uygulamayı PC thread'i yapar.
   3. **Çekirdek:** tür listesi, bildirimler, gönderimler, tercihler, workspace ayarları, "gidecek mi" kuralı, yetki matrisi ve katalog sınıflaması.
   4. **Üreticiler:** listedeki türler, alan alan. Vardiya değişimi satırları o işle gelir.
   5. **Kutu ekranları:** panel, tam sayfa, telefon listesi, rozet, Realtime sinyali, satırda düğmeler. Playwright akışı.
   6. **Ayar ekranları.**
   7. **E-posta:** Mert'in Resend hesabı, alan adı doğrulaması ve $20/ay onayı gerekir.
   8. **Telefona bildirim:** `web-push` onayı gerekir; manifest + service worker + VAPID.
   9. **Kısa mesaj altyapısı (kapalı).**
   10. **Uçtan uca testler, PAGES, KARARLAR.**
5. Mert'in plan kararlarını (seviyeler, ekran seçimleri, motor) onayladığı anda KARARLAR'a yeni madde olarak yaz (o işin dalında).

## 10. Mert'ten beklenenler
- "Başla" kararı.
- Ekran önerilerine itirazı varsa.
- E-posta diliminde Resend hesabı + alan adı + $20/ay.
- Telefon diliminde `web-push` kütüphanesi onayı.

## 11. Mert'in kuralları (bu işte özellikle)
- Türkçe, sade; numara tek başına yazılmaz (önce ne olduğu, numara parantezde); saatler California.
- Kod silme, sökme, yazma için önce izin (bu thread'in kök koşulu).
- Varyant sayfasında Orijinal seçilebilir, varyantlar sade ve Orijinal'e yakın, popover kendi düğmesine bağlı. Yayından sonra "hangisi?" kartı yok.
- Komut verilmez; Mert git komutu yazmaz.
- Canlı DB'ye yazmak ve CLAUDE.md değişikliği Mert'in PC thread'inde kendi yazılı onayıyla.
- Yeni bağımlılık, ücretli servis, gizli anahtar Mert'e sorulur.
- Auth ekranları (WorkspaceHubPage, WorkspaceStatusPage, ProtectedRoute) beklemede; bildirim işi bunlara dokunmaz.

## 12. Tuzaklar (bu işte öğrenilen)
- **Artifact günlük sınırı:** 200 yayın, yeniden yayınlar dahil; 00:00Z'de sıfırlanır. Sınır dolunca "429" gelir; aynı dosya yolu sıfırlanmadan sonra yeniden yayınlanır.
- **Ek HTML dosyası** (`screens.html`) `<!doctype html>` ile başlamalı; yoksa tuhaf modda açılır.
- **iframe:** adresin yalnız `#` sonrası değişince sayfa yeniden yüklenmez. `screens.html` her ekranda yeni bir iframe oluşturur; böyle kalmalı.
- **CSS:** uygulamanın `secondary-button` sınıfının boyutu yok (yalnız renk). Varyantlarda `nf-btn nf-btn-lg` kullan.
- **Mermaid:** etiketlerde `<br/>` kullanma; tek satır etiket yaz.
- **Bulut ortamı:** unpkg ve jsdelivr çıkış vekilinde kapalı. İkonlar bu yüzden PAGES paketinden çıkarıldı (`icons.json`).
