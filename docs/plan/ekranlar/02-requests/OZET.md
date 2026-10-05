# Ekran 2 — Requests: keşif özeti (EKRAN-02, 2026-10-05, `e929abc7`)

Yazan: "Ekran oturumu — Ekran 2: Requests" (koordinatör `local_9c7e674a…` adına). Turun 1. ve 2. adımı (keşif + kayıt) bitti; 3. adım (Mert'le konuşma) koordinatörün.

- **Ekran:** Schedule → Requests (`/app/schedule/requests`), müdür ve owner tarafı; Time off ve Shift changes sekmeleri, inceleme çekmecesi, onay/ret/Revoke/Shorten pencereleri, bu taleplerin bildirimleri ve kuralların API/DB katmanı.
- **Dışarıda:** Employee view → Shift Hub (ekran 13), Schedule ızgarası (ekran 1), Settings. Sınırda kalanlar ayrı listede (bölüm 7).
- **Raporlar (olduğu gibi):** [A — backlog ve prototip](A-backlog-prototip.md) (`nf-planlama`), [B — güvenlik](B-guvenlik.md) (`nf-guvenlik`), [C — görsel](C-gorsel.md) (`nf-gorsel-qa`, web 5630 / api 5631), [D — kod ve davranış](D-kod-davranis.md) (genel ajan, opus). Dördü de salt okuma: yerel DB'de yalnız SELECT, kod değişmedi.
- **Ekran görüntüleri:** `artifacts/nf-gorsel-qa/EKRAN-requests/` (77 dosya; git dışında, bu oturumun worktree'sinde).

## 0. Kısaca
- **Başka workspace'e sızıntı yok.** Talep tablolarının hepsinde satır erişimi açık, tarayıcıya tablo ya da fonksiyon izni yok (B).
- **Time off'un yetkisi kurala uyuyor:** kendini onaylama, eş rütbe onayı ve kısmi onay yok; aynı anda iki karar kilitle korunuyor (B, D).
- **Shift changes'in onayı kurala uymuyor.** Eş müdür birbirinin takasını onaylıyor, belgesi eksik müdür de onaylıyor. Yol/dinlenme kuralı uyarı olması gerekirken onayı engelliyor. Bunların düzeltmesi FB-6.4'te planlı ama başlamadı (A, B, D).
- **Yeni ve sessiz bir hata:** Time off listesinde "Older" ile sayfa geçerken her sınırda bir talep kayboluyor (B, D; ekran oturumu da doğruladı).
- **Klavye kullanıcısı için ekran kullanılamaz durumda:** odak halkası yok, pencereden vazgeçince odak kayboluyor (C; ikisi de backlog'da).
- **Sayılar (2026-10-05, bu keşifte):** açık backlog maddesi 39 (A; 1 bayat, 10 değişmiş, 28 geçerli); birleşik bulgu listesi 58 madde (aşağıda); Mert'e yazılı 7 soru, 4 görsel karar.

## 1. Tek liste — önem sırasıyla
Her madde: ne / ekranda nerede / isimli örnek / kaynak rapor / backlog eşleşmesi / işaret (`leave` = bırakırsak ne olur, `do` = yaparsak neyi bozabilir). Ajanlar önemde ayrıştıysa iki değer de yazılı, özetin seçtiği kalın.

### Yüksek
- **R2-01 — Shift changes onayı yetki çekirdeğine sormuyor: eş müdür, belgesi eksik müdür ve kendi vakasındaki müdür karar verebiliyor.**
  - **Ekranda nerede:** Requests → Shift changes → vaka → Review → Approve / Decline. Aynı düğmeler Shift Hub'da da var.
  - **Örnek:** Kadıköy'de Ayşe ve Can müdür. Ayşe Cuma vardiyasını Hande'ye devretmek istiyor ve Can bunu onaylıyor. Can'ın belgesi eksik olsa da onaylıyor. Ayşe kendi cover talebinde Veli'yi reddedebiliyor. Eş müdür, onaylayamayacağı vakanın bildirimini de alıyor.
  - **Kaynak:** A §1 BL-276, §3.1; B Y1; D Y3, O13(a).
  - **Backlog:** BL-276 kalem 1 + BL-189. Düzeltme FB-6.4 A2.2. Ret dalındaki kendi-vaka açığı **YENİ**.
  - **İşaret:** `leave: high / do: risky`.
- **R2-02 — Yol ve dinlenme kuralı takası engelliyor.** Kural (KARARLAR:168, 2026-10-03) bunun yalnız onaylayana gösterilen bir işaret olmasını istiyor.
  - **Ekranda nerede:** Shift changes → vaka → aday "Not allowed". Approve kapalı.
  - **Örnek:** Garson2'nin Beşiktaş vardiyası 17:00'de bitiyor. Kadıköy'ün 17:30 vardiyasına başvuruyor ve listeden düşüyor.
  - **Kaynak:** A §3.2; D Y2.
  - **Backlog:** **YENİ** (FB-6.4 A1.3 / D7'de planlı).
  - **İşaret:** `leave: high / do: risky`.
- **R2-03 — Time off "Older" sayfalaması her sayfa sınırında bir talebi atlıyor.**
  - **Ekranda nerede:** Time off → Needs review / Closed → Older.
  - **Örnek:** Owner'ın Closed listesinde 51. talep, Ali'nin izni, hiçbir sayfada çıkmıyor. Needs review'da 50'den fazla bekleyen talep varsa atlanan talebe kimse karar veremiyor ve süresi dolunca otomatik reddediliyor.
  - **Kaynak:** B O1 (orta), D Y1 (**yüksek**). Özet D'yi seçti: veri sessizce kayboluyor (P09) ve düzeltme tek satır.
  - **Doğru satır:** `20261003040000_time_off_forgets_location_and_parts.sql:925`. B eski bir tanımı göstermiş; ekran oturumu en son tanımı okudu.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: high / do: safe`.
- **R2-04 — Shift changes'te yıkıcı onay düğmeleri yeşil ve tek tık.** Buton dili ihlali.
  - **Ekranda nerede:** Shift changes → vaka → "Decline application"; "Cancel swap request" → "Close search".
  - **Örnek:** Owner Deniz'in başvurusunu reddederken son düğme Approve ile aynı yeşil.
  - **Kaynak:** C 3 (**yüksek**), D D7 (düşük). Ekran oturumu doğruladı: karar düğmesi her kararda `sx-primary` sınıfını alıyor (`ShiftExchangeHub.tsx:1588-1589`).
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: high / do: safe`.
- **R2-05 — Görünür odak halkası yok.**
  - **Ekranda nerede:** sekmeler, kuyruk, sıralama başlıkları, satırlar, çekmece düğmeleri.
  - **Örnek:** Ayşe Tab ile ilerliyor; Ali'nin satırına geldiğinde satırda hiçbir değişiklik olmuyor.
  - **Kaynak:** A; C 1.
  - **Backlog:** BL-657.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-06 — Deny ya da Revoke penceresinden vazgeçince odak kayboluyor; Esc çekmeceyi kapatmıyor.**
  - **Ekranda nerede:** talep → Deny / Revoke → Cancel ya da Esc.
  - **Örnek:** Owner Deny'dan vazgeçiyor; ikinci Esc'e bastığında çekmece hâlâ açık.
  - **Kaynak:** A; C 2.
  - **Backlog:** BL-656 (ortak `ConfirmDialog`).
  - **İşaret:** `leave: medium / do: moderate`.

### Orta
- **R2-07 — Kısıtlı (belgesi eksik) çalışan takas açıp başvurabiliyor.**
  - **Örnek:** Gıda kartının süresi geçmiş garson Bora cover isteyebiliyor; talep müdürün kuyruğuna düşüyor.
  - **Kaynak:** A §3.3.
  - **Backlog:** **YENİ** (FB-6.4 A2.2'de planlı).
  - **İşaret:** `leave: medium / do: risky`.
- **R2-08 — KARARLAR'da iki kural çelişiyor; kod eskisine uyuyor.** S3 (2026-10-01, KARARLAR:128) "belgesi eksik müdür talebi görür, oy veremez" diyor. KARARLAR:87 "kısıtlı kişinin talep ve yönetim işleri kapalı" diyor.
  - **Bugün:** Hande Requests'i hiç açamıyor; uygulama onu `/account/documents`'a yönlendiriyor (`DocumentAccessRoute.tsx:32`, ekran oturumu doğruladı).
  - **Kaynak:** A §3.4; D O7.
  - **Backlog:** **YENİ**. Karar gerekiyor (bölüm 4, S2).
  - **İşaret:** `leave: medium / do: risky`.
- **R2-09 — Bildirimden gelen müdür kapanmış izin talebini açamıyor.**
  - **Ekranda nerede:** Notifications → "Time off approved" / "…time off was shortened" → Requests.
  - **Örnek:** Beşiktaş müdürü Mehmet bildirime basıyor; Requests "Needs review"da açılıyor, çekmece açılmıyor, açıklama da yok.
  - **Kaynak:** A §3.5; D O3.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-10 — Arama ve filtre her değişiklikte bütün sayfayı "Loading requests..." ekranına çeviriyor; arama kutusu her harfte imleci kaybediyor.** 121 karakteri aşan arama sayfayı geri dönüşsüz bir hata yazısına çeviriyor.
  - **Örnek:** Ayşe "Ali" yazmaya çalışıyor; "A"dan sonra kutu yeniden çiziliyor.
  - **Kaynak:** D O1. Ekran oturumu kodda doğruladı: sorgu anahtarında arama var, önceki veri tutulmuyor (`requests-data.ts:128-133`), sayfa yükleme yazısıyla değişiyor (`ScheduleRequestsPage.tsx:279`). Tarayıcıda denenmedi.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-11 — Yükleme ve hata hâlinde başlık ve sekmeler kayboluyor; hata metni ham, yeniden deneme yok.**
  - **Örnek:** Owner'ın bağlantısı kopunca beyaz kutuda yalnız "Failed to fetch" görüyor. Bozuk cevapta ham zod JSON'u, Shorten'da "stale approved leave; refresh before shortening it" çıkıyor.
  - **Kaynak:** C 8; A BL-654; D D1.
  - **Backlog:** BL-654 + **YENİ** (çerçeve kaybı ve yeniden deneme).
  - **İşaret:** `leave: medium / do: safe`.
- **R2-12 — Sıralama yalnız ekrandaki 50 satıra uygulanıyor.**
  - **Örnek:** Ayşe "Decide by"a göre sıralıyor. Son karar anı en yakın olan talep ikinci sayfada kalıyor ve süresi doluyor.
  - **Kaynak:** D O2.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-13 — Tek karar aynı kişiye iki bildirim gönderiyor.**
  - Vardiya açan onayda: "approved" ve "shift is open".
  - İptal onayında: çalışana iki bildirim, karar verenlere ikinci ve yanıltıcı bir "Time off approved".
  - Bekleyen iptali olan izin revoke edilince: herkese ikişer bildirim.
  - **Kaynak:** D O4 (yerel kuyrukta 5 talepte çift satır ölçüldü).
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-14 — Shift changes'te owner ve bütün admin'ler her başvuruyu ve her lokasyon onayını duyuyor.**
  - **Kaynak:** D O5 (kitle sayımı: owner 138, admin 138, manager 428).
  - **Backlog:** **YENİ**. Karar gerekiyor (S4).
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-15 — Özel rolde Time off "View" seviyesi, bekleyen talebi karar veremeyen kişiye gösteriyor.**
  - **Örnek:** "Shift lead" Can, Kadıköy'ün bütün bekleyen taleplerini ve kimin onayladığını görüyor.
  - **Kaynak:** D O6.
  - **Backlog:** **YENİ**. Karar gerekiyor (S3).
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-16 — Onay beklerken vardiyanın saati değişirse, çakışan kabul düşmüyor.**
  - **Örnek:** Veli Cuma 17–21 cover'ını kabul etti. Saat 15–19'a çekiliyor, Veli'nin 14–18 başka vardiyası var. Vaka takılı kalıyor.
  - **Kaynak:** D O8. Ters davranışı kilitleyen test `ci-not-green.txt`'te.
  - **Backlog:** **YENİ** (BL-227'nin testiyle aynı yer).
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-17 — Takas onay ekranında "kendi rızasıyla müsait değil" ve müdür notu işareti yok (M6, M12).**
  - **Kaynak:** D O9.
  - **Backlog:** FB-6.4 B.1 / B.4.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-18 — İki lokasyonlu takasta onayını vermiş müdür vakayı hâlâ kendi işi olarak görüyor.** Tekrar basabiliyor ve her basışta yeni bildirim gidiyor.
  - **Örnek:** Ayşe "Record my approval"a iki kez basıyor; Mehmet "Awaiting other manager" görüyor, oysa beklenen müdür kendisi.
  - **Kaynak:** D O10.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-19 — "Private manager note" kaydediliyor ama hiçbir yerde gösterilmiyor (P09).**
  - **Kaynak:** D O11.
  - **Backlog:** **YENİ**. Karar gerekiyor (S5).
  - **İşaret:** `leave: medium / do: safe`.
- **R2-20 — Shift changes'te bir vakaya tıklamak bütün ekranı yükleme iskeletine çeviriyor.** Kök neden R2-10 ile aynı.
  - **Kaynak:** D O12.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-21 — Requests okuma API'si yetkiyi rota içinde de soruyor.**
  - Aynı okuma iki rotadan açık; web yalnız biri çağırıyor.
  - Üye olmayana 404 yerine 403 dönüyor.
  - Web'de ikinci bir istek yardımcısı var; oturum düşünce (401) çıkışa yönlendirmiyor.
  - Veri sızmıyor, çünkü veritabanı da ayrıca çekirdeğe soruyor.
  - **Kaynak:** A BL-363, BL-176; B D1; D O13(c)(d).
  - **Backlog:** BL-363 + BL-176. İstek yardımcısı **YENİ**, BL-363'e eklenmeli.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-22 — Time off çekmecesindeki "Entire shift released…" satırlarını eski yetki yardımcısı süzüyor.**
  - **Kaynak:** A; D O13(b).
  - **Backlog:** BL-179 (FB-6.4 A2.1).
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-23 — İzin kısaltılınca bildirimi yalnız son onaylayan alıyor.** Sistem onayladıysa hiçbir müdür almıyor.
  - **Örnek:** Ayşe ve Mehmet onaylamıştı; Ayşe izni kısaltınca yalnız Mehmet haber alıyor.
  - **Kaynak:** D O14.
  - **Backlog:** **YENİ** (BL-396 ile aynı bildirim).
  - **İşaret:** `leave: medium / do: safe`.
- **R2-24 — Shorten formu çekmeceyi kaplıyor; denetimleri stilsiz, düğmeler tam genişlikte alt alta.**
  - **Örnek:** Owner izni kısaltırken hangi talepte olduğunu göremiyor.
  - **Kaynak:** A BL-658(1); C 6.
  - **Backlog:** BL-658.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-25 — Açılan vardiya listesi kelime kelime kırılıyor (prototip R25).**
  - **Kaynak:** A BL-658(3); C 7.
  - **Backlog:** BL-658.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-26 — Arama kutusu iki çerçeve çiziyor (prototip R9).**
  - **Kaynak:** A BL-658(2); C 14.
  - **Backlog:** BL-658.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-27 — Time off ile Shift changes iki ayrı tasarım dili gibi; sekme değişince tablo 30 px kayıyor.**
  - Farklar: kuyruk denetimi, arama simgesi, başlık satırı, açılır liste, boş hâl, çekmece başlığı, X düğmesi.
  - **Kaynak:** A BL-658(4)(5)(6); C 10.
  - **Backlog:** BL-658. Kayma **YENİ**.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-28 — Tarih ve saat dört farklı biçimde yazılıyor; workspace'in 12/24 saat ayarı yok sayılıyor.**
  - Shift changes'te ham "2028-10-24 / 09:00".
  - Activity'de tarayıcının diliyle ve saniyeli.
  - Shorten'da "GMT+3".
  - **Kaynak:** A BL-674; C 12; D D5.
  - **Backlog:** BL-674. Time off satırları **YENİ**, BL-674'e eklenmeli.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-29 — Liste sayfalarının ortak dili Requests'e taşınmamış.**
  - **Kaynak:** A BL-604; C 16.
  - **Backlog:** BL-604. Ortak değer; karar gerekiyor (S6).
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-30 — Arama, açılır liste ve beyaz düğme kenarları beyaz zeminde zor seçiliyor.**
  - Requests'te `#e1e7e3`, ≈1,25:1. Ortak dildeki `#aeb9b4` de 1,86:1. WCAG 3:1 istiyor.
  - **Kaynak:** C 13; A BL-600.
  - **Backlog:** BL-255 (beyaz düğme) + BL-600 (form kenarı). Karar gerekiyor (S7).
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-31 — Ortak çekmece açıkken toast tıklanamıyor ve ekran okuyucu okumuyor.**
  - **Kaynak:** A.
  - **Backlog:** BL-515.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-32 — Takas onayı, cevap vermeden önce bildirim dağıtımını 2 sn'ye kadar bekliyor.**
  - **Kaynak:** A.
  - **Backlog:** BL-200.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-33 — İzin süre işinin hataları yalnız Postgres günlüğünde kalıyor.**
  - **Kaynak:** A.
  - **Backlog:** BL-507.
  - **İşaret:** `leave: medium / do: safe`.
- **R2-34 — Takas testi gerçek seed lokasyonunun saat dilimini değiştiriyor.**
  - **Kaynak:** A.
  - **Backlog:** BL-217.
  - **İşaret:** `leave: medium / do: moderate`.
- **R2-35 — Telefonda (390 px) tablo başlıkları sütunlarla eşleşmiyor; "Decide by" görünmüyor.**
  - **Kaynak:** C 4 (orta), A BL-513 (düşük).
  - **Backlog:** BL-513.
  - **İşaret:** `leave: low / do: safe`.
- **R2-36 — Telefonda Shift changes filtrelerinin arasında büyük boşluklar var.** Tablo ekranın altına iniyor.
  - **Kaynak:** C 9; A sınırda.
  - **Backlog:** BL-400.
  - **İşaret:** `leave: low / do: safe`.
- **R2-37 — Aynı durum çipi iki renkte:** "Awaiting manager" listede yeşil, çekmecede amber. Time off'ta "Pending" de yeşil.
  - **Kaynak:** C 11.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-38 — Deny ve Revoke düz beyaz; kırmızı tonu stil bloğu eziyor (prototip R28).**
  - **Kaynak:** A BL-256, BL-399; C 5.
  - **Backlog:** BL-256 + BL-399. İkisi birleşebilir.
  - **İşaret:** `leave: low / do: safe`.
- **R2-39 — Sıralı sütunun oku yalnız fare üzerindeyken görünüyor (prototip R10).**
  - **Kaynak:** A BL-663; C 15.
  - **Backlog:** BL-663.
  - **İşaret:** `leave: low / do: safe`.
- **R2-40 — Takas retleri "Hayır" sözleşmesine uymuyor; ekrana "Manager scope required" gibi düz cümle çıkıyor.**
  - **Kaynak:** B D2; A BL-375.
  - **Backlog:** BL-375 + FB-6.4 A3.1.
  - **İşaret:** `leave: low / do: moderate`.

### Düşük
- **R2-41 — Karar verilmiş iptalde yanlış metinler.** "Until this is approved" yazıyor; müdür notu "Employee note" başlığıyla çıkıyor. Ayrıca owner'a "View-only access" yazıyor; doğrusu "karar verilecek bir şey yok".
  - **Kaynak:** A BL-653; C 17.
  - **Backlog:** BL-653. "View-only" kısmı **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-42 — Çalışanın geri çektiği bekleyen talep Closed'da "Revoked · No longer approved leave" görünüyor.**
  - **Kaynak:** D D3.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-43 — Revoke düğmesi tamamen geçmiş izinde de görünüyor ve hataya gidiyor.** Pencere, açılmış vardiyaların açık kalacağını da söylemiyor.
  - **Kaynak:** D D4.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-44 — Eşzamanlı kararda ikinci müdürün çekmecesi açıklamasız kapanıyor.**
  - **Kaynak:** D D2.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-45 — Çalışana giden karar bildirimi sonucu söylemiyor:** onayda da redde de "Time-off request updated".
  - **Kaynak:** D D8.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-46 — Settings → Roles'taki izin açıklaması olmayan bir "return" işlemini sayıyor.**
  - **Kaynak:** D D9.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-47 — Ölü kod.**
  - Hiç devreye girmeyen "Discard request decision?" sarmalayıcısı.
  - Kullanılmayan `conflict_count`, `.request-sr-only` ve yok sayılan bir parametre.
  - `shift-exchanges.css`'te 4 karanlık tema kuralı ve 30 ham renk.
  - **Kaynak:** D D6.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-48 — Ekran okuyucu sorunları.**
  - Needs review / Closed'da seçim söylenmiyor (`aria-pressed` yok).
  - Satırın adı birleşik okunuyor.
  - Time off / Shift changes sekmeleri ok tuşuyla gezilmiyor.
  - **Kaynak:** C 19, 20.
  - **Backlog:** **YENİ**. Sekmeler kısmı BL-602'ye eklenmeli.
  - **İşaret:** `leave: low / do: safe`.
- **R2-49 — "Cancel swap request" düğmesi açılınca adı değişiyor:** pencere "Close this search", onay düğmesi "Close search".
  - **Kaynak:** C 21.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-50 — Müdürün tek tıkla onayı başarısız olunca odak kayboluyor.**
  - **Kaynak:** C 22.
  - **Backlog:** **YENİ**.
  - **İşaret:** `leave: low / do: safe`.
- **R2-51 — "All 1 active applications will close."**
  - **Kaynak:** A; C 18.
  - **Backlog:** BL-661.
  - **İşaret:** `leave: low / do: safe`.
- **R2-52 — Sistemin yazdığı kısaltma satırı Closed'da düz "Leave cancellation" görünüyor.**
  - **Kaynak:** A.
  - **Backlog:** BL-364. Görsel karar (G3).
  - **İşaret:** `leave: low / do: safe`.
- **R2-53 — Kısaltma bildirimi onaylayana "is back on the schedule" diyor.**
  - **Kaynak:** A; D.
  - **Backlog:** BL-396.
  - **İşaret:** `leave: low / do: safe`.
- **R2-54 — Kısaltma ve iptal formunda ham renkler ve mavi odak.**
  - **Kaynak:** A.
  - **Backlog:** BL-398.
  - **İşaret:** `leave: low / do: safe`.
- **R2-55 — Küçük API ve şema kusurları:**
  - bilinmeyen talep 403, üye olmayan 404 (BL-411);
  - her CHECK ihlali "ekran bayat" 409'u (BL-509);
  - süre işi tek turda 500 talep (BL-506);
  - iptal şeması çakışan saatleri reddetmiyor (BL-517);
  - saat dilimi shared'da isteğe bağlı (BL-518);
  - ölü "saat yok" dalları (BL-110);
  - kısaltmada bozuk `segment_id` 500 dönüyor ve yorumdaki izin adı yanlış (**YENİ**, B öneri).
  - **Kaynak:** A; B.
  - **İşaret:** `leave: low / do: safe|moderate`.
- **R2-56 — Takas test ve yarış boşlukları:**
  - kırmızı `weekly_exchange_changed_terms` (BL-227);
  - onay ile yayın aynı anda olunca zaman damgası penceresi (BL-228);
  - cover ve open pickup için test yok (BL-229).
  - **Kaynak:** A.
  - **İşaret:** `leave: low / do: safe`.
- **R2-57 — 850/900 yazı ağırlığı yalnız ortak onay kutusu başlığında kaldı.**
  - **Kaynak:** A.
  - **Backlog:** BL-589.
  - **İşaret:** `leave: low / do: safe`.
- **R2-58 — Test boşlukları listesi:**
  - vitest: arama, filtre, sıralama, sayfa, bağlantı, 409;
  - pgTAP: cursor, bildirim sayısı, özel rol, S3, takas rütbe/yol;
  - e2e: müdürün iptal onayı, Shorten, iki müdür yarışı, Shift changes reddi.
  - **Kaynak:** D §2.
  - Tek madde değil; her düzeltme kendi testini getirir (CLAUDE.md §5 adım 4).

### Bayat ya da kapanmalı (A, D)
- **BL-508** bayat. Eş müdürün bekleyen izni okuması artık oluşamıyor (`requests.read` rütbe + kendisi değil; pgTAP `time_off_seen_by_who_decides`). Kapatılması önerilir (FB-6.3.8c, `a13df69b`).
- **BL-399**'un "tek tık" kısmı bayat: Revoke'ta gerekçe zorunlu bir pencere var. Kalan renk sorunu BL-256 ile aynı.
- **BL-512** (1) ve (3) bayat; kalanlar başka ekranların.
- **BL-041** şemsiye madde. Bu turun görev dosyasına bağlanıp tur kapanınca kapanması önerilir.

## 2. Prototipten taşı / bırak
Kaynak: A §2 (prototip denetimi P1, Requests ve Shift changes satırları). Hepsi bugünkü kodda doğrulandı; hepsinin bir backlog karşılığı var.

| P1 | Ne | Öneri | Dayanak | Backlog |
|---|---|---|---|---|
| R9 | Arama kutusunda tek çerçeve | **taşı** | CLAUDE.md §9 tutarlılık | BL-658 (2) |
| R10 | Sıralı sütun okunu korur | **taşı** (ortak değer: Settings katalog listeleri de değişir) | WCAG; ortak değer kuralı | BL-663 |
| R25 | Açılan vardiya listesi düzgün | **taşı** | hata düzeltmesi (P02) | BL-658 (3) |
| R28 | Deny / Revoke kırmızı tonlu | **taşı** | CLAUDE.md §9 buton dili | BL-256, BL-399 |
| R33 | Pencere kapanınca odak düğmeye döner | **taşı** (ortak bileşen) | WCAG 2.4.3 | BL-656 |
| R45 | Shift changes sekmeleri Time off'un denetimiyle | **taşı** (tek ekran görüntüsüyle teyit) | tutarlılık; P04 koşulu | BL-658 (4) |
| R48 | Shift changes aramasında simge | **taşı** | tutarlılık | BL-658 (4) |
| R51 | Liste başlıkları Time off'la aynı | **taşı** (BL-604 ile birlikte) | tutarlılık | BL-658 (4) |
| R52 | Shift sütunu "Fri, Oct 9 / 5:00 PM – 10:00 PM" | **taşı** | P12 + saat biçimi ayarı | BL-674 |
| R59 | Vardiya kartı 24 saat ayarını izler | **taşı** | aynı | BL-674 |
| R78 | Kapanmış iptalde "until this is approved" yok | **taşı** | P21 | BL-653 |
| R79 | Müdür notu "Note for <ad>" başlığıyla | **taşı** | P21 | BL-653 |
| R84 | Shift change çekmecesinin X'i 17×17 | **taşı** | tutarlılık | BL-658 (5) |
| R85 | Shorten formu: başlık görünür, 36 px düğmeler, vazgeç solda | **taşı** | P20, buton dili | BL-658 (1) |
| R42 | "Saving..." | **bırak** (gerçek uygulamada zaten var) | — | — |
| R16 | Newest / Older | **bırak** (gerçek uygulamada var; ama R2-03'teki hata düzelir) | — | — |
| R76, R77, R86 | Prototipin kendi kusurları | **bırak** | gerçek uygulamada karşılığı yok | — |

Varyant gerektiren prototip maddesi yok. Görsel kararlar bölüm 5'te.

## 3. Backlog'a yazılacak yeni bulgular (BL numarası alınmadı)
Önerilen grup: "Schedule → Requests (EKRAN-02 keşfi, 2026-10-05)". Ayrıntı ve kanıt ilgili raporda.

1. "Older" sayfalaması her sınırda bir talep atlıyor (R2-03). `leave: high / do: safe`.
2. Shift changes'te yıkıcı onay düğmeleri yeşil ve tek tık (R2-04). `leave: high / do: safe`.
3. Yol ve dinlenme kuralı takası engelliyor; uyarı olmalı (R2-02). `leave: high / do: risky`. FB-6.4 A1.3'e bağlı.
4. Müdür kendi vakasındaki adayı reddedebiliyor (R2-01'in ret dalı). `leave: high / do: risky`. FB-6.4 A2.2'ye eklenmeli.
5. Kısıtlı çalışan takas açıp başvurabiliyor (R2-07). `leave: medium / do: risky`. FB-6.4 A2.2.
6. S3 ile KARARLAR:87 çelişkisi; belgesi eksik müdür Requests'i göremiyor (R2-08). `leave: medium / do: risky`. Karar bekliyor.
7. Bildirimden kapanmış talep açılmıyor (R2-09). `leave: medium / do: safe`.
8. Arama ve filtre bütün sayfayı yeniden yüklüyor, imleç kayboluyor; 120 karakter sınırı (R2-10). `leave: medium / do: safe`.
9. Yükleme ve hata hâlinde çerçeve kayboluyor, yeniden deneme yok (R2-11). `leave: medium / do: safe`.
10. Sıralama yalnız ekrandaki sayfada (R2-12). `leave: medium / do: moderate`.
11. Tek karar, aynı kişiye iki bildirim (R2-13). `leave: medium / do: moderate`.
12. Takas bildirimleri owner'a ve bütün admin'lere gidiyor (R2-14). `leave: medium / do: moderate`. Karar bekliyor.
13. Özel rolde "View" bekleyen talebi gösteriyor (R2-15). `leave: medium / do: moderate`. Karar bekliyor.
14. Saat değişince çakışan kabul düşmüyor; test ters davranışı kilitliyor (R2-16). `leave: medium / do: moderate`.
15. İki lokasyonlu takasta onay vermiş müdür vakayı hâlâ işi sanıyor (R2-18). `leave: medium / do: safe`.
16. Private manager note hiç gösterilmiyor (R2-19). `leave: medium / do: safe`. Karar bekliyor.
17. Shift changes'te vakaya tıklayınca bütün ekran iskelet oluyor (R2-20). `leave: medium / do: safe`.
18. İzin kısaltma bildirimi yalnız son onaylayana gidiyor (R2-23). `leave: medium / do: safe`.
19. Sekme geçişinde tablo 30 px kayıyor (R2-27). `leave: medium / do: safe`. BL-658'e eklenebilir.
20. Aynı durum çipi iki renkte (R2-37). `leave: low / do: safe`.
21. Owner'a yanıltıcı "View-only access" yazıyor (R2-41). `leave: low / do: safe`.
22. Geri çekilen bekleyen talep "Revoked" görünüyor (R2-42). `leave: low / do: safe`.
23. Geçmiş izinde Revoke düğmesi görünüyor; pencere açık kalan vardiyaları söylemiyor (R2-43). `leave: low / do: safe`.
24. Eşzamanlı kararda ikinci müdürün çekmecesi açıklamasız kapanıyor (R2-44). `leave: low / do: safe`.
25. Çalışana giden karar bildirimi sonucu söylemiyor (R2-45). `leave: low / do: safe`.
26. Roles'taki izin açıklaması olmayan "return" işlemini sayıyor (R2-46). `leave: low / do: safe`.
27. Ölü kod (R2-47). `leave: low / do: safe`.
28. Ekran okuyucu: `aria-pressed` yok, satır adı birleşik (R2-48). `leave: low / do: safe`.
29. "Cancel swap request" / "Close search" ad uyuşmazlığı (R2-49). `leave: low / do: safe`.
30. Müdürün tek tıkla onayı başarısız olunca odak kayboluyor (R2-50). `leave: low / do: safe`.
31. Shorten'da bozuk `segment_id` 500 dönüyor; yorumdaki izin adı yanlış (R2-55). `leave: low / do: safe`.

**Mevcut maddelere eklenecekler (yeni numara gerekmez):**
- BL-363: ikinci rota, üye olmayana 403/404 farkı, ikinci istek yardımcısı ve 401 (R2-21).
- BL-674: Time off Activity, onay saati ve Shorten'daki "GMT+3" (R2-28).
- BL-602: Requests'teki Time off / Shift changes sekmeleri (R2-48).
- BL-654: Shorten'ın ham hata metni (R2-11).
- BL-276 / FB-6.4 Done when 6: "kısıtlı müdür onaylayamaz" test hücresi (B §2).
- BL-410: Workspace sayacı, rütbe kuralı gelince aynı kurala geçmeli (A §5).

## 4. Mert'e sorulacak kararlar (CLAUDE.md §13 şablonu, ham)
Koordinatör ILKELER ve KARARLAR'la yeniden tarar, kendi dayanağıyla verebileceğini verir, kalanı tek turda sorar. Soru metni İngilizce UI adlarıyla, Türkçe.

**S1 — Owner'ın kendi vardiyası için açtığı takas, devir ya da pickup'ı kim onaylar?**
- **Bugün:** Schedule → Requests → Shift changes → vaka → Approve. Rütbe kuralı uygulanmadığı için herhangi bir müdür onaylayabiliyor. Kural gelince kimse onaylayamayacak.
- **Örnek:** Owner Mert Cuma 17:00 vardiyasını garson Hande'ye devrediyor.
- **(a) Hande kabul edince onaysız kaydolur; vardiyanın lokasyonundaki müdürlere bilgi bildirimi gider (Önerilen).** Onay adımı yok. Kadıköy müdürü Ayşe "Mert'in Cuma vardiyası Hande'ye geçti" bildirimini alır; onay isteği değildir. Engel yok.
  `Dayanak: KARARLAR "Ürün kuralları" Rütbe satırı (owner'ın talebi onay gerekmeden kaydolur, etkilenen manager'lara bildirim gider; izin için yazılmış, 2026-09-26) + ILKELER P07`
- **(b) Lokasyon müdürü onaylar.** Ayşe, Mert'in devrini onaylar ya da reddeder. P07'deki "bir üst kademe" kuralına aykırı.
- **(c) Owner takasa katılamaz.** Mert'in vardiyası Shift Hub'da devredilemez; değişikliği Schedule'da kendisi yapar.
- Kaçış: "Claude karar versin" / "Önce sohbette konuşalım".

**S2 — Belgesi eksik müdür bekleyen izin taleplerini görsün mü?**
- **Bugün:** Belgesi gecikmiş müdür uygulamayı açınca Account → Documents'a yönleniyor; Requests'i hiç göremiyor. KARARLAR'daki 2026-10-01 kararı ise "talebi görür ama oy veremez, Approve kapalı" diyor.
- **Örnek:** Kadıköy müdürü Hande'nin gıda sertifikasının süresi geçti. Ali'nin Salı izni bekliyor.
- **(a) Hande Requests'i açar, Ali'nin talebini ve ilerlemeyi görür; Approve ve Deny kapalıdır, yanında "belgen eksik" notu durur (Önerilen).** Uygulamanın geri kalanında yönlendirme sürer, yalnız Requests okunur. Engel: oy.
  `Dayanak: Mert'in 2026-10-01 kararı (KARARLAR "İzin" Ek S3) + ILKELER P22 (en güncel açık karar kazanır)`
- **(b) Bugünkü gibi: Hande belgesini yükleyene kadar Requests'i göremez.** S3 satırı KARARLAR'dan silinir.
- **(c) Hande talebi görmez ama Requests'te "N izin talebi bekliyor, belgen tamamlanınca karar verebilirsin" yazısı görür.**
- Kaçış: "Önce sohbette konuşalım". Bu bir yetki kapsamı sorusu; P18'e göre sohbet de seçilebilir.

**S3 — Özel rolde Time off için "View" (yalnız görme) seviyesi kalsın mı?**
- **Bugün:** Settings → Roles → bir rol → Requests → Time off: "View" seçilebiliyor. Bu rol, karar veremediği bekleyen talepleri ve kimin onayladığını görüyor.
- **Örnek:** Owner "Shift lead" rolü açıp Time off'u "View" yapıyor. Can, Kadıköy'ün bütün bekleyen izinlerini görüyor ama hiçbirine dokunamıyor.
- **(a) Time off'ta "View" seviyesi kalkar; görme, karar verme izniyle birlikte gelir (Önerilen).** Bekleyen talebi yalnız karar veren ve sahibi görür. Onaylanmış izin Schedule'da herkese görünmeye devam eder.
  `Dayanak: KARARLAR "Schedule → Requests" (bekleyen ve kapanmış izin talebini yalnız ona karar verebilenler ve sahibi görür, 2026-10-01) + ILKELER A anti-hedef "ayar cehennemi"`
- **(b) "View" kalır ama yalnız kapanmış talepleri gösterir.** Can geçmiş kararları görür, bekleyenleri görmez.
- **(c) Bugünkü gibi kalır.** Kurala "özel rol istisnası" eklenir.
- Kaçış: "Önce sohbette konuşalım" (yetki modeli, P18).

**S4 — Vardiya değişikliği bildirimleri owner'a ve bütün admin'lere gitsin mi?**
- **Bugün:** Shift changes'te her başvuru ve her lokasyon onayı lokasyon müdürüne, owner'a ve bütün admin'lere gidiyor. Yerel ölçümde owner 138, admin 138, müdür 428 bildirim.
- **Örnek:** Kadıköy garsonu Beşiktaş'taki açık vardiyaya başvuruyor. Beşiktaş müdürü Mehmet, owner Mert ve iki admin "Shift change ready for review" alıyor.
- **(a) Bildirim yalnız karar verecek lokasyon müdürüne gider; o lokasyonda müdür yoksa admin ve owner yedek alıcıdır, izindeki gibi (Önerilen).** Mert ve admin'ler gürültü almaz; müdürsüz lokasyonda talep sahipsiz kalmaz.
  `Dayanak: ILKELER P07 (bildirim karar verene ve işi doğrudan etkilenene gider; admin gürültüsü yok — onay bildirimleri için geçerli) + ILKELER A anti-hedef "bildirim gürültüsü"`
- **(b) Bugünkü gibi: owner ve bütün admin'ler de alır.**
- **(c) Admin'ler alır, owner almaz.**
- Kaçış: "Claude karar versin".

**S5 — Müdürün takas reddinde yazdığı "Private manager note" kime görünsün?**
- **Bugün:** Shift changes → vaka → Decline penceresinde not yazılıyor, kaydediliyor ama hiçbir ekranda gösterilmiyor.
- **Örnek:** Ayşe Veli'nin başvurusunu reddederken "geçen ay iki kez gelmedi" yazıyor.
- **(a) Not, vakanın geçmişinde yalnız o vakaya karar verebilen müdürlere, admin'e ve owner'a görünür; çalışan görmez (Önerilen).**
  `Dayanak: ILKELER P09 (veri sessizce düşmez) + ILKELER P07 (onay zincirinde görünürlük karar verenle sınırlı)`
- **(b) Not alanı kalkar.** Gerekçe yalnız çalışanın da gördüğü ret mesajına yazılır.
- **(c) Not yalnız yazan müdüre görünür.**
- Kaçış: "Claude karar versin" / "Backlog'a yaz".

**S6 — Requests, liste sayfalarının ortak diline bu ekran turunda mı geçsin?**
- **Bugün:** Settings → Documents, Employees → Documents, Announcements, Important Dates, Notifications ve Availability ortak tablo dilinde. Requests eski dilde: farklı başlık satırı rengi, kenar ve sekme yeri.
- **Ortak değer:** geçince aynı farkı taşıyan Employees, Settings → Locations, Jobs, Acknowledgements ve Shift catalog da uyuşmaz kalır. Onlar bu turda değişmez; adıyla söylenir.
- **Örnek:** Ayşe Notifications'tan Requests'e geçince tablo başlığının rengi ve sekmelerin yeri değişiyor.
- **(a) Evet, bu turda; Time off ile Shift changes aynı iskelete gelir (Önerilen).**
  `Dayanak: KARARLAR "Genel" → "Liste sayfalarının ortak dili" (Mert, 2026-10-05) + EKRAN-PLANI seçim 2 (ekranın açık backlog maddeleri o turda yapılır)`
- **(b) Ayrı bir tutarlılık işi olarak, bütün liste sayfalarıyla birlikte sonra.**
- **(c) Backlog'a yaz.**

**S7 — Arama kutusu ve açılır liste kenarı koyulaşsın mı?** (Renk sorusu; P04 koşuluna göre yazıyla sorulabilir.)
- **Bugün:** Kenar rengi açık zeminde 1,86:1, Requests'te 1,25:1. Erişilebilirlik ölçütü 3:1 istiyor. Renk, Mert'in 2026-10-05 ortak liste kararında yazılı.
- **Örnek:** Ayşe açık gri zeminde arama kutusunun kenarını zor seçiyor.
- **(a) Kenar 3:1'e koyulaşır, bütün liste sayfalarında birlikte (Önerilen).** Ortak dil değişir, bütün ekranlar aynı anda güncellenir.
  `Dayanak: CLAUDE.md §9 (WCAG 2.1 AA kontrast)`
- **(b) Bugünkü renk kalır.**
- **(c) Yalnız odaktayken koyulaşır.**
- Kaçış: "Backlog'a yaz". Ekran turu dışı ortak iş; S6 ile birlikte düşünülebilir.

## 5. Görsel kararlar (varyantla, yazıyla sorulmaz — ILKELER P04)
- **G1:** Müdürün onaylayamadığı vakada Approve kapalı mı gizli mi (FB-6.4 B).
- **G2:** Onay ekranında yol/dinlenme işareti ve "kendi rızasıyla müsait değil" işaretinin görünümü (FB-6.4 B.1; R2-02, R2-17).
- **G3:** Sistemin yazdığı izin kısaltma satırının etiketi ve yeri (BL-364, R2-52).
- **G4:** Shift changes'in Time off denetimini alması (R45, R48, R51). A'ya göre varyant gerekmiyor; tek ekran görüntüsüyle teyit yeter.

## 6. Koordinatöre: sorusuz verilebilecek kararlar ve plan düzeltmeleri
**Dayanağı yazılı olduğu için Claude'un verebileceği kararlar (öneri):**
- **R2-04:** yıkıcı düğmeler kırmızı ve iki tık. Dayanak: CLAUDE.md §9 buton dili.
- **R2-02:** yol ve dinlenme, engel değil işaret. Dayanak: KARARLAR:168.
- **R2-16:** gerçek çakışmada kabul düşer. Dayanak: ILKELER P24 ("bekleyen kabul yalnız gerçek çakışmada düşer").
- **R2-13:** tek karar, tek bildirim. Dayanak: ILKELER A anti-hedef "bildirim gürültüsü".
- **R2-23:** kısaltma bildirimi izni onaylayan herkese gider. Dayanak: D O14'ün gösterdiği KARARLAR kuralı.
- **R2-41, R2-42, R2-45:** metin düzeltmeleri. Dayanak: ILKELER P21.
- **R2-43:** geçmiş izinde Revoke gizlenir. Dayanak: P25 (sonuç açıkça yazılır).
- **R2-47:** "Discard request decision?" sarmalayıcısı silinir; Shorten kapanırken sormaz. Dayanak: ILKELER P26 (kısa formda sorulmaz).
- **BL-508:** kapanır (bayat).

**Plan ve kayıt düzeltmeleri:**
- **FB-6.4 A3.5** "header'lı ikinci kopya silinir" diyor, ama web yalnız o kopyayı çağırıyor (`requests-data.ts:38`). Önce web taşınmalı ya da tersine `/v1` kopyası silinmeli; yoksa Requests boş açılır (A §4).
- **FB-6.4'ün tazelik maddesi 3** "dinlenme takasta denetlenmiyor" diyor; yanlış. Dinlenme denetleniyor ve engelliyor (D Y2).
- **FB-6.4 D6** "kabul düşmüyor"u bugünkü davranış diye yazıyor; bu bir hata (D O8).
- **FB-6.4 Done when 6:** "kısıtlı müdür onaylayamaz" ve "müdür kendi vakasında reddedemez" test hücreleri eklenmeli (B §2, D Y3).
- **B O1**'in gösterdiği migration satırı eski tanım; doğrusu `20261003040000_time_off_forgets_location_and_parts.sql:925`.

## 7. Sınırda (başka ekranla ortak)
- **Shift Hub (ekran 13):** `ShiftExchangeHub` ortak. R2-01, R2-02, R2-04, R2-07, R2-16 ve R2-18'in düzeltmesi iki ekranı birlikte değiştirir.
  - BL-652: geçmiş ertesi gün kayboluyor; müdürü de etkiliyor.
  - BL-397: rıza metni.
  - BL-110: "Unconfirmed".
  - BL-057: bilgi mimarisi.
- **Employee Hub ortak dosyaları:** `TimeOffPeriods`, `TimeOffReleasedAssignments`, `time-off-split`, `TimeOffCancellationHours`, `time-off.css`. R2-28 ve R2-42 iki ekranı da etkiler. Talep açma ve iptal isteği fonksiyonları çalışan tarafının.
- **Workspace → "Pending requests":**
  - Shift changes sayısı onaylanamayacak vakaları da sayıyor (BL-410).
  - Rütbe kuralı gelince sayı da aynı kurala geçmeli.
- **Notifications:** R2-09, R2-13, R2-14 ve R2-23 bu ekranda görünür.
- **Schedule (ekran 1):**
  - Takastan sonra geri alma (BL-167, BL-189).
  - "İzni kısalt ve ata" (BL-362).
  - İzin ve kapalı gün vardiyayı ayrı ayrı açıyor (BL-544).
  - Onaylı izin ayarı (BL-523).
  - Dört haftalık testler (BL-519).
  - İzin onayı ile ızgara yazımının aynı kilidi alıp almadığı ölçülmedi (B §5).
- **Settings → Roles:** "View" seviyesi (S3) ve izin açıklaması (R2-46).
- **Ortak bileşenler:**
  - `ConfirmDialog` (BL-656, BL-580 telefonda 8 px kayma).
  - `CatalogDrawer` (BL-515).
  - `PermissionRoute` (BL-176).
  - Belge yönlendirmesi (S2).
- **Canlı kanal:** `shift-exchanges:<workspace>` takas açabilen herkese talep ve vaka id'sini duyuruyor; içerik yok. B bulgu saymadı.

## 8. Bakılamayanlar (raporlardan)
- **Toast'lar, "Saving...", Shorten sonucu ve iki müdür yarışı tarayıcıda görülmedi:** karar vermek ve veri yazmak yasaktı (C, D).
- **Eş müdürün bekleyen talebi görmediği yalnız SELECT ile ölçüldü;** ikinci müdürle giriş yapılmadı (C).
- **Taklit veriyle görülenler** (C):
  - açılan vardiyalar;
  - kontrol listesinin onaylı hâli;
  - 50'den fazla talepte sayfalama;
  - bozuk cevap.
- **Doğrulanmamış şüpheler** (B §5, D §4):
  - arşivli lokasyonda takas onayı;
  - personelsiz kalan lokasyonun müdürünün "View-only" görmesi;
  - silinmiş lokasyonda ham hata;
  - performans.
- **Başsız Chrome Türkçe açıldı;** tarih biçimi bulgusu (R2-28) bundan bağımsız (C).

## 9. Ekran oturumunun kendi doğrulamaları (2026-10-05, `e929abc7`)
| İddia | Komut / dosya | Sonuç |
|---|---|---|
| R2-03 sayfalama hatası en son tanımda duruyor | `20261003040000…sql:915-925` okundu | `limit target_limit + 1` içinden `min(created_at)` → sonraki sayfa `< cursor`; 51. satır dışarıda. Doğrulandı |
| R2-04 karar düğmesi her kararda yeşil | `ShiftExchangeHub.tsx:1580-1590` | onay düğmesi koşulsuz `className="sx-primary"`. Doğrulandı |
| R2-10 arama sayfayı yeniden yüklüyor | `requests-data.ts:128-133`, `ScheduleRequestsPage.tsx:279` | `queryKey` aramayı içeriyor, `placeholderData` yok; `isLoading` olunca sayfa yerine `RequestState`. Doğrulandı (kodda) |
| R2-08 belgesi eksik müdür yönleniyor | `apps/web/src/documents/DocumentAccessRoute.tsx:32` | `Navigate to=/account/documents`. Doğrulandı |
| S2 / S3 dayanağı | `KARARLAR.md:128` | S3 metni: "görür ama oy veremez". Doğrulandı |
| R2-02 dayanağı | `KARARLAR.md:168` | "işaret olarak gösterilir, engel değildir". Doğrulandı |
| S1 dayanağı | `KARARLAR.md:75` | "Owner'ın talebi onay gerekmeden kaydolur, etkilenen manager'lara bildirim gider". Doğrulandı |
| FB-6.4 A3.5 plan düzeltmesi | `tasks/FB-6.4.md:72` + `requests-data.ts:38` | plan header'lı kopyayı siliyor, web onu çağırıyor. Doğrulandı |
| C'nin süreçleri durdu | `netstat -ano` 5630/5631 | LISTEN yok |

## 10. Mert'in seçimleri ve kapanış durumu
2026-10-05 ~22:00Z, çoktan seçmeli (koordinatör `local_9c7e674a…`). Hepsi KARARLAR → "Schedule → Requests"a yazıldı.
- **S1 owner takası — seçenek dışı:** o lokasyonun müdürü, owner ya da admin onaylar; kimse kendini onaylamaz.
- **S3 View:** Time off'ta View seviyesi kalkar (önerilen).
- **S5 özel not:** yalnız o vakaya karar verebilenler görür (önerilen).
- **S7 kenar rengi:** Mert iki hâli gerçek ekranda yan yana görüp seçecek (görsel karar).
- **Koordinatörün verdiği (KK-158, sormadan, dayanaklı):**
  - S2: belgesi eksik müdür Requests'i görür, oy veremez (Mert'in 2026-10-01 kararı);
  - S4: bildirim yalnız karar verecek lokasyon müdürüne, yedek admin / owner (P07);
  - S6: Requests bu turda ortak liste diline geçer (KARARLAR "Liste sayfalarının ortak dili");
  - §6'daki öneriler (R2-04, R2-02, R2-16, R2-13, R2-23, R2-41/42/45, R2-43, R2-47, BL-508 bayat) kabul; plan düzeltmeleri FB-6.4 görev dosyasına işlenecek.
- **Görsel kararlar (varyantla):** G1–G4 ve S7.

Kapanış durumu: keşif ve kararlar bitti (2026-10-05). Sırada görev dosyası ve uygulama; FB-6.4 Takas bu ekranın işi.
