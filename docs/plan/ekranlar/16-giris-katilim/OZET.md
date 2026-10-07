# Ekran 16 — Giriş ve katılım: keşif özeti (EKRAN-16-KESIF, 2026-10-07, `fb9ced47`)

Yazan: `oturum/ekran-16` (koordinatör "Koordinatör" adına, KK-195). Turun 1. ve 2. adımı (keşif + kayıt) bitti; 3. adım (Mert'le konuşma) koordinatörün.

## Mert için özet
1. Giriş, davet, Workspaces ve iki kurulum 2026-10-07'de dört ajanla tarandı. Ekran görüntüleri ve her bulgunun yanında "Değiştir / Bırak / Konuşalım" seçimi tek sayfada: **https://claude.ai/artifact/PEYuSjGWXGN9dkb9LipikY** (seçimler sayfada kalır; koordinatör okuyup karara işler).
2. **Güvenlik sağlam:** yanlış workspace'e katılmak, başkasının davetini kabul etmek ya da hesabı ele geçirmek için yol bulunmadı (B).
3. **Senin dört kararın ekranda yok:** girişte "Active invitation found" ekranı; favori yokken sormak; "Create" düğmesinin ne zaman görüneceği; "I am waiting for an invitation" metni.
4. **Sessiz kayıplar:** kurulum sonunda gitmeyen davetler owner'a söylenmiyor. Kurulumda geri dönünce ilerleme geri sarıyor, adlar boş geliyor. Favori workspace kurulum bitince kendiliğinden değişiyor.
5. **Yanlış cümleler:** silinen taslak "Closed" diye kalıyor. Onboarding'den kendi vazgeçen kişi "bir yönetici açana kadar beklemede" okuyor. Yeniden gönderilen davetin eski bağlantısı "iptal edildi" diyor.
6. **Görünüm:** aynı işi yapan düğmeler 36, 42 ve 44 px. Telefonda düğmeler 36 px (dokunmak için 44 gerekir). Owner kurulumu telefonda sağa kaymış.
7. **Ham hata metni:** "Invalid login credentials", "owner onboarding revision conflict", "duplicate key…".
8. Sana **4 soru** var (bölüm 2). Prototipten 24 madde "taşı", 2 madde "sorduktan sonra taşı", 4 madde "varyant gerekir", 2 madde "bırak" (bölüm 3).

## 0. Kısaca
- **Ekran:** Sign in (hesap oluşturma dahil), Forgot password, Reset password, Account recovery, davet bağlantısı (`/invite/accept`), Workspaces (`/workspaces`) ve durum sayfası (`/workspaces/status`), girişten sonra nereye inildiği, owner kurulumu (`/onboarding`), çalışan kurulumu (`/welcome/:id`), Sign out. Bunların API ve veritabanı katmanı da içeride.
- **Dışarıda:** Account (ekran 15), Employees'te davet gönderme ve onboarding onayı (ekran 3), Documents (ekran 6), yasal sayfalar (ekran 17), Billing (ekran 18), Settings.
- **Sınırda:** bölüm 6.
- **Raporlar (olduğu gibi):**
  - [A: backlog ve prototip](A-backlog-prototip.md) (`nf-okur`, opus).
  - [B: güvenlik](B-guvenlik.md) (`nf-guvenlik`).
  - [C: görsel](C-gorsel.md) (genel ajan; web 5632, API 5633).
  - [D: kod ve davranış](D-kod-davranis.md) (genel ajan, opus).
  - Dördü de salt okuma. Kod ve test değişmedi, ağır koşu yok. Yerel DB'de yalnız SELECT çalıştı. Görsel turda veri yazan istekler tarayıcıda engellendi. Yan etkiler bölüm 8'de.
- **Ekran görüntüleri:** `artifacts/EKRAN-16/` (65 PNG; git dışında, ana klasörde). Aynı görüntüler sunum sayfasında da var.
- **Sayılar:**
  - A: 49 açık backlog maddesi (4'ü numarasız). 4'ü değişmiş, kalanı geçerli, bayat yok. Ayrıca 7 YENİ madde ve 32 prototip farkı.
  - B: kritik ve yüksek bulgu yok; 1 orta, 7 düşük.
  - C: 1 yüksek, 14 orta, 9 düşük. D: 1 yüksek, 19 orta, 24 düşük.
  - Birleşik liste aşağıda: 24 ana madde ve düşükler.

## 1. Tek liste — önem sırasıyla
Biçim: ne · ekranda nerede · örnek · kaynak · backlog · işaret (`leave` / `do`). Kaynaklarda harf ve numara rapordaki bulgunun kimliği (A YENİ-1, B1, C-04, D-22).

### Yüksek
- **E16-01 — Girişte bekleyen davet ekranı ("Active invitation found") ve "Not now" yok.**
  - **Nerede:** Sign in → workspace'i olan kişi doğrudan uygulamaya iner. Davet yalnız Workspaces'te ve sol üstteki küçük sayıda görünür.
  - **Örnek:** Ali Meyhouse'ta çalışıyor, Sunset Tacos onu davet etti. Ali girişte daveti hiç görmez; süresi dolabilir.
  - **Ek:** İki test bu davranışı kilitliyor (`ProtectedRoute.test.tsx:190`, `WorkspaceHubPage.test.tsx:194`). İniş kararı 9 yerde veriliyor (E16-22).
  - **Kaynak:** A, C-01, D-01. **Backlog:** BL-624. **İşaret:** `leave: high / do: moderate`.

### Orta
- **E16-02 — Favori işaretli değilken sistem kişiye sormadan bir workspace seçiyor. Kurulum bitince favori de kendiliğinden değişiyor.**
  - **Örnek:** Test Manager iki workspace'te çalışıyor, favorisi yok; dün açtığı Ridgeline'a sorulmadan iner. Ayşe'nin favorisi Meyhouse; Sunset Tacos'un kurulumunu bitirince ertesi gün Sunset Tacos'a iner.
  - **Ek:** Sunucu doğru davranıyor, web onu eziyor. Favoriyi değiştiren tetikleyici `schema.sql:22949-22980`.
  - **Kaynak:** A, D-02, D-03. **Backlog:** BL-625 + YENİ (tetikleyici). **İşaret:** `leave: medium / do: moderate`.
- **E16-03 — "Create your workspace" yanlış kişiye görünüyor, doğru kişiden gizleniyor.**
  - **Örnek:** Meyhouse'ta çalışan Ali düğmeyi görür. Basınca "Workspace could not be created" okur, nedenini öğrenmez. Meyhouse'un owner'ına tek davet gelince düğme gizlenir.
  - **Ek:** "Kendi işletmesini açma" kuralı iki yerden delinebiliyor:
    - davetini kabul etmiş ama kurulumu bitmemiş çalışan işletme açabiliyor;
    - bir yerde owner olan kişi, başka yerde çalışsa da işletme açabiliyor.
  - **Kaynak:** A, B3, C-03, D-35. **Backlog:** BL-626 + YENİ. **İşaret:** `leave: medium / do: safe` (sorular S1, S2).
- **E16-04 — Kurulum bitince sıradaki davetler gönderilemezse owner'a hiçbir şey söylenmiyor.**
  - **Örnek:** Mert kurulumda Orhan'ı ekler, "kurulum bitince gönder"i işaretler. Gönderim düşer; Mert uyarı görmez, Orhan Employees'te davet edilmemiş görünür.
  - **Ek:** Bu davranışı kilitleyen test `workspace-account-routes.test.ts:409`. P09'a aykırı.
  - **Kaynak:** D-22. **Backlog:** YENİ. **İşaret:** `leave: medium / do: moderate`.
- **E16-05 — Owner kurulumunda ilerleme kayboluyor.**
  - Önceki adıma dönüp kaydetmek ilerlemeyi geri sarıyor.
  - Kurulum kaldığı yerden açılınca resmî ad alanları ve "Added so far" listesi boş geliyor.
  - **Örnek:** Jordan Rivera 1. adıma döner; ad alanları boş, Continue kapalı (C görüntüsü `20-onboarding-adim1`).
  - **Kaynak:** A, C-13, D-21. **Backlog:** BL-632, BL-633. **İşaret:** `leave: medium / do: moderate`.
- **E16-06 — Discard edilen taslak Workspaces'te "Closed" diye kalıyor.**
  - **Örnek:** Mert yanlışlıkla açtığı "New workspace"i Discard eder. Satır kalkmaz, "Closed" olur. Why'a basınca bir işletmenin kapandığını anlatan metin çıkar.
  - **Ek:** Ekran oturumu yerel DB'de doğruladı: "New workspace" silinmiş, owner üyeliği askıda.
  - **Kaynak:** D-37. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe` (öneri K3).
- **E16-07 — Askı ve vazgeçme yanlış anlatılıyor.**
  - Onboarding'den kendi vazgeçen kişi "On hold" görüyor. Why'da "bir owner ya da admin açana kadar" yazıyor.
  - Aynı workspace'ten gelen yeni davet listede görünmüyor.
  - Kişinin askısı, workspace'in askısı gibi anlatılıyor.
  - **Örnek:** Ali Sunset Tacos'un onboarding'inden vazgeçer ve "Nothing in Sunset Tacos can be opened until an owner or an admin lifts the hold." okur. Suspended Demo'da yalnız bir kişinin üyeliği askıda, ama ekran workspace'in askıda olduğunu söylüyor.
  - **Kaynak:** C-15, D-38. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe` (öneriler K4, K5).
- **E16-08 — Davet kapısının boşlukları.**
  - Kurulumu bitmemiş workspace'ten API ile davet gönderilebiliyor (Mert'in 2026-10-01 kararına aykırı).
  - Askıdaki, kapanan ya da taslak workspace'in daveti Workspaces → Join ile kabul edilebiliyor. Kişi hiçbir şey açamayan bir üyelikle kalıyor ve "başka adres" cümlesi görüyor.
  - Kaydı arşivlenen kişinin daveti açık kalıyor. Kabul düşüyor ve açık görünen davet kişinin kendi işletmesini açmasını engelliyor.
  - **Kaynak:** A, B1, B2, D-15, D-26. **Backlog:** BL-419 + YENİ. **İşaret:** `leave: medium / do: safe` (öneriler K6, K11).
- **E16-09 — Yeniden gönderilen davetin eski bağlantısı "This invitation was withdrawn" diyor.**
  - **Örnek:** Ayşe Perşembe daveti yeniden gönderir. Ali Pazartesi'nin e-postasını açar, "Meyhouse cancelled it" okur ve istenmediğini sanar.
  - **Kaynak:** D-14. **Backlog:** YENİ (KARARLAR "Send reminder / Resend" ile bağlı; Employees tarafı BL-767). **İşaret:** `leave: medium / do: moderate` (öneri K7).
- **E16-10 — Davet bağlantısı sayfası eksik ve yanıltıcı.**
  - Sayfa yüklenirken yanlış metinle açık bir Accept gösteriyor.
  - Başka hesapla açılınca bunu ancak Accept'e basınca söylüyor.
  - Sayfada Decline ve geri dönüş yok. Aynı eylem burada "Accept", Workspaces'te "Join".
  - Kabulden sonraki her yetki reddi "This invitation is for another address" ekranına düşüyor.
  - **Kaynak:** A, B2, C-11, D-13, D-17. **Backlog:** BL-631 + YENİ. **İşaret:** `leave: medium / do: safe` (öneri K10).
- **E16-11 — Ekrana ham ya da geliştirici hata metni çıkıyor.**
  - Sign in: "Invalid login credentials".
  - Account recovery: "Valid recovery token required"; sunucu çökse de aynı cümle geliyor.
  - Forgot password: "Failed to fetch".
  - Reset password: Supabase'in kendi cümlesi.
  - Owner kurulumu: 14 yerde "owner onboarding revision conflict" ve "duplicate key…".
  - Çalışan kurulumu: zod'un varsayılan cümleleri.
  - **Kaynak:** A, C-09, D-06, D-10–D-12, D-23. **Backlog:** BL-628, BL-629, BL-630, BL-637, BL-638, BL-620, BL-621, BL-490. **İşaret:** `leave: medium / do: moderate`.
- **E16-12 — Discard, taslakta kişi ve veri olsa da parola istemiyor.**
  - **Örnek:** Mert taslağa 3 lokasyon ve 12 kişi ekledi. Discard iki tıkla, parolasız siler.
  - **Ek:** Bu davranışı kilitleyen test `workspace-account-routes.test.ts:720`.
  - **Kaynak:** B (sınırda), D-24. **Backlog:** BL-284 (ürün sorusu K24). **İşaret:** `leave: medium / do: moderate` (öneri K1).
- **E16-13 — Telefonda kullanım sorunları.**
  - Düğmeler 36 px; dokunma hedefi 44 px olmalı.
  - Alan yazısı 13 px; iPhone dokununca sayfayı yakınlaştırır.
  - Owner kurulumunda içerik solda 24, sağda 64 px boşlukla duruyor; üstte 94 px boşluk var.
  - Birden çok workspace'te Sign out ekran dışında kalıyor. Jobs ve Team adımları yana kayıyor.
  - **Kaynak:** A (BL-151, YENİ-5), C-04, C-07, C-10, C-17. **Backlog:** BL-151 + YENİ. **İşaret:** `leave: medium / do: safe` (görsel karar G3).
- **E16-14 — Aynı işi yapan bileşenler farklı ölçüde.**
  - Yeşil düğme 36, 42 ve 44 px. Tek çıkış düğmesi bir sayfada yeşil, ötekinde beyaz.
  - Giriş alanı iki ölçüde: 42 px köşe 5 ve 44 px köşe 6.
  - Yazılan cevap ve yer tutucu kalın; dolu gibi duruyor.
  - **Kaynak:** A, C-05, C-06. **Backlog:** BL-622 + YENİ. **İşaret:** `leave: medium / do: safe`. Ortak değer olduğu için önce KARARLAR'a kural yazılır ve Mert'e sorulur (CLAUDE.md §4.7; görsel karar G1).
- **E16-15 — Erişilebilirlik eksikleri.**
  - Yanlış paroladan sonra klavye odağı kayboluyor, hata alana bağlı değil, düğmeler 37 px kayıyor.
  - Kurulumdaki kapalı anahtar zeminden ayrılmıyor (1,8:1).
  - Seçili satırdaki rol yazısı 4,39:1 (AA eşiği 4,5).
  - Forgot password gönderilince odak sayfanın başına düşüyor.
  - Sekme başlığı her ekranda "Newfork Clean".
  - **Kaynak:** A, C-08, C-09, C-14, C-16. **Backlog:** BL-289, BL-635 + YENİ. **İşaret:** `leave: medium / do: safe`.
- **E16-16 — Paylaşılan cihazda yeni giren kişi bir öncekinin son sayfasına iniyor.**
  - **Örnek:** Restoran tabletinde Ayşe Settings → Roles'tayken çıkar. Ali girince oraya gönderilir ve "erişim yok" görür.
  - **Kaynak:** A, D-07. **Backlog:** BL-627. **İşaret:** `leave: medium / do: safe`.
- **E16-17 — Account recovery bağlantı eksikse çıkmaz sokak.**
  - Düğme nedeni yazılmadan kapalı duruyor.
  - Sign in'e dönüş ve yeni bağlantı isteme yolu yok.
  - Çerçeve sola yaslı; öteki oturumsuz ekranlar ortalı.
  - **Kaynak:** A, C-12, C-18, D-12. **Backlog:** BL-629, BL-285 + YENİ. **İşaret:** `leave: medium / do: safe`.
- **E16-18 — Çalışan kurulumunda kişi neyi beklediğini bilmiyor.**
  - Resmî ad farkı onay beklerken adım "Done" görünüyor.
  - Review sayfası "Needs changes" işaretinden söz ediyor, ama böyle bir işaret yok.
  - Onaydan sonra bağlantı düşerse kişi "Finishing up"ta düğmesiz kalıyor.
  - Middle name farkı onaya hiç gitmiyor.
  - Resmî ad alanları davetteki adla önceden dolu geliyor.
  - **Kaynak:** A, B, D-30, D-31, D-32. **Backlog:** BL-646, BL-645, numarasız (`BACKLOG.md:182`) + YENİ. **İşaret:** `leave: medium / do: safe` (sorular S3, S4; öneri K2).
- **E16-19 — ABD form kuralları iki kurulumda uygulanmıyor:** sabit "+1", Türkçe harf yasağı, e-posta tekilliği.
  - **Örnek:** Orhan telefonuna "+90 532 …" yazar, "Şükrü" adı kabul edilir.
  - **Kaynak:** A, D-28, D-29. **Backlog:** BL-503. **İşaret:** `leave: high / do: risky` (maddenin işareti).
- **E16-20 — Karşılama ekranı Mert'in 2026-10-05 kararını taşımıyor.**
  - İkinci düğme "I have an invitation" diyor (karar: "I am waiting for an invitation").
  - "Welcome back" ilk kez gelenin ekranıyla aynı; yalnız başlık değişiyor.
  - **Kaynak:** A YENİ-1, C-02, D-36. **Backlog:** YENİ. **İşaret:** `leave: medium / do: safe`.
- **E16-21 — Posta kodundan saat dilimi önerisi çalışmıyor; tarayıcının saat dilimi dolu geliyor.**
  - **Örnek:** Mert İstanbul'dan Palo Alto'yu kurar, dilim Europe/Istanbul kalır.
  - **Kaynak:** A, D-27. **Backlog:** BL-634. **İşaret:** `leave: medium / do: safe`.
- **E16-22 — Girişten sonra nereye inileceği 9 yerde kararlaştırılıyor.**
  - Asıl fonksiyonun davet dalları üretimde hiç çağrılmıyor; "tek yer" yorumu yanlış.
  - Üç test KARARLAR'a ters davranışı kilitliyor.
  - **Kaynak:** A YENİ-3, D-04. **Backlog:** YENİ. **İşaret:** `leave: medium / do: moderate` (E16-01 ile aynı işte).
- **E16-23 — Davetle yeni hesap açan kişinin davet bağlantısı e-posta onayında kayboluyor; bu yolun tarayıcı testi yok.**
  - **Ek:** Workspaces daveti e-postayla eşleştirip listelediği için etkisi azalmış.
  - **Kaynak:** A, D-19. **Backlog:** BL-336, BL-434. **İşaret:** `leave: medium / do: moderate`.
- **E16-24 — Davet ve kurtarma bağlantılarındaki anahtar adres çubuğunda taşınıyor.**
  - Kabul, davetin gittiği onaylı e-postayla giriş istediği için etkisi sınırlı.
  - **Kaynak:** A, B5, D-20. **Backlog:** BL-351. **İşaret:** `leave: medium / do: moderate` (B: low).

### Düşük (kısa)
- **İniş ve metin:**
  - Onaydan sonra herkes Employee Hub'a iniyor, müdür de (D-05, YENİ).
  - Hesap oluşturma açıklaması olmayan bir adımı vaat ediyor (D-09, YENİ).
  - Sign in ile Create account arasında eski hata kalıyor (BL-636).
  - Yarım kurulum düğmesi "Continue"; kararda "Continue setup" (A YENİ-2).
  - Reset password'den Sign in'e dönüş yok (C-21, BL-285).
  - Küçük metin farkları: "E-mail" / "Email", "invite it" (C-22).
- **Davet ve Workspaces:**
  - Aynı daveti iki sekmede kabul eden ikinci sekmede hata görüyor (D-16).
  - Kurulumun Team adımında aynı kişi iki kez kaydedilebiliyor (D-25).
  - Taslak workspace'in owner olmayan üyesi o workspace'i listede görmüyor (D-41, numarasız `BACKLOG.md:177`).
  - Cevaptan sonra Account rozeti yenilenmiyor (BL-389).
  - Açık workspace'in durum adresi "isn't open to you" diyor; tarih tarayıcının dilinde (BL-639, D-39).
- **Owner kurulumu:**
  - Geliştirici cümlesi "Invite delivery waits until owner onboarding is completed." (BL-640).
  - Başarı mesajı adım değişince kalıyor (BL-641).
  - Onay kutuları yazının hizasında değil (BL-642).
  - Management satırında Remove etkin (BL-481, değişmiş: Rename doğru).
  - Kurulumda emekli `/organization-switcher` adresine giden 4 yer var (BL-650).
- **Görsel:**
  - Başlık boyları farklı, satıra tek kelime düşüyor (C-19).
  - Oturumsuz ekranlarda iki hizalama ailesi var (C-18).
  - Beyaz düğmenin kenarı soluk (BL-286, C-20).
  - Telefonda üç ayrı kenar boşluğu; e-posta kesik (C-17).
  - Kurulum CSS'inde ham renk kodları (BL-215, BL-169, C-23).
  - Geliştirme önizlemesi gerçek sayfadan farklı (C-24).
- **Güvenlik ve anayasa borcu:**
  - "Hayır" tek biçimde değil: ipucusuz 42501 (B4, A YENİ-6).
  - Ölü davet anahtarları düz metin duruyor (B6; BL-352 sınırda).
  - İkiz fonksiyonlar, oturum köprüsü, satır içi rol kontrolü, rotaya özel kapı, web'de `permissions.includes`, ölü politikalar (B7, D-43, BL-898).
  - Web'de güvenlik başlıkları yok: çerçeveye koyma, Referer, CSP (B8, YENİ).
  - Ölü kod ve `/accept-invite` ikiz rota (D-18, D-44, A YENİ-4).
  - Kullanılmayan `invited` durumu (BL-071).
  - SSN kalıntısı uç (BL-382).
  - Doğum tarihi kontrolü UTC'ye göre (D-34).
- **Kayıt ve araç:**
  - BL-007 değişmiş: "yedi adım" tanımlanmalı ya da kapanmalı.
  - BL-357, BL-358, BL-359, BL-384, BL-404, BL-568 geçerli.
  - Numarasız `BACKLOG.md:167` geçerli.

**Not (çözülen çelişki):** D-40 davet satırındaki Decline'ı kırmızı sanmıştı. C'nin ölçümü (`28c`) ve ekran oturumunun kod okuması (`InvitationRow.tsx:68-76`) düğmenin önce beyaz olduğunu gösteriyor; ilk tıkta kırmızı "Confirm decline"a dönüyor. Bu, hem KARARLAR'ın A görünümüne (beyaz Decline) hem CLAUDE.md §2.A.7'ye (yıkıcı eylem iki tık kırmızı) uyuyor. Soru yapılmadı.

## 2. Mert'e sorulacak kararlar (CLAUDE.md §3.6 biçimi, ham)

**S1 — 1 davet varken "Create your workspace" görünsün mü?**
- **Bugün:** Workspaces → "Your own workspace": davet varken düğme her zaman gizli. KARARLAR'da iki satır bu durumda birbirini tutmuyor: "0 ya da 1 davette görünür" ve "workspace'i olmayan davetli önce daveti cevaplar (sert engel)".
- **Örnek:** Jordan'ın hiç workspace'i yok; Northstar Kitchen onu davet etti. Mert Meyhouse'un owner'ı; ona da Northstar'dan davet geldi.
- **Seçenekler:**
  1. **Workspace'i olmayana gizli, kendi işletmesi olana görünür (Önerilen).** Jordan önce Join ya da Decline der. Mert hem daveti görür hem yeni işletme açabilir.
     Dayanak: KARARLAR "Davetin önceliği" ve "Create your own business görünürlüğü" birlikte okundu; prototip H17.
  2. **1 davette herkese görünür.** Jordan daveti cevaplamadan işletme açabilir; sert engel kalkar, sunucu kuralı da değişir.
  3. **Davet varken hep gizli (bugünkü).** Mert yeni işletme açmak için önce daveti cevaplamak zorunda.

**S2 — Başka bir workspace'te çalışan kişi kendi işletmesini açabilir mi?**
- **Bugün:** KARARLAR: "Owner olmadığı bir workspace'te aktif üyeliği bulunan hesap kendi işletmesini açamaz; bunun için ayrı hesap gerekir." Sunucu yalnız aktif üyeliğe bakıyor. Bir yerde owner olan kişiyi ise hiç durdurmuyor.
- **Örnek:** Ali Kadıköy'ün davetini kabul etti, onboarding'i bitmedi; bugün Create ile kendi işletmesini açabiliyor. Mert Beyoğlu'nun owner'ı ve Kadıköy'de çalışan; bugün yeni işletme açabiliyor.
- **Seçenekler:**
  1. **Onboarding'i süren kişi de engellenir; zaten owner olan kişi yeni işletme açabilir (Önerilen).** Ali ayrı hesap açar. Mert aynı hesapla açar.
     Dayanak: KARARLAR "Kendi işletmesini açma" (onboarding'deki üyelik de üyeliktir) ve "Daha önce işletme kurmuş kişi durdurulmaz"; owner kısmı yeni karar.
  2. **Kural harfiyen uygulanır.** Ali de Mert de yeni işletme için ayrı hesap açar.
  3. **Bugünkü gibi kalır.** Yalnız aktif üyelik sayılır; Ali'nin önü açık.

**S3 — Resmî adı onay bekleyen çalışan ne görsün?** (BL-646; seçenekler backlog maddesindeki taslaktan)
- **Bugün:** Onboarding → Review → Profile "Done". Onay beklendiğini söyleyen cümle yok.
- **Örnek:** Davette "Orhan Turan" yazıyor; Orhan "Turhan" diye düzeltir. Her şey "Done" görünür. Mert onaylayana kadar Orhan erişimin neden açılmadığını bilmez.
- **Seçenekler:**
  1. **Profile adımında ve Review satırında "In review" rozeti, profil sayfasında tek satır (Önerilen).** Satır: "Your legal name differs from your invitation. An owner or admin will check it."
     Dayanak: ILKELER P10 + P21; belge adımlarındaki "In review" rozeti.
  2. **Rozet yok, yalnız Review sayfasında tek satırlık not.** Orhan notu ancak Review'da görür.
  3. **Bugünkü gibi kalır.** Onay gelince erişim açılır, arada bilgi yok.

**S4 — Middle name resmî adın parçası sayılsın mı?**
- **Bugün:** Davetteki addan farkı yalnız ad ve soyadda aranıyor. Middle name değişirse onay istenmiyor.
- **Örnek:** Davette "Emre Can Yilmaz" yazıyor. Emre onboarding'de "Can"ı siler; değişiklik onaysız geçer ve bordroya gider.
- **Seçenekler:**
  1. **Evet; middle name farkı da owner ya da admin onayına gider (Önerilen).**
     Dayanak: KARARLAR "Onboarding'de resmî ad düzeltmesini yalnız owner ya da admin onaylar" (resmî ad bordro ve belgede kullanılır).
  2. **Hayır; yalnız ad ve soyad farkı onaya gider (bugünkü).**

## 3. Prototipten taşı / bırak (A §2; Q1–Q4, PHONE-AUTH)
- **Taşı (24):**
  - Davet ve Workspaces: girişte "Active invitation found" A görünümü; favori yokken sormak; Create görünürlüğü (başkasının workspace'inde çalışana yok).
  - Metin: karşılama düğmesi "I am waiting for an invitation"; "Continue setup".
  - Giriş, sıfırlama ve kurtarma: sade hata cümleleri; mod değişince hatanın temizlenmesi; Forgot'ta odağın başlığa gitmesi; kurtarma ekranında neden, yol, dar çerçeve ve güven bağlantıları; paylaşılan cihazda kişinin kendi sayfasına dönmesi.
  - Davet sayfası: yükleniyor anı.
  - Owner kurulumu: cevap metni normal kalınlıkta; onay kutusu hizası; "Invite delivery waits…" satırının kalkması; aynı adlı departman için sade cümle.
  - Form kuralları: sabit "+1"; Türkçe harf yasağı; e-posta tekilliği.
  - Çalışan kurulumu: sade doğrulama cümleleri; "Needs changes" rozeti; "Save reason" geri bildirimi; belge sayfası yerleşimi (sınırda); preferred name onay modu metinleri.
  - Telefon: sihirbaz çubuğu üç satır, içerik 342 px.
- **Taşı ama önce sor (2):** 1 davette Create (S1); resmî ad "In review" (S3).
- **Varyant gerekir (4, P04):**
  - Workspaces'te kapanış tarihi ve sahiplik devri rozetleri (H8).
  - Politika onay kutusu 18 px ve yeşil (sınırda, Documents).
  - Telefonda adım başlığının üst boşluğu (BL-151 (2)).
  - Telefonda 44 px düğme.
- **Bırak (2):**
  - Bekleme simgesi, 160 ms geçişler, basma hissi, ilerleme çubuğu animasyonu (P03).
  - Departman seçici liste kutusu (prototipin teknik sınırı).

## 4. Koordinatör kararı önerileri (KARARLAR ya da ILKELER birebir cevaplıyor; soru yapılmadı)
- **K1 — Discard parolası:** taslakta lokasyon, iş ya da kişi varsa Discard parola ister; boş taslak parolasız kalır. Dayanak: KARARLAR "Kurulumdan çıkmak vazgeçmek değildir" ("Kaybedilecek kişi ya da veri yoksa silmek için parola istenmez"). BL-284 / K24 bununla kapanır.
- **K2 — Resmî ad alanları:** çalışan kurulumunda resmî ad alanları boş başlar. Dayanak: KARARLAR "Legal name" ("tahminle ya da kopyayla doldurulmaz; kişi kendisi yazar"). Bu kuralı kilitleyen test (`EmployeeOnboardingPage.test.tsx:544`) yeniden yazılır.
- **K3 — Discard edilen taslak:** hiç bitmemiş ve Discard edilmiş taslak hiçbir listede görünmez. Dayanak: P21; silen kişinin kendisi.
- **K4 — Onboarding'den vazgeçme:**
  - Satır kendi metniyle kalır ("You left onboarding").
  - İki tıklık onay sonucu söyler.
  - Aynı workspace'ten gelen yeni davet listede görünür.
  - Dayanak: KARARLAR "Üyelik durumları", P21, P25.
- **K5 — Askı cümlesi:** kişinin askısı ile workspace'in askısı ayrı cümleyle anlatılır ("Your access to Suspended Demo is on hold."). Dayanak: P21.
- **K6 — Arşivleme ve davet:** arşivleme bekleyen daveti iptal eder; erişimi kaldırma ve işten çıkarma da bunu yapıyor. Dayanak: CLAUDE.md §2.A.4 (tek davranış), P23.
- **K7 — Eski davet bağlantısı:** yerine yenisi gönderilmiş davetin eski bağlantısı "A newer invitation was sent to you. Open the latest email." der. Dayanak: P21; KARARLAR "Send reminder / Resend".
- **K8 — Gitmeyen davetler:** kurulum sonunda gitmeyen davetler kurulumu geri almaz. Workspace'te tek satır uyarı çıkar ("2 invitations didn't go out. Send them from Employees."). Dayanak: P09.
- **K9 — Favori:** kurulumu bitiren tetikleyici işaretli favoriyi değiştirmez; yalnız favori yokken yazar. Dayanak: KARARLAR "Favori workspace".
- **K10 — Davet bağlantısı sayfası:**
  - Adres uyuşmazlığı önizlemede söylenir.
  - Eylemin adı her yerde "Join".
  - Decline ve "Not now", A görünümündeki dil ve düzenle gelir.
  - Dayanak: KARARLAR A görünümü, P20.
- **K11 — Davet kapısı veritabanında:** kurulumu bitmemiş ya da açık olmayan workspace'te davet üretilmez, listelenmez ve kabul edilmez. Ret `authz.*` ipucuyla döner. Dayanak: KARARLAR "Kurulum bitmeden davet yok" (BL-419), CLAUDE.md §2.A.1–2.
- **K12 — Kayıt düzeltmesi (eskimiş bilgi, koordinatörün işi):**
  - KARARLAR "Giriş ekranları": "Bekleyen: Supabase'in kendi sınırı 6 (BL-161)" eskimiş; yerel ayar 8.
  - "`?from=`" ifadesi kodda sayfa geçiş durumu.
  - UI-11 "iki panelli çerçeve" artık üst çubuk.

## 5. Görsel kararlar (varyantla, ILKELER P04 — sunum sayfasında gösterilecek)
- **G1 — Giriş ve katılım için tek ölçü.**
  - Öneri: düğme 44 px, alan 44 px ve köşe 6, cevap metni normal kalınlıkta, telefonda alan yazısı 16 px.
  - Ortak değer olduğu için önce KARARLAR'a kural yazılır ve etkilenen ekranlar adıyla söylenir (CLAUDE.md §4.7).
- **G2 — "Active invitation found":** A görünümü seçili (2026-10-05). Gerçek uygulamada kurulunca Mert gözle onaylar.
- **G3 — Telefonda owner kurulumu:** üst boşluk (BL-151 (2)) ve üç satırlık çubuk (prototip PHONE O2/O3).
- **G4 — Workspaces rozetleri:** kapanış tarihi ve sahiplik devri rozetleri (prototip H8).

## 6. Sınırda (başka ekranla ortak)
- **Account → Workspaces** (ekran 15):
  - "Set as default" favori kuralının yazıldığı yer.
  - "Create workspace" ad penceresi açıyor ve farklı bir görünürlük kuralı kullanıyor. Yarım taslak varsa, yazılan ad o taslağın adını sessizce değiştiriyor (D, YENİ).
  - Yalnız role bakan ikinci iniş yardımcısı; `/organization-switcher` çağrısı.
  - BL-287, BL-511, BL-355 (1); parolasız kapatma (BL-284).
- **Davet gönderme** (ekran 3):
  - Kurulum bitmeden davet kapısı (BL-419; kural bu ekranın).
  - Send reminder (BL-767), davetli admin'in rütbesi (BL-773), çekmecenin izin listesi (BL-774).
  - Davet bağlantısının "hayır"ı (BL-401, BL-420), düz metin davet anahtarı (BL-352).
- **Onboarding'in müdür onayı** (ekran 3): iki workspace'li müdür favori olmayanda inceleme yapamıyor (BL-280 (2)); resmî ad onayı.
- **Onboarding'deki belge adımı** (ekran 6): BL-647, BL-648, BL-649.
- **Ortak form kuralları ve hata yardımcıları:** BL-503, BL-620, BL-621. Düzeltme birden çok ekranı etkiler.
- **Workspace'e iniş sonrası** (ekran 5): BL-811, BL-805, BL-338, BL-122.
- **Deneme süresi** (ekran 18): her kurulum yeni 14 gün veriyor; KARARLAR "trial kullanmış owner tekrar alamaz" diyor (BL-059).
- **Parola değişikliği** (ekran 15, Security): sıfırlama yolu API'nin "mevcut parola" kontrolünü atlayan doğrudan Supabase çağrısı kullanıyor (B, sınırda).
- **Altyapı:** canlıda `RESEND_API_KEY` yok, yani davet ve sıfırlama e-postası gitmiyor (BL-027; 2026-10-06 ölçümü). Landing sayfası kararı bekliyor (BL-034).
- **Yasal sayfalar** (ekran 17): BL-623, BL-635, BL-643, BL-644. Sign in'deki güven bağlantıları bu ekranın (BL-285).

## 7. Bakılamayanlar (raporlardan)
- **Veri yazacağı için görülmedi:**
  - "Check your email", Forgot password'ün "gönderildi" hâli.
  - Reset password ve Account recovery'nin sonuç ekranları.
  - Davet kabulünden sonraki ekranlar: "You're in", "for another address", "Confirm your email first".
  - Owner kurulumunun 3. ve 4. adımları (yerelde en ileri taslak 2. adımda).
  - Çalışan kurulumu gerçek veriyle: sayfa açılışta bile satır yazıyor. Taklit veriyle çekildi.
- **Kişi ya da veri bulunamadı:**
  - Gerçek bekleyen daveti olan hesap ve "Welcome back" hesabı yok; ikisi de taklit cevapla çekildi (dosya adında `mock`).
  - "Almost ready" ekranı; kapanmış workspace ve erişimi kaldırılmış durum sayfaları; revoked, declined ve accepted davet önizlemeleri.
- **Canlı:** Supabase ayarları (e-posta onayı, parola alt sınırı, hız sınırları) ve `RESEND_API_KEY` bugün ölçülmedi.
- **Denenmedi:**
  - D-17'deki ikinci başlatmanın gerçekten hata verdiği an.
  - İki sekmede Create yarışı.
  - Parola sıfırlanınca öteki oturumların kapanıp kapanmadığı.
  - Vercel'in istek kaydının adresi tutup tutmadığı.

## 8. Ekran oturumunun kendi doğrulamaları ve yan etkiler (2026-10-07, `fb9ced47`)
- **Elle doğrulananlar (fazla düzgün sonuca karşı):**
  - `WorkspaceHubPage.tsx:223` "I have an invitation".
  - `ProtectedRoute.tsx:19-20` "An invitation no longer stands between an account and its work".
  - `WorkspaceHubPage.tsx:324` `invitations.length === 0 && !ownDraft`.
  - `InvitationRow.tsx:68-76` beyaz → iki tık.
  - `OwnerOnboardingPage.tsx:1876` "Invite delivery waits…".
  - `grep "Not now|Active invitation"` üretim kodunda 0.
  - SELECT (salt okuma): `workspaces.lifecycle_status='deleted'` → "New workspace | deleted | owner | suspended" (E16-06).
- **Görsel turun yan etkileri (C raporundan):**
  - 6 fixture hesabına parolasız bağlantıyla girildi; `last_sign_in_at` değişti.
  - Beklenmeyen yazma: `GET /v1/context` her açılışta üyeliğin `last_used_at` alanını damgalıyor (`apps/api/src/app.ts:489-495`). Üç üyelikte bu tek alan değişti. Görevin "yalnız SELECT" varsayımı giriş yapılan görsel turda tam tutmuyor; bundan sonraki keşiflerde bilinmeli.
  - İki davet anahtarı yalnız önizleme için yerel DB'den okundu.
  - Geçersiz bir adres için bir OTP isteği 422 ile reddedildi; hesap oluşmadı.
- **Süreçler:** dev sunucuları (web 5632, API 5633) ekran oturumu tarafından başlatıldı ve iş bitince süreç ağaçlarıyla kapatıldı (sahiplik başlatma zamanı ve komut satırıyla doğrulandı). Tarayıcı süreçleri ajan tarafından kapatıldı.

## 9. Mert'in seçimleri ve kapanış durumu
(boş — Mert'le konuşmadan sonra koordinatör yazar)
