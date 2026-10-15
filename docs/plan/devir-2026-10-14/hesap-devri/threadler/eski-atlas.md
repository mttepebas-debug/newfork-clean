# Devir raporu: "Eski atlas silme" thread'i (sonra backlog listesi ve belge saat dilimi kararı)

> **Yeni hesapta Projects yok (15 Ekim 2026):** bu rapor eski hesabın Projects düzeninde yazıldı. "Thread", "koordinatör", "proje sohbeti", "karar kartı", "PC tren thread'i / Remote Control", "brief" ve `/mnt/project-files/X` yolları `../NASIL-DEVAM.md` bölüm 0'daki sözlükle okunur: iş tek bir Claude Code oturumunda (ana oturum, Mert'in bilgisayarında) yürür; proje dosyaları `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\` (PD) altındadır ve `/mnt/project-files/X` = `PD\X`; sondaki "brief" ana oturuma (ya da ek oturuma) yapıştırılacak ilk mesajdır; karar kartı yerine numaralı seçenekli soru sorulur.

> **PAGES emekli (Mert, 15 Ekim 2026):** ekran ekran belge sayfaları (PAGES) artık kurulmaz, güncellenmez, yayınlanmaz; eski PAGES Artifact'leri yeni hesapta yeniden kurulmaz. Bu rapordaki PAGES adımları çıkarıldı; kalan PAGES sözleri yalnız geçmiş bilgisidir. `PAGES/_kaynak` yalnız varyant sayfalarındaki "Original" görüntüsünü demo veriyle çekmek için araç olarak kalır.

Thread: proje sohbetindeki "gözükmüyor başka threads e devret" mesajıyla açılan thread.
Rapor tarihi: 14 Ekim 2026, 09:45 civarı (Kaliforniya saati).

## 1. Amaç
Bu thread'de üç iş yapıldı:
1. Library'deki 18 eski sayfa atlası Artifact'ını yedekleyip silmek ve Artifact klasör dizininden çıkarmak (Mert: "Eski atlasi masaüstüne yeni bir klasor açıp yedekle, libraryden sil", ardından "sen sil").
2. Backlog'u bu thread'de listelemek (Mert: "Backloglari listeler misin bu chatte").
3. "Birincil lokasyonu olmayan kişi (ör. owner) son tarihli belgeyi gönderemiyor" maddesi (BL-559): ne olduğunu anlatmak ve kararını almak.

## 2. Bitenler
- **Eski atlas silindi.** 18 sayfanın 18'i Library'den gitti: 14'ünü bu thread sildi, 4'ü daha önce silinmişti. Yedek Mert'in masaüstünde, "Eski sayfa atlasi yedegi 2026-10-11" klasöründe. Silinen kimliklerin listesi: `/mnt/project-files/pages/atlas/source/tools/atlas.json`.
- **Artifact klasör dizini güncellendi.** Atlas satırları çıkarıldı, backlog sayfası eklendi. Dizin: https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471 (son yayın v15). Veri dosyası: `/mnt/project-files/pages/kaynak-bandi/artifactlar.json`.
- **Backlog listesi sayfası yayınlandı:** https://claude.ai/artifact/7EiSLRANsdm2jyeh9kzjHT ("Newfork Backlog"). Gruplar açık, kararda bekleyen, sırada ve bitti. Kaynak: `coord/kayit2` dalındaki `docs/plan/BACKLOG.md`, o günkü uç 81d3a0db, kayıtlar 1074'e kadar. Sayfa dosyası: `/mnt/project-files/pages/backlog-listesi/backlog-listesi.html`.
- **Belge saat dilimi maddesi doğrulandı:** 12 Ekim'de hem main'de (76a382a) hem canlı veritabanında hâlâ geçerliydi. Canlıda lokasyonu olan 45 kişiden 2'sinin belge saat dilimi yoktu. Hepsi test verisi.
- **Mert'in kararları (12 Ekim):**
  - Birincil lokasyon herkese zorunlu: owner, Remote kişi ve "Exclude from schedule" işaretli kişi dahil (Mert'in cümlesi: "1. lokasyon herkese zorunlu olsun schedule gridde gözükmesini istemiyorlarsa exclude from schedule'a basılır").
  - Settings → Departments and Jobs → iş çekmecesine "Exclude from schedule" gelir. Mert kartta "A. Bütün iş" seçti: işaretlenen iş ızgarada kimse için görünmez. Sonra "bi önceki soruyu geri aç" dedi; kart yeniden açıldı ve **henüz yeniden cevaplanmadı**.

## 3. Yarım kalan iş
- Belge saat dilimi ve "Exclude from schedule" işinin kodu başlamadı. Dal yok, commit yok.
- Bu değişiklik 28 ve 30 Eylül kararlarını geri alıyor. Bugün owner, Remote kişi ve "Exclude" işaretli kişi lokasyonsuz kaydedilebiliyor; owner çekmecesinde de "Primary" seçeneği yok. Bunlar `KARARLAR.md` "Owner'ın çalışan kaydı" ve "Management departmanı" maddelerinde yazılı. Yeni karar henüz `KARARLAR.md`'ye yazılmadı; kayıtlar yalnız `coord/kayit2` dalına, Bilgisayarındaki Claude yazar.
- Mert, 12 Ekim'de konusu boş bir "derin araştırma" komutu gönderdi. Konu sordum (öneri: 7shifts, Homebase, When I Work ve Deputy ana lokasyonu ve programdan gizlemeyi nasıl yapıyor). Cevap gelmedi; araştırma başlamadı.

## 4. Mert'ten beklenen
1. **Departments and Jobs iş çekmecesindeki "Exclude from schedule" neyi gizlesin?** (yeniden açılan kart)
   - A. Bütün iş (önerilen, ilk seçimi buydu): iş ızgarada kimse için görünmez.
   - B. Kişi + iş: yalnız o kişinin o işi gizlenir.
   - C. Gerek yok.
2. **"Remote" düğmesi ne olsun?** (cevaplanmamış kart)
   - A. Remote kalksın (önerilen): lokasyon zorunlu olunca işi kalmıyor.
   - B. Yalnız bilgi etiketi olarak kalsın.
3. İsterse derin araştırma konusunu onaylaması.

## 5. İlgili dosyalar ve linkler
- Artifact klasör dizini: https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471
- Backlog listesi: https://claude.ai/artifact/7EiSLRANsdm2jyeh9kzjHT
- Atlas silme kontrol listesi (eski; Mert isterse kendisi silebilir): https://claude.ai/artifact/Mi61KAVADkCqcHN5w4B556
- `/mnt/project-files/pages/kaynak-bandi/` (`artifactlar.json`, `kayit.py`, `bant.py`, `dizin.py`, README)
- `/mnt/project-files/pages/atlas/source/tools/atlas.json`
- `/mnt/project-files/pages/backlog-listesi/backlog-listesi.html`
- Kod:
  - `supabase/migrations/20260916004956_bl052_document_reference_timezone.sql` (`app_private.document_employee_timezone`)
  - `supabase/migrations/20261006000000_documents_and_onboarding_ask_the_core.sql` satır 1806 (saat dilimi yoksa gönderimi reddeden kontrol)
  - `packages/shared/src/index.ts` (`employeeInputSchema`, `employee.location_required` cümleleri)
  - `apps/web/src/employees/EmployeeDrawer.tsx` (Remote ve Exclude düğmeleri)
  - `apps/web/src/views/OwnerOnboardingPage.tsx`
  - `apps/web/src/settings/JobAssignmentsDrawer.tsx` (iş çekmecesi)

## 6. Yeni hesaba taşınacak bulgular
- **Belge saat dilimi bugün nasıl çalışıyor:** belge saat dilimi kişinin birincil lokasyonundan gelir. Birincil lokasyonu yoksa yalnız Remote ya da "Exclude" işaretli kişi için `employee_profiles.document_timezone` alanına bakılır. O da yoksa son tarihli belge "Document timezone needs administrator configuration" hatasıyla reddedilir. Birincil lokasyon herkese zorunlu olunca bu yedek alan gereksizleşir; ikiz sistem kalmasın diye silinmeli.
- **Artifact silme onayı:** onay penceresi Project thread'inde görünmez, thread'in Claude Code oturum sayfasında çıkar. Bilgisayar kontrolü bunun yerine geçmez. Koordinatörün sonraki kuralı: Artifact silme, Mert açıkça istemedikçe asla çağrılmaz.
- **Yayın hatası:** `/mnt/project-files`'tan yayın "source file changed between approval and publish" hatası verebiliyor. Çözüm, dosyayı oturumun geçici klasörüne kopyalayıp oradan yayınlamak.
- **Backlog sayfasında iki eşleşme bulunamadı:** "sırada" olarak verilen "Availability çift kapı" ve "belge çekmecesi karar düğmeleri" backlog numarasına eşlenemedi. Sayfadaki otomatik sınıflandırmanın bir kısmı bayat olabilir.

## 7. Yeni thread için brief taslağı (iki kart cevaplanınca)
```
İŞ: BL-559 — Birincil lokasyon herkese zorunlu; iş için "Exclude from schedule"
Mert'in kararları (12 Ekim 2026): birincil lokasyon owner, Remote ve Exclude işaretli kişi dahil herkese zorunlu; Departments and Jobs iş çekmecesinde "Exclude from schedule" (cevabına göre: bütün iş ızgarada gizlenir); Remote kararı: <kart cevabı>.
Bitti ölçütü:
- Kayıt, onboarding, davet ve owner kaydında birincil lokasyon zorunlu (sunucu ve form aynı kural, aynı ret cümlesi).
- Owner çekmecesinde "Primary" seçilebilir.
- document_employee_timezone yalnız birincil lokasyondan okur; employee_profiles.document_timezone ve onu kullanan kod silinir, retired_objects_stay_gone'a eklenir.
- Kuralı bozan test verisi düzeltilir ya da silinir.
- Jobs tablosuna ızgaradan gizleme alanı; Schedule okuması bu işi göstermez; iş çekmecesinde düğme.
- Önce kırmızı pgTAP ve vitest; yetki matrisi ve katalog güncel.
Sınıf: incelemeli (yetki, canlı DDL, var olan fonksiyon gövdesi değişiyor → canlıda riskli migration: nf-guvenlik ONAY + koordinatör "gönder").
İlgili kararlar: KARARLAR "Owner'ın çalışan kaydı", "Management departmanı ve Owner işi" (ikisi de güncellenecek).
Not: Mert'e plan numarası tek başına yazılmaz; saatler Kaliforniya saatiyle.
```
