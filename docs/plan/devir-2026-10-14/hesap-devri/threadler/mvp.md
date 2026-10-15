# Devir: "MVP listesi ve ilerleme planı" thread'i

> **Yeni hesapta Projects yok (15 Ekim 2026):** bu rapor eski hesabın Projects düzeninde yazıldı. "Thread", "koordinatör", "proje sohbeti", "karar kartı", "PC tren thread'i / Remote Control", "brief" ve `/mnt/project-files/X` yolları `../NASIL-DEVAM.md` bölüm 0'daki sözlükle okunur: iş tek bir Claude Code oturumunda (ana oturum, Mert'in bilgisayarında) yürür; proje dosyaları `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\` (PD) altındadır ve `/mnt/project-files/X` = `PD\X`; sondaki "brief" ana oturuma (ya da ek oturuma) yapıştırılacak ilk mesajdır; karar kartı yerine numaralı seçenekli soru sorulur.

- Yazıldığı an: 14 Ekim 2026, sabah 9:50 (California).
- Thread: Newfork-clean project'i, Mert'in 14 Ekim sabah 3:45 (California) tarihli mesajıyla açılan thread ("repoyu appi genel şartlarıyla incelesen? mvp ye çıkmamız için neler gerek bana bir liste ve ilerleme planı yapsan?").
- İş türü: salt okuma. Kod değişmedi, main'e ya da canlıya dokunulmadı.
- İncelenen kod: main `be055596` (14 Ekim sabah ~3:17 California).

## 1. Amaç
Mert, repoyu ve uygulamayı bir bütün olarak inceleyip şunları istedi:
- MVP'ye çıkmak için gerekenlerin listesi;
- bir ilerleme planı.

Ardından iki istek daha geldi:
- (sabah 3:51) "listeyi chata yaz, 17:00'den sonra yayınla kuralını iptal et";
- (sabah 4:15) "kurulu özelliklerin hangileri kanıtlı hangileri değil".

## 2. Durum
| İş | Durum |
|---|---|
| MVP listesi ve ilerleme planı | **Bitti.** Sohbete yazıldı (14 Ekim sabah 3:53), tam sayfa dosyada. |
| Artifact olarak yayın | **Yapılmadı.** Mert yayını beklemek istemedi; liste sohbette. Koordinatör yeni yayın yapılmamasını istedi. Yeni hesapta istenirse dosyadan tek seferde yayınlanır. |
| "Hangi özellikler kanıtlı" | **Bitti.** Sohbete yazıldı (14 Ekim sabah 4:16); özeti aşağıda, §4. |
| Mert'in 8 kararı (§5) | **Cevap bekliyor.** Mert henüz hiçbirini cevaplamadı. |

Yarım kalan kod, dal ya da test yok. Bu thread'in dalı (`claude/project-thread-ak101x`) main ile aynı; push edilecek bir şey yok.

## 3. Dosyalar
- `/mnt/project-files/notes/mvp/mvp-yol-haritasi.html`: tam rapor sayfası, tek dosya, dış bağımlılık yok. İçinde müşteri yolculuğu tablosu, A–D listeleri, Faz 0–7 planı, maliyet tablosu, 8 karar ve dört başlık var.
- Repoda ilgili kaynaklar:
  - `docs/plan/mvp/RESEND.md`: e-posta servisi ölçümü, 6 Ekim.
  - `docs/plan/research/stripe-billing-2026-09-27.md`: Stripe planı. Bu bir araştırma; karar değil.
  - `docs/plan/KARARLAR.md`: "1.4 MVP sınırı" bölümü.

## 4. Bulgular (yeni hesaba taşınacak)

### 4a. MVP'yi durduran "satış ve açılış" katmanı
Kanıtlar main `be055596`'dan.
1. **Ödeme yok.**
   - `apps/` ve `api/` içinde Stripe kodu, bağımlılığı ya da webhook yok.
   - `workspace_entitlements` tablosu var (`supabase/migrations/20260908180000_owner_onboarding_trial_entitlement.sql`). Kurulum bitince 14 günlük deneme satırı yazılıyor ama hiçbir kod bu satırı okumuyor: deneme bitince bir şey olmuyor.
   - İkinci workspace açan owner yeniden deneme alabiliyor (BL-059).
2. **Canlıda e-posta yok.**
   - Resend kodu var (`apps/api/src/email/resend-email.ts`), ama canlıda anahtar ve gönderen adresleri yok (`docs/plan/mvp/RESEND.md`).
   - Sonuç: davet "Invitation delivery failed" veriyor, şifre sıfırlama gitmiyor. Yedek yol olarak bağlantı kopyalama var.
   - Kayıt onayı Supabase'in kendi postacısıyla gidiyor (saatte yaklaşık 2 e-posta); kendi SMTP ayarı yok (`supabase/config.toml`).
   - Dış bir zamanlayıcı her dakika `/api/internal/cron/{email-dispatch,push-dispatch,billing}` adreslerini çağırıyor ve 404 alıyor.
3. **Yasal sayfalar "Pre-release".** `apps/web/src/public/PublicTrustPages.tsx`: Terms "not yet offered as a commercial service" diyor. Privacy'de SSN cümlesi var (BL-1092).
4. **Tanıtım ve fiyat sayfası yok.** `/` adresi `/app`'e, oradan giriş ekranına gidiyor (`apps/web/src/App.tsx:602`).
5. **Hata ve güvenlik temeli eksik.**
   - Hata sınırı (ErrorBoundary) yok; bir bileşen çökünce sayfa beyaz kalıyor (BL-1075).
   - Sentry gibi bir hata izleme yok.
   - `vercel.json`'da güvenlik başlığı yok.
   - Genel istek sınırı yok.
   - Veritabanı yedeği belgelenmemiş.
6. **Canlı ayar.** Müdürün onboarding'de elle "activate" adımı, canlıda `ONBOARDING_PRODUCTION_READY=true` olmadan 55000 hatası veriyor (`apps/api/src/app.ts:1037`). Bu kilit eski SSN döneminden kalma. Otomatik aktifleşme yolu çalışıyor.

### 4b. Çekirdek akış hataları (backlog'da kritik ya da yüksek)
- Rol × erişim test turu: Mert bunu "MVP öncesi kapı" diye işaretlemişti (BL-838).
- Bağlantı havuzunu tüketen tekrar hataları; yayın önizlemesi hâlâ açık (BL-958, kritik).
- Başka lokasyona taşınan vardiyadan sonra Edit açılmıyor (BL-759).
- Vardiyası olan güne Closed day kaydedilemiyor (BL-882).
- Hazır Manager rolünde belge izni yok (BL-560).
- Kurulum sihirbazı hataları (BL-917, BL-632, BL-1016).
- Takasta yol/dinlenme kuralı uyarmak yerine engelliyor (BL-725).
- İki lokasyonlu izin onayı takılıyor olabilir (BL-990).
- Eski "izni kısaltıp vardiya al" akışı yeni kurala aykırı (BL-995).
- Undo görünmeyen değişikliği geri alabiliyor (BL-997).

Orta önemde: BL-559, BL-821, BL-1042, BL-860, BL-861, BL-859, BL-921, BL-627, BL-1057; ayrıca Employees'ta "Send reminder" hatası.

Backlog sayımı (`coord/kayit2`, 12 Ekim): yaklaşık 672 açık, 459 kapalı. Açıkların önem dağılımı: 2 kritik, 19 yüksek, 237 orta, 412 düşük.

Kayıtlarda açık görünüp main'de düzelmiş olanlar: BL-959, BL-910.

### 4c. Hangi özellikler kanıtlı (Mert'e verilen cevap)
"Kanıt", her trende koşan ve main `be055596`'da yeşil geçen otomatik testler demek. Testler Mert'in PC'sindeki test ortamında koşuyor, canlıda değil. `e2e/karantina.txt` boş; atlanan e2e testi yok.

**Uçtan uca kanıtlı** (32 Playwright dosyası, `e2e/flows/`):
- giriş ve iniş;
- şifre sıfırlama ve değiştirme;
- owner kurulumunda yasal ad;
- davet ve kabul, hatırlatma;
- çalışan onboarding'i;
- Schedule: yayın, sürükle-bırak ve işaretler, Undo, çıkış uyarısı, kilit, çok lokasyon, not, canlı kanal, New Schedule ve şablon, Export, availability uyarısı;
- izin onayı (iki lokasyon, red, admin ve owner);
- swap ve cover;
- belgeler;
- duyurunun hedef kitlesi ve arşivi;
- Settings → Locations ve Jobs;
- müdürün çalışan görünümüne geçişi;
- sahiplik devri;
- lokasyondan çıkarma;
- bildirim ayarlarını sıfırlama.

**Yalnız veritabanı testiyle kanıtlı** (204 pgTAP dosyası); ekran akışı test edilmiyor:
- Important Dates ve kapalı gün;
- Availability girişi;
- Employees çekmecesi: arşiv, geri alma, işten çıkarma;
- bildirim merkezi;
- Workspace ana sayfası;
- Roles;
- Settings'in diğer sayfaları;
- Workspaces seçimi.

**Kanıtsız:**
- ödeme;
- canlıda e-posta (testte taklit ediliyor);
- Lineup;
- hesap silme ve kurtarma;
- telefon görünümünün çoğu;
- yasal sayfalar.

Bazı pgTAP dosyaları bilinen hatalar için `todo` taşıyor. Örnekler: `people_behind_the_catalog_ask_the_core`, `communication_operations`, `workspace_home_reads_by_the_right_rule`; BL-759 de bunlardan biri.

Önerilen: en riskli üç akışa (Employees arşiv ve geri alma, kapalı gün, Availability girişi) e2e testi eklemek ve canlıda bir açılış provası yapmak.

### 4d. Kayıtların bayatlığı
- `DURUM.md`, hem repoda hem `/mnt/project-files`'ta, 9 Ekim'de kalmış.
- `docs/plan/EKRAN-PLANI.md` durum tablosu 7 Ekim tarihli.
- `docs/plan/ekranlar/*/EKRAN.md` listeleri 8 Ekim tarihli; ✅ sayıları gerçeğin altında. Örnekler: Schedule 27/100, Requests 3/108, Employees 8/59.
- 18 ekrandan yalnız 3'ünün (Schedule, Requests, Employees) kabul listesi var.
- `SORULAR.md`'de yaklaşık 35 açık soru var.

### 4e. Maliyet tahmini (liste fiyatları; hesap açmadan önce kontrol edilmeli)
| Kalem | Fiyat | Not |
|---|---|---|
| Vercel Pro | $20/ay | Hobby planı ticari kullanıma izin vermiyor. |
| Supabase Pro | $25/ay | |
| Resend | Ücretsiz plan 3.000 e-posta/ay | |
| Stripe | %2,9 + 30¢ | Abonelikte +%0,7. |
| Sentry | Ücretsiz katman | |
| Alan adı | ~$12–20/yıl | |

Mert'in bugün hangi planda olduğu ölçülmedi.

## 5. Mert'ten beklenen (cevaplanmadı)
1. MVP listesi onayı. D bölümünde MVP sonrasına bırakılması önerilenler:
   - bildirim sisteminin baştan tasarımı;
   - telefon uygulaması, push ve SMS;
   - düşük önemli backlog;
   - Lineup'ın yeni tasarımı.
2. Fiyat modeli: lokasyon başı, çalışan başı ya da sabit paket.
3. Alan adı ve şirket bilgisi.
4. Resend'in ne zaman bağlanacağı. Giriş modeli kararı (B1) buna bağlı.
5. Vercel Pro ve Supabase Pro'ya geçiş.
6. Yasal metinler avukattan mı, hazır şablondan mı.
7. Lineup MVP'de mi. Karar defterinde "Lineup'a bugün yatırım yapılmaz" yazıyor, ama şu an tasarımı yürüyor.
8. Birbirine dokunmayan işlerde işçi sınırının 2 olması. CLAUDE.md'ye göre bu yalnız Mert'in komutuyla değişir.

## 6. Yeni hesapta nasıl devam edilir
- Bu iş salt okumaydı; sürdürülecek kod yok. Yeni hesapta yapılacak tek şey, Mert'in §5'teki kararlarını alıp planı başlatmak.
- Dosya `/mnt/project-files/notes/mvp/mvp-yol-haritasi.html`. Yeni hesapta dosya bilgisayarda: `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\notes\mvp\mvp-yol-haritasi.html`; tarayıcıda açılır. Bu thread repoya commit atmadı.
- Sayıları kullanmadan önce yeniden ölçün; main değişmiş olabilir. Ölçüm kaynakları:
  - `git log origin/main`;
  - `e2e/flows/`;
  - `docs/plan/BACKLOG.md` (`coord/kayit2` dalındaki daha yeni).

## 7. Yeni thread için brief taslağı
```
İŞ: MVP-PLAN — MVP listesini Mert'in kararlarıyla kesinleştirip Faz 0–1'i başlatmak.
Bağlam: 14 Ekim 2026 incelemesi /mnt/project-files/devir/threadler/mvp.md ve
notes/mvp/mvp-yol-haritasi.html (main be055596). Salt okur incelemeydi.
Önce: main'in bugünkü sha'sıyla şu dört şeyi yeniden ölç: ödeme kodu, canlı e-posta,
yasal sayfa bandı, açık kritik/yüksek backlog.
Mert'e numaralı seçenekli sorularla sor (her sorunun son seçeneği "Yazarak cevap vereceğim"):
§5'teki 8 karar. Önce durduranlar: liste onayı, fiyat modeli, alan adı.
Bitti ölçütü: onaylı MVP listesi KARARLAR.md "1.4 MVP sınırı"na yazılmış
(kayıt thread'i yazar); Faz 1 hesap adımları Mert için ekran ekran yönerge olarak hazır.
Dokunma: kod, canlı, main. Ödeme ya da hesap açılışı Mert'in kendi "evet"i olmadan yapılmaz.
Dil: Türkçe, sade; saatler California; plan numaraları yalnız parantez içinde.
```
