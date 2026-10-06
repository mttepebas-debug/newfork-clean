# EKRAN-06 Documents — keşif özeti

Keşif 2026-10-06 (gece, `nf-planlama` oturumu; koordinatörün görevi). Ölçüm `origin/main` `e666f2ec` / `f8e78dc4` (arada yalnız `BACKLOG.md`); yerel DB son migration `20261007130000` (repoyla aynı). Raporlar: `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md` (ajanların son mesajı, aynen). **`C-gorsel.md` yok:** görsel QA ağır iş; koordinatörün izniyle sonra koşar ve buraya eklenir. **Sorular SABAH-SORULAR'a eklenmedi; ekran 6 turunda sorulur** (koordinatör, 2026-10-06).

- **Ekran:** Settings → Documents (belge türleri, düzenleyici, Publish / Unpublish, Archive, sıra) ve Employees → Documents (liste, sekmeler, süzgeçler, inceleme çekmecesi: Approve / Reject / Exempt / Extend deadline, indirme, History). Owner, admin; müdür yalnız rolünde belge izni varsa. Sayfalama (25 / 50 / 100) bu turda.
- **Sınırda:** Account → Documents (ekran 15), onboarding belge adımı (ekran 16), `DocumentAccessRoute` (belgesi eksik kişiyi Account → Documents'a yollayan kapı), Schedule belge uyarısı, Workspace belge süresi işleri (BL-806 / 807), Settings → Roles (ekran 10), Employees kişi çekmecesinin Documents bölümü.
- **Güvenlik:** sızıntı yok (B: kritik / yüksek / orta 0, düşük 4). Müdür yalnız kendi lokasyonundakinin belgesini okuyor (3.232 kişi–belge çifti); bekleyen ve reddedilen belge eş rütbeye kapalı; kimse kendi belgesini onaylayamıyor; dosya kovası özel, imzalı bağlantı 5 dk ve tek dosya; dosya türü ve boyutu dört katmanda doğrulanıyor; XSS yok.
- **Asıl sorunlar:** yerleşik Manager rolünde belge izni yok (KARARLAR M2 / D2 ile çelişiyor, raf kararına bağlı); yayındaki belge türünü arşivlemek zorunlulukları kapatmıyor; hatırlatma ayarı çalışmıyor ve eksik belge bildirimi her gün sınırsız; ekranda yapılamayan karar düğmeleri; kapanan zorunluluk listeden kayboluyor.

## 1. Tek liste (önem sırasıyla)

| # | Bulgu | Nerede / örnek | Kaynak | Backlog | İşaret |
|---|---|---|---|---|---|
| E6-01 | **Yerleşik Manager rolünde hiç belge izni yok** (469 rolün 0'ı); KARARLAR M2 ("müdür lokasyonundakilerin belgelerini görür"), D2 ("müdür onaylar") ve satır 85 ("tanımları salt okunur görür") ile çelişiyor. KARARLAR D2 notu: "BL-560 — belge mimarisi raftan inince ilk iş". | Kadıköy müdürü Ayşe ne Employees → Documents'ı ne Settings → Documents'ı açabilir; Ali'nin süresi dolan kartı Mert'e ya da Zeynep'e kalır | A, B §2, D §4 | BL-560 (+ BL-680 salt okunur Settings) | leave: high / do: risky |
| E6-02 | **Yayındaki belge türünü arşivlemek zorunlulukları kapatmıyor:** çalışandan istenmeye, süresi geçtiyse kısıtlamaya devam ediyor; yeni gelenden istenmiyor; arşivde Publish / Unpublish yok, Archive tek tık. | Mert "Alcohol server permit"i arşivler; Ali kısıtlı kalır ve Schedule'ı açamaz, Mert Settings'te "Archived" görür; ertesi gün gelen Bora'dan istenmez | D Y1 | YENİ (BL-595 ile aynı düğme) | leave: high / do: moderate |
| E6-03 | **Birincil lokasyonu olmayan kişi süreli belge gönderemiyor:** "Document timezone needs administrator configuration". Yerelde 2403 kişinin 319'u. Saat dilimi temel model (P18). | Owner Mert Account → Documents'ta Food Handler kartını yükleyemez | A | BL-559 | leave: high / do: moderate |
| E6-04 | **"Warn before expiry (days)" çalışanın hatırlatmasını değiştirmiyor;** hatırlatma hep 30 / 7 / 1 gün kala. Ayarı yalnız Workspace'in yapılacak işi okuyor (UTC). | Mert 14 gün yazar; Ali'ye yine 30, 7, 1 gün kala gider, 14 gün kala hiçbir şey gitmez | D O1 | YENİ (BL-806 yanında) | leave: medium / do: moderate |
| E6-05 | **Eksik belge bildirimi her gün, sınırsız** (tekrar anahtarı günle değişiyor). Anti-hedef "bildirim gürültüsü". | Ali'nin kartı 3 hafta eksik: 21 "Documents need attention" | D O2 | YENİ | leave: medium / do: safe |
| E6-06 | **Çekmecede yapılamayacak karar düğmeleri açık** (kendi belgesi, eş rütbe, admin → owner): web `can()`'e kişiyi vermiyor; paylaşılan kural kişiyi alabiliyor. Requests'teki kural (KARARLAR 531: soluk + neden satırı) burada yok. | Admin Zeynep kendi kartında Approve'a basar: "Not allowed"; özel "Shift lead" Ayşe eş müdür Deniz'in belgesinde Exempt görür | B D2, D O3 | YENİ (BL-553 ailesi) | leave: medium / do: moderate |
| E6-07 | **Kapanan zorunluluk her sekmeden kayboluyor;** "All" bile `removed`'u dışarıda bırakıyor. KARARLAR 45 "uploads stay on file", P09. | Ali barmenlikten garsonluğa geçer; onaylı izin belgesini ne Mert ne Ali bulabilir | D O4 | YENİ | leave: medium / do: safe |
| E6-08 | **Ham sunucu cümleleri ekranda; 409 sonrası çekmece yenilenmiyor** (veri güvende: satır kilidi + sürüm). Belge ekranlarının hepsinde. | Mert ve Zeynep aynı kartı açar; Zeynep'in Approve'u "document changed; refresh required" der, çekmece eski kalır | A Y1, D O5 | YENİ (BL-620 / BL-654 ailesi) | leave: medium / do: safe |
| E6-09 | **Sayfalama yok;** Employees → Documents tek okumada ve satır başına ~2,7 ms (11 satırda ölçüldü; 500 satır ~1,3 sn tahmin). Kişi çekmecesi aynı tam listeyi istemcide süzüyor. | 80 kişi × 5 belge = 400 satır tek seferde | A, D O6 | BL-787 | leave: medium / do: moderate |
| E6-10 | **Dosya önizlemesi yok;** her dosya indiriliyor (`download: true`), `window.open` bir `await`'ten sonra (açılır pencere engeli olası, denenmedi). | Ayşe Ali'nin kimlik fotoğrafına bakmak için indirir; kopya İndirilenler'de kalır | D O7 | YENİ | leave: medium / do: moderate |
| E6-11 | **Karma akış kodda yok:** "Who needs it" yönü, davette gerekçeli muafiyet, "Ask anyway", "Ask for a document", Add employee → Documents adımı, yayındaki belgede önizleme + Apply. KARARLAR'da onaylı ama "uygulama belge mimarisi raftan inince". | Ayşe yeni garson Ali'yi eklerken "Under 21" muafiyetini seçemez | A K2–K4 | YENİ | leave: medium / do: risky |
| E6-12 | **Archive tek tık** (KARARLAR 599: iki tık kırmızı). | Mert yanlışlıkla Archive'a basar, belge anında arşivde | A, D D4 | BL-595 | leave: medium / do: safe |
| E6-13 | **Telefonda Settings → Documents kart satırı değil** (KARARLAR 311); Employees → Documents telefonda varyant gerekir. | — | A | BL-599 | leave: medium / do: moderate |
| E6-14 | **Ham tarih ve kod adları:** "Expires 2029-10-01", History'de ISO zaman damgası, "pending review", "superseded", "keep", kaldırılmış alanın ham anahtarı ("license_number: 4471"); çekmecede durum düz metin (listede çip). | Ayşe History'de "2026-10-03T19:42:11.214Z · reviewed" görür | A Y2, R3, D D5 | BL-674 + BL-468 + YENİ | leave: medium / do: safe |
| E6-15 | **Sekmeler ok tuşuyla gezilmiyor;** iki liste farklı rol kullanıyor (`role="tab"` / `aria-pressed`); Settings başlık satırı tablo rolünde değil. | — | A | BL-602, BL-593 | leave: medium / do: safe |
| E6-16 | **Düzenleyicide ham zod cümlesi.** | — | A | BL-621 | leave: medium / do: moderate |
| E6-17 | **"Decision saved" kayboluyor** (kök neden: çekmece içeriği `id:revision` anahtarıyla yeniden kuruluyor). | — | A, D D1 | BL-561 | leave: low / do: safe |
| E6-18 | **Süresi dolmuş sürümde Approve açık;** sunucu reddediyor. | — | A, D D2 | BL-673 | leave: low / do: safe |
| E6-19 | **Move up / down süzgeç ya da sekme açıkken çalışıyor.** | — | A, D D3 | BL-672 | leave: low / do: safe |
| E6-20 | **Status sütunu ham koda göre sıralanıyor.** | Ayşe Status'a basar; "Needs review" "Paused" ile "Rejected" arasına düşer | A Y3, D D7 | YENİ | leave: low / do: safe |
| E6-21 | **Approve'da da "Rejection reason" gönderiliyor;** History'de onayın yanında ret gerekçesi. | Zeynep gerekçe yazar, vazgeçip onaylar; History "approve · <gerekçe>" | D D6 | YENİ | leave: low / do: safe |
| E6-22 | **Müdür Settings → Documents'ta türün ayrıntısını açamıyor** (KARARLAR 85 salt okunur görünüm). E6-01'e bağlı. | — | D D8 | BL-680 | leave: low / do: safe |
| E6-23 | **Settings düzenleyicisi kapanırken sormuyor** (çok adımlı form; P26'ya göre "uzun iş" mi?). | Mert Step 2'de Esc'e basar, her şey gider | D D11 | YENİ | leave: low / do: safe |
| E6-24 | **Silinen taslak ve doğrulanamayan yükleme depoda süresiz kalıyor** (yerelde bağlantısız 3 satır). Sızıntı değil, saklama. | Ali yanlışlıkla ehliyet fotoğrafını yükleyip kaldırır; dosya workspace kapanana kadar durur | B D3, D D13 | YENİ (BL-279 kalıntısı) | leave: low / do: moderate |
| E6-25 | **Account → Documents'ta iş arkadaşının belge kimliği 403, olmayan kimlik 404** (aynı cevap olmalı). Personel yolu tutarlı. | Ali Veli'nin kayıt kimliğini adrese yazar: "var ama kapalı" | B D1 | YENİ (BL-818 ailesi) | leave: low / do: safe |
| E6-26 | **İkiz ve ölü kod:** `save_document_type_service`'in 10 parametreli imzası; `DocumentDefinitionApply.tsx` ölü; `applyBusy` hiç true olmuyor; "Named people" ölü yolu; `settings/documents-data.ts` kendi `fetch`'i (workspace başlığı yok, 401'de yenilemiyor; 6 dosyada daha); üreticisi olmayan eski bağlantı dalı (`?requirement`, `view=employees`). | — | A Y4, B D4, D D9 D10 | BL-554 + YENİ | leave: low / do: safe |
| E6-27 | **Küçük metin ve form:** Publish "Reason" zorunlu ama işaretsiz; özet listede "Manager Approval"; owner notu geliştirici dili; hiç belge yokken "No documents match these filters." | Yeni workspace'te Mert filtresiz açar, "filtrelerle eşleşmedi" okur | A Y5, D D12 | BL-469, BL-664 (3), YENİ | leave: low / do: safe |
| E6-28 | **Toplu "on file", liste sütunları, Required'a yükseltmede muafiyet** — ürün soruları (§4 S3–S5). | — | A | BL-581, BL-583, BL-585 | leave: low / do: moderate |

Not (bulgu değil, B öneri): `document_view` reddi maskelerken `deadline_at`'i maskelemiyor (eş müdür "bir şey oldu" çıkarabilir); arşivli lokasyon adı süzülmüyor (kişinin kendi lokasyonu); katalog okuma servislerini yalnız `documents.read` sayıyor; servis düzeyinde M2 pgTAP hücresi yok (ucuz eklenir).

## 2. Test boşlukları (D §3, B)
- pgTAP: yayındaki türü arşivleme (E6-02), günlük eksik bildirimi sıklığı (E6-05), `expiry_warning_days` etkisi (E6-04), D1 iki hücre (E6-25), servis düzeyinde M2 hücresi.
- Web: Approve gönderimi ve "Decision saved" (BL-476, E6-17), kendi / eş rütbe satırında karar düğmeleri (E6-06), 409 sonrası yenileme (E6-08), Employees → Documents sekme sayıları / süzgeç / Status sıralaması, Settings → Documents Archive / Restore / süzgeçte Move up / yayın hatası.
- e2e (`documents.spec.ts`, 6 senaryo): reddetme, muafiyet, süre uzatma, indirme, süresi dolan belge, arşiv yok.
- API: `confirmUpload` ret dalları.

## 3. Prototipten taşı / bırak (A §2)
- **Taşı (10):** P2 R3 çekmecede durum çipi, R7 / R16 okunur tarih, R11 süresi dolmuşta Approve kapalı + neden; P2 C1–C15 Add employee → Documents adımı (S1'e bağlı); P3 D14 sade düzenleyici cümleleri, D15 "Manager approval", D16 yayındaki belgede önizleme + Apply (S1'e bağlı), S7 Archive iki tık kırmızı; PHONE-MGR2 Settings → Documents telefonda kart satırı.
- **Bırak (3):** P3 D6 sıralama oku hep görünür (ortak liste dili, tek ekranda değişmez); PHONE-MGR K7 telefonda 38 px başlık (KARARLAR: 28); PHONE-MGR K3 müdürün More menüsünde Documents yok (E6-01 düzelince görünür).
- **Varyant gerekir (2):** P3 E9 liste çerçevesinin bittiği yer; PHONE-MGR D1 Employees → Documents telefonda tablo mu kart mı (SABAH S22 Employees telefon sorusuyla aynı).
- P2 / P3'ün "polished" dediği 6 farkın 6'sı da main'de eski hâlinde; yoklanan 5 "matched" doğru.

## 4. Mert'e sorulacaklar (CLAUDE.md §13; **ekran 6 turunda sorulur**, SABAH listesinde değil)

**S1 — Belgeler turunun kapsamı: raftaki belge mimarisi kararları bu turda mı konuşulsun?** (E6-01, E6-11)
- **Bugün:** Employees → Add employee iki adımlı; Settings → Documents'ta yayındaki belgenin "Who needs it"ı kilitli. Karma akış KARARLAR'da onaylı ama "belge mimarisi raftan inince" uygulanacak; raftaki U1–U12 (görünürlük, sonradan yayınlanan zorunlu belge, saat dilimi…) yürürlükte değil. Yerleşik Manager'ın belge izni (BL-560) de "raftan inince ilk iş".
- **Örnek:** Ayşe yeni garson Ali'yi ekler; davet anında "Under 21" muafiyetini seçemez. Ali'nin kartı gelince Ayşe onu göremez, onay Mert'e kalır.
- **(a) Bu turda KARARLAR'da onaylı olanlar yapılır: müdüre belge izni (BL-560), karma akış, Add employee → Documents adımı, yayındaki belgede önizleme + Apply; raftaki U1–U12 ayrı sohbette yeniden teyit edilir, bu turu beklemez (Önerilen).** Ayşe davette muafiyeti seçer ve Ali'nin belgesini onaylar; görünürlük bugünkü M2'de kalır.
  `Dayanak: KARARLAR Employees "Add employee → Documents adımı Documents ekranının (6) turunda yapılır" (Mert 2026-10-06) + M2 / D2 + raf notu "dönüşte her U satırı yeniden teyit ettirilir"`
  Zayıf yanı: raftaki U6 ("onaylı belgeyi de yalnız karar veren görür") sonradan kabul edilirse M2 görünürlüğü yeniden değişir; iki kez iş.
- (b) Rafın tamamı bu turda, önce sohbette (P18). Tur uzar; görünürlük değişebilir.
- (c) Bu turda yalnız ekran hataları; karma akış ve müdür izni sonraya. Mert'in 2026-10-06 kararı ertelenir.
- (d) Önce sohbette konuşalım.

**S2 — Birincil lokasyonu olmayan kişinin belge saat dilimi** (E6-03; temel model, P18)
- **Bugün:** owner Mert Account → Documents'ta süreli belge yükler, "Document timezone needs administrator configuration" görür; yerelde 2403 kişinin 319'u bu durumda.
- **(a) Önce sohbette konuşalım; masadaki aday workspace'in yedek saat dilimi (raf U11; işten çıkarma penceresi aynı yedeği kullanıyor, KK-169 K4) (Önerilen).**
  `Dayanak: ILKELER P18 (temel modeller önce sohbette)`
  Zayıf yanı: sohbet bitene kadar owner ve birincilsiz kişiler süreli belge gönderemez.
- (b) Workspace saati yedek olsun, hemen uygulansın. Belge bitişi workspace'in gün sonuna göre hesaplanır.
- (c) Bugünkü gibi; admin kişiye elle saat dilimi girsin.

**S3 — Optional belge Required yapılınca davette atlanmış muafiyetler** (BL-585)
- **Bugün:** Handbook Optional iken davette atlanan Kadıköy garsonu, Handbook Required olunca da sessizce muaf kalır.
- **(a) Yayın önizlemesi "N people are exempt from the previous version" der ve sorar: korunsun mu, kalksın mı (Önerilen).**
  `Dayanak: ILKELER P09 (veri sessizce değişmez) + P10 (niyet sorulur)`
  Zayıf yanı: yayın penceresine bir soru daha ekler (anti-hedef "bir onay adımı daha"); yalnız muafiyet varsa çıkar.
- (b) Muafiyetler sessizce korunsun (bugünkü gibi).
- (c) Yükseltmede muafiyetler kendiliğinden kalksın (owner'a söylenmez).

**S4 — Mevcut kadro için toplu "on file"** (BL-581)
- **Bugün:** Kadıköy'de 9 kişinin Food Handler kartı kâğıtta; owner belgeyi yayınlayınca 9'unun süresi başlar, her biri tek tek yüklemeli.
- **(a) Bu turda: seçilen kişiler için "Mark as on file (paper)"; gerekçe zorunlu, History'ye yazılır, yalnız owner ve admin (Önerilen).**
  `Dayanak: ILKELER A (ilk müşteri mevcut kadroyla gelir) + P02 (çekirdekte tam çözüm)`
  Zayıf yanı: dosyasız, kanıtsız kalıcı kayıt; denetimde "kâğıt nerede" sorusu işletmeye kalır.
- (b) Backlog'da kalsın.
- (c) Tek tek "on file" (toplu değil).

**S5 — Settings → Documents listesine "Who needs it" / "Exempt (N)" sütunları** (BL-583)
- **Bugün:** listede belgenin kimden istendiği görünmüyor; görmek için belgeyi açmak gerekiyor.
- **(a) Eklenmesin; bilgi çekmecede kalsın, madde kapansın (Önerilen).**
  `Dayanak: KARARLAR Genel DOC-TABLE sütunları (Mert 2026-10-05) + ILKELER P20`
  Zayıf yanı: 15 belgeli işletmede owner "kimden istiyordum" için her satırı tek tek açar.
- (b) "Who needs it" sütunu eklensin (DOC-TABLE değişir; gerçek ekranda varyant, P04).

**S6 — Eksik belge bildirimi ne sıklıkla?** (E6-05)
- **Bugün:** Ali'nin kartı eksik kaldıkça her gün "Documents need attention"; 3 haftada 21 bildirim.
- **(a) İlk gün, sonra haftada bir, son tarihten 1 gün önce bir kez daha (Önerilen).**
  `Dayanak: ILKELER A anti-hedef "bildirim gürültüsü"; yok — yeni karar (sıklık KARARLAR'da yok)`
  Zayıf yanı: haftalık aralıkta Ali'nin unutma ihtimali artar; kısıtlı kalma riski Ali'de.
- (b) Her gün kalsın, ama en çok 7 gün.
- (c) Bugünkü gibi her gün.

**S7 — Yayındaki belge türü arşivlenince ne olsun?** (E6-02)
- **Bugün:** Mert yayındaki "Alcohol server permit"i arşivler; Ali'den istenmeye ve kısıtlanmaya devam eder, yeni gelenden istenmez.
- **(a) Arşiv, Unpublish'in yaptığını kendisi yapar: önce etki önizlemesi ("N people are asked for this; archiving stops it"), sonra iki tık kırmızı Archive; zorunluluklar duraklar, kısıt kalkar (Önerilen).**
  `Dayanak: KARARLAR 599 (Archive iki tık kırmızı) + ILKELER P25 (geri dönüşsüz eylemin sonucu açıkça yazılır) + P09`
  Zayıf yanı: Archive ile Unpublish'in farkı kullanıcıya bulanıklaşır; ikisi aynı işi yapan iki düğme gibi görünebilir.
- (b) Yayındaki tür arşivlenemez; önce Unpublish istenir, Archive menüde soluk + neden satırı.
- (c) Bugünkü gibi.

**S8 — Çekmecede dosya önizlemesi** (E6-10)
- **Bugün:** Ayşe Ali'nin kimlik fotoğrafına bakmak için dosyayı indirir; kopya bilgisayarında kalır.
- **(a) PDF ve resim çekmecenin içinde açılsın, "Download" ayrı düğme (Önerilen).**
  `Dayanak: ILKELER A anti-hedef "kurumsal hantallık" + kişisel verinin cihazda birikmemesi; yok — yeni karar`
  Zayıf yanı: yeni bileşen (görüntüleyici); büyük PDF'te çekmece yavaşlayabilir; görsel karar varyant ister (P04).
- (b) Bugünkü gibi indirme.

**Görsel (varyant gerekir, sırası gelince):** E6-13 Employees → Documents telefonda (SABAH S22 Employees telefon sorusuyla birlikte); P3 E9 liste çerçevesinin bittiği yer; S8 seçilirse önizleme görünümü.

## 5. Koordinatörün verebileceği kararlar (öneri)
1. **E6-01 (BL-560):** yerleşik Manager rolüne `employee_documents.read`, `employee_documents.review` ve `documents.read` (Settings salt okunur) verilir, mevcut 469 rol güncellenir. Dayanak: KARARLAR M2 + D2 + satır 85 birebir; P01. **Ama** KARARLAR D2 notu bunu "raftan inince ilk iş" diye bağlamış → S1 cevabını bekler. R3: `nf-db` + `nf-guvenlik`. BL-555 (Roles editöründe müdüre "Document requirements → edit") aynı gün ölçülür.
2. **Salt hata düzeltmeleri bu turda, sorusuz:** E6-06 (çekmece kişiyi hedef vererek sorar; görünüm Requests G1'den: soluk + neden), E6-07 (kapanan zorunluluk bir sekmede görünür — hangi adla "Removed" metni koordinatör kararı), E6-08, E6-12, E6-14, E6-15, E6-16, E6-17, E6-18, E6-19, E6-20, E6-21, E6-22 (E6-01'e bağlı), E6-25, E6-26, E6-27 (boş hâl metni KARARLAR Genel kalıbıyla). Dayanak: CLAUDE.md §9, G11, P09, P21.
3. **E6-04:** hatırlatma `expiry_warning_days`'i okur (30 / 7 / 1 sabiti kalkar); Workspace'in yapılacak işiyle aynı kaynak. Dayanak: ayarın kendi adı + ikiz kural yok. BL-806 ile aynı dilim (S6 ile karıştırma: o eksik belge bildirimi).
4. **E6-09 (BL-787):** Employees → Documents sunucuda sayfalanır (satır başına maliyet var; D'nin önerisi), Settings → Documents istemcide; kişi çekmecesi kişi başına okuma alır. Teknik seçim (P19). Ortak bileşen EKRAN-02 C3'ten.
5. **E6-23:** Settings belge düzenleyicisi P26'ya göre "uzun iş" sayılır, kapanırken "Discard unsaved changes?" sorar (belge çekmecesi zaten soruyor, BL-467). Dayanak: P26 örneği birebir değil — koordinatör tartmalı.
6. **E6-24:** silinen taslak ve doğrulanamayan yükleme depodan silinir (worker); önce kural. Geri alınamaz silme → R3 incelemesi.
7. **Kayıt temizliği (A §1):** BL-118 kapanır (bayat, `4398563c`); numarasız "pgTAP borcu: üç onboarding / document test dosyası kırmızı" (BACKLOG:138) kapanır (beşi de `ci-green.txt`'te); BL-096 belge dışına daralır; BL-374'ten `document-types-routes.ts` çıkar (`aee04aaa`); BL-276 alt madde (2) kapanır (B: üç servis `authorize` kullanıyor, admin → kendisi 2/2 `rank`); BL-344 → BL-566'ya katılır; BL-497 / 528 / 590 tek madde.
8. **E6-13:** Employees → Documents telefonu ayrı soru açılmaz, SABAH S22 Employees telefon cevabı uygulanır (aynı liste bileşeni).

## 6. BL eşlemesi
- Var olan, bugün **geçerli** (tazelik 2026-10-06, `f8e78dc4`): BL-560, BL-559, BL-595, BL-787, BL-599, BL-602, BL-674 (belge kalemi), BL-621 (belge kalemi), BL-673, BL-672, BL-469, BL-468, BL-554, BL-557, BL-664 (3), BL-593, BL-581, BL-582, BL-585, BL-248, BL-680, BL-728. **Değişmiş:** BL-561 (kök neden bulundu), BL-476 (kısmen testli), BL-583 (DOC-TABLE sütunları sabitledi), BL-096, BL-374. **Bayat:** BL-118, BACKLOG:138 numarasız madde, BL-276 (2).
- YENİ (numara bekliyor; son numara BL-820): E6-02, E6-04, E6-05, E6-06, E6-07, E6-08, E6-10, E6-11, E6-14 (çip + ham kod kısmı), E6-20, E6-21, E6-23, E6-24, E6-25, E6-26 (ikiz imza, ölü bileşen, ikiz istemci, eski bağlantı dalı), E6-27 (owner notu, boş metin). Numaralar koordinatörün kararlarıyla ayrı commit'te verilir (EKRAN-04 / 05 düzeni).
- Sınırda: BL-806, BL-807, BL-728, BL-727, BL-470, BL-592, BL-555, BL-584, BL-645…649, BL-046, BL-382, BL-133, BL-553, BL-515 / 558 / 803, BL-600 / 603 / 604 / 605, raf #68 (A §4 tablo).

## 7. Durum
- [x] A, B, D raporları (2026-10-06, `e666f2ec` / `f8e78dc4`)
- [ ] C görsel QA (ağır iş, izinle)
- [ ] Koordinatör kararları + BL numaraları
- [ ] Mert soruları S1–S8 (ekran 6 turunda)
- [ ] Görev dosyası `tasks/EKRAN-06-DOCUMENTS.md`
