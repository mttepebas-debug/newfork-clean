# EKRAN-06 Documents — ekranı "bitmiş" tanımına getirmek
Status: draft — 2026-10-06 (`nf-planlama`, koordinatörün görevi; ekran planının 6. adımı).
Session: -   Branch: task/ekran-06-<dilim>   Worktree: newfork-wt/ekran-06-<dilim>   DB: A1 ve D `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). A1 ve B1 `nf-guvenlik` zorunlu (yerleşik Manager'a belge izni: BL-560; karar düğmelerinin kişiye göre açılması: BL-827; yayındaki türün arşivinde zorunlulukların kapanması: BL-821); ekran değişen C1 `nf-gorsel-qa`.
Risk sınıfı (toplam): **R3** — yerleşik Manager rolüne izin yazılıyor (BL-560, 469 rol); çekmece karar yetkisini kişiye göre gösteriyor (BL-827); arşiv zorunlulukları ve kısıtı kapatıyor (BL-821); S10 (a) seçilirse depodan geri alınamaz silme (BL-826). Geri kalanı R2 (okuma fonksiyonu, bildirim sıklığı, sayfalama) ve R1 (metin, görünüm).
Hat sırası (koordinatör, 2026-10-06): **EKRAN-05'ten sonra** — veri hattı EKRAN-05 A1 bitince A1; web hattı EKRAN-05 B1'den sonra B1; arayüz hattı EKRAN-05 V / C1'den sonra V / C1.

**Kaynaklar:** keşif `docs/plan/ekranlar/06-documents/OZET.md` (E6-01…E6-28, §3 prototip, §4 S1–S10, §5 KK-180) ve `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md`; KARARLAR Ürün kuralları (M2 görünürlük, D2 müdür onaylar, "Manager Settings'te katalogu salt okunur görür", owner belgeden muaf), Genel → DOC-TABLE (sütunlar, boş hâl metinleri), Archive iki tık kırmızı (Mert 2026-10-05), Requests G1 (soluk + neden satırı), Employees "Add employee → Documents adımı Documents ekranının (6) turunda" (Mert 2026-10-06); ILKELER P09, P21, P26; CLAUDE.md §8 (geri alınamaz silme), §9; SABAH-SORULAR S22 (Employees telefon); KK-180. **`C-gorsel.md` henüz yok** (ağır iş, izinle); C1 başlamadan önce okunur, bulguları C1'e eklenir.

**Tazelik 2026-10-06 (`origin/main` `53545e48`):** keşif aynı gün (`e666f2ec` / `f8e78dc4`); arada yalnız `docs/` değişti (OZET ve raporlar). Dilim başlarken kendi ölçümünü yapar.

## Goal
Documents ekranını (Settings → Documents: belge türleri listesi, düzenleyici, Publish / Unpublish, Archive, sıra; Employees → Documents: liste, sekmeler, süzgeçler, inceleme çekmecesi; Employees kişi çekmecesinin Documents bölümü; bunların API, DB, bildirim ve dosya deposu) EKRAN-PLANI'nın "bitmiş sayılır" tanımına getirmek. Sayfalama (25 / 50 / 100) bu turda.

Bir kişi için: Kadıköy müdürü Ayşe Employees → Documents'ı açar (S1 (a) ise), Ali'nin Food Handler kartını çekmecede önizler ve onaylar; History'de "Approved by Ayşe · Oct 3, 2026, 7:42 PM" görür. Eş müdür Deniz'in kartında düğmeler soluktur, altında "The owner or an admin decides this document." yazar. Mert yayındaki "Alcohol server permit"i arşivlemek isteyince kaç kişiden istendiğini görür; arşivden sonra Ali kısıtlı kalmaz. Ali garsonluğa geçince eski izin belgesi "Removed" sekmesinde durur. 400 satırlık listede Ayşe ilk 50'yi görür.

## Ürün kuralları (yazıldığı gibi uygulanır)
- **KK-180 (koordinatör, 2026-10-06; OZET §5):**
  - (1) Yerleşik Manager'a belge izni (BL-560) S1'i bekler; E6-22 (BL-680) ona bağlı.
  - (2) Salt hatalar bu turda, sorusuz (liste OZET §5 madde 2). Kısa UI metinleri aşağıda C1'de yazılı (P21); Mert ekran görüntüsünde görür.
  - (3) Hatırlatma `expiry_warning_days`'i okur, 30 / 7 / 1 sabiti kalkar; Workspace'in işiyle aynı kaynak; BL-806 ile birlikte (BL-822).
  - (4) Employees → Documents sunucuda, Settings → Documents istemcide sayfalanır; kişi çekmecesi kişi başına okuma (BL-787, P19).
  - (5) Düzenleyicinin kapanırken sorması Mert'te (S9, BL-833). (6) Depodan silme Mert'te (S10, BL-826).
  - (7) Kayıt temizliği yapıldı (BACKLOG "Kapanan maddeler"). (8) Employees → Documents telefonu SABAH-SORULAR S22 Employees cevabıyla.
- **KARARLAR:** müdür lokasyonundakilerin belgelerini görür (M2) ve onaylar (D2), tanımları salt okunur görür; bekleyen ve reddedilen belge yalnız karar veren ve sahibine görünür (FB-6.6 S2, bugün doğru); owner belgelerden muaftır, isteğe bağlı yükleyebilir; yüklenen dosya zorunluluk kapanınca da dosyada kalır; Archive iki tık kırmızı, Restore tek tık; DOC-TABLE sütunları ve boş hâl metinleri değişmez (S5 (b) seçilmedikçe).
- **ILKELER P26:** belge inceleme çekmecesi kapanırken sorar (BL-467, bugün doğru); düzenleyici S9'a göre.
- **CLAUDE.md §8:** depodan dosya silmek (BL-826) yalnız Mert'in S10 cevabıyla; canlıda gerçek dosya silinecekse ayrıca Mert'e sorulur.
- **CLAUDE.md §9:** bilinmeyen ve kapsam dışı belge aynı cevabı alır (BL-835); ikiz ve geriye uyumluluk dalı silinir (BL-836, BL-837).

## Açık sorular (CLAUDE.md §13; ekran 6 turunda Mert'e — metin OZET §4'te)
- **S1** — tur kapsamı: KARARLAR'da onaylı olanlar bu turda (müdüre belge izni, karma akış, Add employee → Documents, önizleme + Apply), raf ayrı (önerilen) / raf tamamı önce sohbette / yalnız ekran hataları. → BL-560, BL-680, BL-825; A1 + B1 + C1.
- **S2** — birincil lokasyonu olmayan kişinin belge saat dilimi: önce sohbette (önerilen, P18). → BL-559; A1 (yalnız cevaptan sonra).
- **S3** — Optional → Required yükseltmede davette atlanmış muafiyetler: yayın önizlemesi sorsun (önerilen). → BL-585; A1 + C1.
- **S4** — mevcut kadro için toplu "on file": owner / admin, gerekçeli (önerilen). → BL-581; A1 + B1 + C1.
- **S5** — listeye "Who needs it" / "Exempt (N)" sütunu: eklenmesin, madde kapansın (önerilen). → BL-583; yalnız (b) ise V + C1.
- **S6** — eksik belge bildirimi sıklığı: ilk gün, haftada bir, son tarihten 1 gün önce (önerilen). → BL-823; A1.
- **S7** — yayındaki tür arşivlenince: arşiv Unpublish'in işini yapar, önce etki önizlemesi, iki tık kırmızı (önerilen). → BL-821, BL-595; A1 + B1 + C1.
- **S8** — çekmecede dosya önizlemesi: PDF ve resim çekmecede, Download ayrı (önerilen). → BL-829; B1 + V + C1.
- **S9** — düzenleyici kapanırken: yalnız Step 2'ye geçildiyse ya da açıklama yazıldıysa sorar (önerilen). → BL-833; C1.
- **S10** — kaldırılan taslak ve doğrulanamayan yükleme: her gece, bir günden eskiyse depodan silinir (önerilen; geri alınamaz). → BL-826; A1 (+ API worker, B1).
- Cevap gelmeden yalnız ilgili kısım bekler; dilimin geri kalanı yürür.

## Bulgu → dilim eşlemesi
| Bulgu | Dilim | Backlog |
|---|---|---|
| E6-01 yerleşik Manager'da belge izni yok | A1 (izin, S1) + B1 (menü / rota `can()`) | BL-560 |
| E6-02 yayındaki türü arşivlemek zorunlulukları kapatmıyor | A1 + B1 + C1 (S7) | BL-821 |
| E6-03 birincil lokasyonsuz kişi süreli belge gönderemiyor | A1 (yalnız S2 sonrası) | BL-559 |
| E6-04 "Warn before expiry" çalışmıyor | A1 | BL-822 (+ BL-806) |
| E6-05 eksik belge bildirimi her gün | A1 (S6) | BL-823 |
| E6-06 yapılamayacak karar düğmeleri açık | B1 (kişiye göre karar bilgisi) + C1 (soluk + neden) | BL-827 |
| E6-07 kapanan zorunluluk kayboluyor | B1 (shared süzgeç) + C1 (sekme, çip) | BL-824 |
| E6-08 ham sunucu cümleleri, 409 sonrası eski çekmece | B1 (hata eşleme, yenileme) + C1 (metin) | BL-828 |
| E6-09 sayfalama yok | A1 (sunucu sayfası) + B1 (API, veri, kişi başına okuma) + C1 (sayfa çubuğu) | BL-787 |
| E6-10 önizleme yok | B1 (satır içi imzalı adres) + V + C1 (S8) | BL-829 |
| E6-11 karma akış yok | A1 + B1 + C1 (S1) | BL-825 |
| E6-12 Archive tek tık | C1 | BL-595 |
| E6-13 telefon | V (S22'ye göre) + C1 | BL-599 |
| E6-14 ham tarih ve kod adları | B1 (BL-468 gönderim) + C1 | BL-674, BL-468, BL-830 |
| E6-15 sekmeler ve tablo rolü | C1 | BL-602, BL-593 |
| E6-16 ham zod cümlesi | B1 (şema mesajı) + C1 | BL-621 |
| E6-17 "Decision saved" kayboluyor | C1 | BL-561 |
| E6-18 süresi dolmuşta Approve açık | C1 | BL-673 |
| E6-19 Move up / down süzgeçte | C1 | BL-672 |
| E6-20 Status ham koda göre sıralanıyor | C1 | BL-831 |
| E6-21 Approve'da ret gerekçesi | B1 | BL-832 |
| E6-22 müdür türün ayrıntısını açamıyor | C1 (E6-01 sonrası) | BL-680 |
| E6-23 düzenleyici kapanırken sormuyor | C1 (S9) | BL-833 |
| E6-24 depoda kalan dosya | A1 + B1 (S10) | BL-826 |
| E6-25 403 / 404 | A1 | BL-835 |
| E6-26 ikiz ve ölü kod | A1 (DB imzası) + B1 (istemci, bağlantı dalı) + C1 (ölü bileşen, `applyBusy`, "Named people") | BL-836, BL-837, BL-554 |
| E6-27 küçük metin ve form | C1 | BL-834, BL-469, BL-664 (3) |
| E6-28 toplu "on file", sütunlar, yükseltmede muafiyet | S3–S5'e göre | BL-581, BL-583, BL-585 |
| Prototip taşı: P2 R3, R7 / R16, R11; P2 C1–C15 (S1); P3 D14, D15, D16 (S1), S7; PHONE-MGR2 | C1 (+ B1 C1–C15 / D16 verisi) | yukarıdakiler |
| Test boşlukları (OZET §2) | ilgili dilim | — |

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri önce, sunum sonra; aynı dosyaya iki oturum aynı anda konmaz.

### V — varyantlar (`nf-arayuz`; R1, main'e girmez)
- **Ne:** gerçek uygulamada DEV'de query param ile 2–3 varyant, 1440 ve 390: (1) Employees → Documents telefonda — yalnız S22'nin Employees cevabı varyant istiyorsa (KK-180 (8): ayrı soru açılmaz, S22'nin seçimi uygulanır); (2) P3 E9 liste çerçevesinin bittiği yer; (3) S8 (a) seçilirse çekmecede önizleme görünümü (yan panel / çekmece içinde tam genişlik / ayrı katman).
- **Bağımlılık:** S22 ve S8 cevabı (ilgili varyant için); EKRAN-05 V (hat sırası).
- **Done when:** ekran görüntüleri `artifacts/nf-arayuz/EKRAN-06/varyant/`; seçimler KARARLAR "Ekran kararları → Documents"a yazıldı (koordinatör); dal silindi.
- **Reviewer:** yok (Mert seçer).

### A1 — Belge veri kuralları ve yetki (`nf-db`; R3)
- **Ne:** BL-560 (S1 (a) ise: yerleşik Manager rolüne `employee_documents.read`, `employee_documents.review`, `documents.read`; mevcut 469 rol güncellenir; yeni workspace varsayılanı aynı; BL-555 aynı gün ölçülür); BL-821 (S7'ye göre: arşiv zorunlulukları duraklatır ve kısıtı kaldırır ya da yayındaki tür arşivlenemez; etki önizleme okuması); BL-822 (hatırlatma `expiry_warning_days`; BL-806'nın zamanlanmış göreviyle aynı kaynak, EKRAN-05 S6 teyidi geldiyse birlikte); BL-823 (S6'ya göre tekrar anahtarı); BL-787 (`list_employee_document_lifecycle_service` sayfa + toplam sayı + sekme sayıları; kişi süzgeci); BL-835 (bilinmeyen ve kapsam dışı belge aynı SQLSTATE + `authz.out_of_scope`); BL-836 (10 parametreli imza düşer, `retired_objects_stay_gone`'a eklenir); BL-826 (S10 (a) / (b) ise: bağlantısız dosyayı seçen okuma + silme işaretlemesi; silme işi B1'in worker'ında); S1 (a) ise BL-825'in veri kısmı (davette gerekçeli muafiyet, "Ask for a document" atama yazımı); S3 / S4'e göre BL-585 / BL-581; S2 cevabından sonra BL-559; B raporunun ucuz hücresi (servis düzeyinde M2: başka lokasyondakinin onaylı belgesi müdürün listesinde yok).
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/document_types_rls.test.sql`, `document_publication.test.sql`, `bl052_document_notifications.test.sql`, `bl052_document_lifecycle.test.sql`, `documents_on_the_core.test.sql`, `authorization_core.test.sql` (yerleşik Manager hücreleri), `retired_objects_stay_gone.test.sql`, yeni `document_type_archive_closes_obligations.test.sql`, `ci-green.txt`; gerekirse `supabase/test-support/builder.sql` (arşivli tür, kapalı zorunluluk kurulabilmeli).
- **Bağımlılık:** EKRAN-05 A1 main'de (hat sırası; aynı `authorization_*` ve `ci-green.txt`); S1, S6, S7, S10 (ilgili kısım); BL-822 için BL-806'nın durumu.
- **Done when:** (a) S1 (a) ise yerleşik Manager → aynı lokasyondaki kişinin belgesi `documents.read` ve `documents.review` izinli, başka lokasyondaki `out_of_scope` (pgTAP, önce kırmızı); 469 rolde izin sayısı SELECT ile Notes'a; (b) yayındaki tür arşivlenince açık zorunluluk 0 ve `document_actor_blocked` false, yeni gelen kişiye atama yok — ya da S7 (b) ise arşiv reddedilir (pgTAP, önce kırmızı); (c) `expiry_warning_days = 14` ile hatırlatma 14. günde, 30. günde değil (pgTAP, sabit saat); (d) S6'nın seçtiği sıklık: 21 günlük eksikte bildirim sayısı beklenen sayı (pgTAP); (e) sayfa 2 / 50 satır ve toplam sayı doğru, sekme sayıları sayfadan bağımsız (pgTAP); (f) bilinmeyen ve iş arkadaşının belge kimliği aynı SQLSTATE + ipucu (pgTAP, iki hücre); (g) 10 parametreli `save_document_type_service` yok, `retired_objects_stay_gone` yeşil; (h) servis düzeyinde M2 hücresi yeşil.
- **Test plan:** kırmızı pgTAP → migration (tek transaction + rollback denemesi) → `test:db` (`db.lock`, tek ağır iş). Canlıya migration CLAUDE.md §8 sürekli yetki koşullarıyla (yedek, ONAY, OPS-03); 469 rolün güncellemesi canlıda da SELECT ile doğrulanır.
- **Reviewer:** `nf-guvenlik` zorunlu (yerleşik rol izni, arşivin kısıtı kaldırması, ikiz silme).

### B1 — API, shared, web veri katmanı (`nf-backend`; R3)
- **Ne:** BL-827 (çekmece ve liste karar yetkisini kişiye göre alır: `can(context, "documents.review", { person })` ya da satır başına sunucudan gelen "karar verebilir" bilgisi; Employees → Documents ve kişi çekmecesi aynı yol; kimin karar verdiği bilgisi C1'in neden satırına); BL-824 (`packages/shared/src/document-lifecycle.ts` süzgecinde `removed` için ayrı sekme, "All" bugünkü anlamında kalır); BL-828 (409'da sorgu yenilenir; bilinen ret ipuçları kişi cümlesine eşlenir, kalan hata ortak hata kartına; `errorText` belge ekranlarında kalkar); BL-787 (API sayfa parametreleri, web veri katmanı, kişi çekmecesinde kişi başına okuma; Settings → Documents istemcide); BL-829 (S8 (a) ise satır içi açılan imzalı adres `download: false`, indirme ayrı; `window.open` tıklamayla aynı adımda); BL-832 (onayda gerekçe gönderilmez); BL-468 (gönderim yalnız tanımdaki alanları taşır); BL-621 (belge düzenleyicisi şemasında alan başına tek cümle, ör. "Enter a document name."); BL-837 (3) `settings/documents-data.ts` ortak `apiRequest`'e geçer, (4) `DocumentsSettingsRoute.tsx`'teki `?requirement` / `view=employees` dalı silinir; BL-557 (API owner kuralı DB'yle aynı işarete bakar); BL-826'nın silme worker'ı (S10'a göre); S1 (a) ise BL-560'ın web yüzü (menü, rota `can()`) ve BL-825'in veri / API kısmı (Add employee → Documents, "Ask for a document", önizleme + Apply); S7'ye göre arşiv etki önizlemesinin API'si.
- **Touches:** `apps/api/src/employees/document-lifecycle-routes.ts`, `document-lifecycle-service.ts` (+ `.test.ts`), `apps/api/src/settings/document-types-routes.ts`, `document-types-service.ts` (+ testler), `apps/api/src/http-error.ts` (yalnız belge ipuçları), `packages/shared/src/document-lifecycle.ts` (+ `.test.ts`), `apps/web/src/documents/document-data.ts`, `apps/web/src/settings/documents-data.ts`, `apps/web/src/documents/DocumentsSettingsRoute.tsx` (+ test), `apps/web/src/documents/EmployeeDocumentsPage.tsx`, `EmployeeDocumentPanel.tsx` (veri ve `can()`), `apps/web/src/documents/DocumentReviewDrawer.tsx` (yalnız gönderim ve yenileme; görünüm C1'de); worker dosyası (S10'a göre, `workspace-retention-worker.ts` yanında).
- **Bağımlılık:** A1 main'de; EKRAN-05 B1 main'de (hat sırası).
- **Done when:** kendi belgesi ve eş rütbe satırında `canDecide` false, yetkili satırda true (web vitest, önce kırmızı); 409 sonrası çekmece sorgusu yenilendi (web vitest, önce kırmızı); belge ekranlarında `errorText` kullanımı 0 (grep); `removed` satır "Removed" sekmesinde, "All"da yok (shared vitest); onayda istek gövdesinde `reason` yok (web vitest); `settings/documents-data.ts`'te `fetch(` 0, `DocumentsSettingsRoute.tsx`'te `requirement` / `view=employees` 0 (grep); `confirmUpload` ret dalları servis testinde (API vitest); sayfalı uç 2. sayfayı ve toplamı veriyor (API vitest).
- **Reviewer:** `nf-guvenlik` zorunlu (karar yetkisinin kişiye göre gösterilmesi, imzalı adres, silme worker'ı).

### C1 — Liste, çekmece ve düzenleyici görünümü (`nf-arayuz`; R2)
- **C görsel QA bulguları (2026-10-06, `d311a2c5`):** `docs/plan/ekranlar/06-documents/C-gorsel.md`; yeni BL-852, BL-853, BL-854, BL-855, BL-856, BL-857; ayrıca BL-851; ek kanıt BL-595. C1 başlamadan okunur.
- **Ne:** BL-595 (Archive iki tık kırmızı, `ConfirmButton`: "Archive" → "Confirm archive"; S7 (a) ise önce etki satırı); BL-827 görünümü (Requests G1 dili: soluk düğme + kilit + neden satırı); BL-824, BL-828, BL-830, BL-834, BL-673 metinleri (aşağıda); BL-674 belge kalemi (okunur tarih, workspace saat biçimi); BL-831 (Status sırası: Needs review, Missing, Expired, Rejected, Paused, Completed); BL-561 ("Decision saved" yeniden kurulumda kaybolmaz); BL-672 (süzgeç ya da sekme açıkken Move up / down soluk); BL-602 + BL-593 (ok tuşuyla sekme, iki listede aynı rol; Settings başlık satırı tablo rolünde); BL-680 (S1 (a) ise müdür türün ayrıntısını salt okunur açar, "View document type"); BL-469 ("Reason" ortak zorunlu alan işaretiyle); BL-664 (3) ("Manager approval"); BL-621 görünümü; BL-554 ("Named people" ölü yolu silinir); BL-837 (1) `DocumentDefinitionApply.tsx` silinir (S1 (a) ise yerine yeni Apply önizlemesi), (2) `applyBusy` silinir; BL-599 (Settings → Documents telefonda kart satırı; Employees → Documents S22'ye göre); BL-787 sayfa çubuğu (Requests'teki sayfalama ortak bileşene çıkarılır ya da EKRAN-02 C dilimi bileşeni main'deyse o kullanılır); BL-833 (S9'a göre); BL-829 görünümü (S8 + V seçimi); prototip taşı (P2 R3 çekmecede durum çipi, R7 / R16 okunur tarih, R11; P3 D14 sade düzenleyici cümleleri, D15, S7; PHONE-MGR2; S1 (a) ise P2 C1–C15 ve P3 D16); C raporunun bulguları (geldiğinde).
- **Kısa metin önerileri (ILKELER P21; KK-180 (2); Mert ekran görüntüsünde görür):**
  - BL-824: Employees → Documents'ta son sekme **"Removed"**; satır çipi **"No longer required"**; çekmecede tek satır **"No longer required. Uploaded files stay on file."**
  - BL-827: neden satırı **"The owner or an admin decides this document."**; admin'in kendi belgesinde **"The owner decides this document."**
  - BL-828: 409'da çekmece yenilenir ve üstte **"This document changed. You're seeing the latest version."**; öteki kayıt hatası **"Couldn't save. Try again."**
  - BL-673: süresi dolmuş sürümde Approve soluk, altında **"This version has expired. Ask for a new upload."**
  - BL-830: sürüm durumu listedeki çiple aynı (**"Needs review"**, **"Approved"**, **"Rejected"**); "superseded" → **"Replaced"**; dosya kararı **"Kept"** / **"Discarded"**; çekmecede durum listedeki çip bileşeniyle.
  - BL-674 / BL-832: tarih **"Expires Oct 1, 2029"**; History satırı **"Approved by Zeynep · Oct 3, 2026, 7:42 PM"** (onayda gerekçe yok; retteki gerekçe ikinci satırda).
  - BL-834: owner notu **"Owners aren't required to submit documents. Uploading is optional."**; hiç belge yokken **"No documents yet"** / **"Documents your team submits show up here."** (düğme yok; süzgeçli boş hâl bugünkü metniyle kalır).
  - BL-595 + S7 (a): etki satırı **"12 people are asked for this document. Archiving stops it."**
- **Touches:** `apps/web/src/documents/DocumentReviewDrawer.tsx` (görünüm), `EmployeeDocumentsList.tsx`, `DocumentExemptionAction.tsx`, `DocumentLifecycleFields.tsx`, `DocumentDefinitionApply.tsx` (silme), `documents.css`, `apps/web/src/settings/DocumentsSettingsPage.tsx`, `DocumentSettingsEditor.tsx`, `DocumentPublicationDialog.tsx`, `document-settings-editor.css`, `jobs-settings.css` (yalnız Documents telefon kuralı), ilgili `*.test.tsx`; S1 (a) ise `apps/web/src/employees/EmployeesPage.tsx` (Add employee → Documents adımı); paylaşılan sayfa çubuğu (yeri EKRAN-02 C ile ölçülür).
- **Bağımlılık:** B1 main'de; S1, S7, S8, S9 (ilgili kısım), V seçimleri; EKRAN-05 C1 main'de (hat sırası; `styles.css` ve Settings CSS sıcak).
- **Done when:** önce / sonra ekran görüntüsü 1440 + 390 (owner, müdür, admin'in kendi kartı) `artifacts/nf-arayuz/EKRAN-06/C1/`; ekranda ham kod ve ISO tarih yok (grep: `replaceAll("_"`, `toISOString` çekmecede 0); Archive iki tık; Status sıralaması önem sırasında (web vitest); süzgeç açıkken Move up soluk (web vitest); "Decision saved" onaydan sonra görünür (web vitest, BL-476 Approve gönderimi dahil); `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

### D — e2e (`nf-test`; R2)
- **Ne:** `e2e/flows/documents.spec.ts`'e eksik akışlar: reddetme + gerekçe, muafiyet, süre uzatma, indirme (ya da S8 (a) ise önizleme), süresi dolan belge (Approve soluk), yayındaki türü arşivleme (S7'nin sonucu: Ali artık kısıtlı değil), kapanan zorunluluğun "Removed"da görünmesi; S1 (a) ise müdür Ayşe'nin aynı lokasyondaki kartı onaylaması ve eş müdürün kartında soluk düğme; sayfalama (2. sayfa).
- **Touches:** `e2e/flows/documents.spec.ts`, `e2e/fixtures/documents.ts`.
- **Bağımlılık:** C1 main'de; `db.lock`; CI boşken (tek ağır iş).
- **Done when:** main CI e2e'de yeşil; `skip` / `fixme` yok.
- **Reviewer:** koordinatörün okuması (R2, test dosyası).

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | Ortak dosya (başka ekranla) | Büyüklük (puan) |
|---|---|---|---|---|---|
| V | `nf-arayuz` | R1 | S22, S8; EKRAN-05 V | — | 1 |
| A1 | `nf-db` | R3 | EKRAN-05 A1; S1 / S6 / S7 / S10 (ilgili kısım); BL-806 | `ci-green.txt`, `authorization_core.test.sql`, `retired_objects_stay_gone.test.sql`, BL-806 (Workspace) | 6 |
| B1 | `nf-backend` | R3 | A1, EKRAN-05 B1 | `packages/shared/src/document-lifecycle.ts` (Account → Documents da okur), `http-error.ts`, worker | 4 |
| C1 | `nf-arayuz` | R2 | B1, S1 / S7 / S8 / S9, V, EKRAN-05 C1 | `DocumentReviewDrawer.tsx` (Account → Documents ve onboarding de açar), sayfa çubuğu (EKRAN-02), `jobs-settings.css` | 5 |
| D | `nf-test` | R2 | C1 | — | 2 |
| **Toplam** | | **R3** | | | **18** |

## Out of scope
1. **Account → Documents** (çalışanın kendi belge sayfası) — ekran 15. Shared süzgeç (BL-824) ve çekmece metinleri (BL-828, BL-830) orada da görünür; o ekranın kendi metin ve görünüm işi (BL-592 boş tablo) ekran 15'te.
2. **Onboarding belge adımı** ve `DocumentAccessRoute` (belgesi eksik kişiyi Account → Documents'a yollayan kapı) — ekran 16; BL-728 (belgesi eksik müdür Requests'i göremiyor) EKRAN-02'de.
3. **Workspace'teki belge süresi işleri:** BL-806 (zamanlanmış görev, "expired" bildirimi), BL-807 (belge izni olmayan müdür işi görüyor) — EKRAN-05. BL-822 yalnız BL-806 ile aynı kaynağı kullanır.
4. **Settings → Roles'taki belge izinleri:** BL-555 (müdüre "Document requirements → edit") — ekran 10; BL-560 ile aynı gün yalnız ölçülür.
5. **Settings → Jobs'ta belge kapsamı uyarısı:** BL-582 — ekran 10.
6. **Raftaki belge mimarisi U1–U12** (görünürlük, sonradan yayınlanan zorunlu belge, saat dilimi) — S1 (a)'da ayrı sohbet; BL-559 S2'ye kadar.
7. **Öteki 6 veri dosyasındaki ikiz `fetch` istemcisi** (BL-837 (3) yalnız `settings/documents-data.ts`'i kapatır) — kendi ekranlarının turunda.
8. **Belge testlerinin yalnız ortak yerel DB'de kırmızı olması:** BL-497 (BL-528, BL-590 birleşti), BL-566 (BL-344 birleşti) — test kararlılığı programı (G12 / G13).
9. **BL-248** (owner'ı belgesi engelli diye elle kuran test hücresi) ve B'nin zevk önerileri (`deadline_at` maskesi, arşivli lokasyon adı, katalog tek eylem) — bulgu değil ya da test temizliği; ayrı iş.
10. **Schedule'daki belge uyarısının arşivli tür ve muafiyetle uyumu** — ölçülmedi; Schedule turunda.

## Done when (ekranın tamamı)
1. V, A1, B1, C1, D'nin Done when'i kanıtıyla Notes / Result'ta (komut + sonuç, sha).
2. E6-01…E6-28 bir dilimde kapandı ya da Out of scope'ta / Mert'in cevabıyla "yapılmaz" diye adıyla yazıldı.
3. Prototip "taşı" (P2 R3, R7 / R16, R11; P3 D14, D15, S7; PHONE-MGR2; S1 (a) ise P2 C1–C15 ve P3 D16) uygulamada.
4. KK-180 ve S1–S10'un cevapları uygulandı.
5. Tam kapı yeşil (lint, typecheck, test, build, `test:db`, etkilenen e2e); main CI yeşil.
6. 1440 ve 390 ekran görüntüleri `artifacts/nf-gorsel-qa/EKRAN-06/kapanis/`; `nf-gorsel-qa` ONAY.

## Notes / Result
-
