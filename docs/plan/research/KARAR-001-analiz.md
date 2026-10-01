# KARAR-001 — Eski cevapların analizi (2026-09-30)

Kaynak: `~/.claude/projects/*newfork*/*.jsonl` içindeki AskUserQuestion çağrıları ve cevapları. 4 madenci ajan 409 satırı (öneriyi seçmediğin, kendi cevabını yazdığın ya da öneri olmayan sorular) tek tek sınıfladı; sentez ajanı ilke çıkardı; 2 şüpheci ajan her ilkeyi bütün veride karşı örnekle sınadı. `idx` numaraları ölçüm betiğinin sıralamasıdır (zaman + soru metni).

Temel oran (etiket varyantları dahil, aynı gün yeniden ölçüldü): 629 önerili sorunun 422'sinde öneri seçildi (%67,1); 48 başka seçenek, 159 serbest cevap. Bugünkü repo %65,9; 2026-09-27 sonrası %70,8.

## Özet

**Veri ne diyor? (4 madenci, 409 satır, 334'ü bugünkü repo)**

Kabul oranı %66,5 ölçülmüştü ama gerçek oran daha yüksek:
- 98 satırda karar sinyali yok.
- Bunların yaklaşık 40'ında öneri aslında tutmuş. Etiket `(önerilen)`, `(Öneri)`, `Onerilen`, `Tavsiye` diye yazıldığı için ölçüm bunları "öneri yok" saydı.
- Yaklaşık 35'i kapatılan ya da reddedilen soru. Çoğu yanlış zamanda soruldu: spec netleşmeden ya da Mert sayfaları kendisi gezmeden önce.
- Yaklaşık 25'i yalnızca durum sorusu.

Kalan ~311 satırda kök nedenler (madenci etiketlerinden kaba tahmin):
1. **Soru tasarımı (~%25).** Sorularda jargon ve BL numarası var. Ekranın yeri ve örnek yok. Seçenekler sonucu değil uygulama yolunu anlatıyor. Görsel kararlar yazıyla soruluyor. Kararlar toplu paketle sunuluyor. "Mevcut pakete ekle", "Claude yapsın", "backlog'a yaz" gibi üçüncü yol eksik.
2. **Dokümanda olmayan bilgi (~%24).** Katılım, davet ve onboarding akışı; ABD'ye özel form kuralları (+1, ASCII); e-posta tekilliği; preferred name modu; MVP sınırı. Bunların neredeyse hiçbiri KARARLAR'da yok.
3. **Claude'un varsayılan eğilimleri (~%22).**
   - Canlı müşteri yokken yedek, shadow, "park et" gibi gereksiz törenler.
   - Ürün işlevinde en ucuz yol ya da "bugünkü gibi kalsın".
   - Genel SaaS kalıpları: Homebase deseni, kurucuya istisna, "admin'e de bildir", mobil öncelik.
   - Ters yönde, görsel işte kapsamı büyütme.
4. **Yazılı ama bakılmamış bilgi (~%12).** "Workspace" terimi, UI-09, UI Lab'in ertelenmesi, ABD pazarı, kodun bugünkü davranışı, ortamın durumu. Mert'in kendi sorusu: "ürün kararlarını okuyor musun hiç" (721).
5. **Gerçekten yeni kararlar (~%8).** Saat dilimi, izin iptali, yetki modeli. Mert bunları seçmeli soruyla değil, sohbetle ya da TBD ile kapatıyor.

**Mert'in modeli tutarlı ve tahmin edilebilir:**
- Ürün işlevinde tam çözüm ister, görsel işte dar kapsam.
- Kod ve veride hız ister; altyapıda, oturumlarda ve kalıcı yetkide temkin.
- Onay hep bir üst kademeye gider, rütbe istisnası yoktur.
- Veri sessizce düşmez, yayınlanmış veri geriye dönük değişmez.
- Kullanıcının niyeti sorulur, zorlanmaz.
- Görmeden karar vermez.
- Kod, vizyonun kanıtı sayılmaz.

**Sonuç:** Daha çok doküman yazmak tek başına yetmez. Üç mekanizma gerekiyor:
1. **Zorunlu soru şablonu.** Bugün ne oluyor; somut örnek; her seçenekte ne olur ve kime görünür; $ maliyet; dayanak ve güven.
2. **Sorudan önce zorunlu arama.** Her soru öncesi KARARLAR ve ilke dosyası taranır. "(Önerilen)" yalnızca bir KARARLAR satırına ya da ilkeye dayanırsa konur.
3. **Her cevabın otomatik kaydı.** Serbest metin cevaplar kural adayı olarak KARARLAR'a taşınır.

Öneri etiketi de tek biçime indirilmeli ki ölçüm doğru çıksın.

## Sınıflama

| Sınıf | Hepsi | Bugünkü repo |
|---|---|---|
| no_signal | 98 | 79 |
| domain_rule_gap | 60 | 57 |
| ui_taste | 49 | 44 |
| scope | 45 | 31 |
| explanation_unclear | 31 | 26 |
| process_pace | 31 | 26 |
| risk_tolerance | 29 | 18 |
| option_set_wrong | 17 | 14 |
| unnecessary_question | 15 | 13 |
| deferred | 14 | 14 |
| other | 14 | 8 |
| cost_money | 6 | 4 |

## Kök nedenler

- **(c) Kötü kurulmuş soru ve seçenekler. Sorularda jargon, iç ad ve BL/branch numarası kullanılıyor. Ekranın yeri, ekran görüntüsü ve somut örnek yok. Seçenekler ürün sonucu yerine uygulama yolunu soruyor (engel mi uyarı mı, kime görünür, belli değil). Görsel kararlar yazıyla soruluyor. Kararlar toplu 'hepsi önerilen gibi' paketiyle geliyor. Seçenek setinde üçüncü yol yok: mevcut pakete ekle, UI'ı kurala uydur, Claude yapsın, backlog'a yaz, orta sert. Çok kategorili sorular tek seçimli soruluyor. Bazı sorular yanlış zamanda soruldu ve dismiss edildi.**
  - Pay: ~%25 (sinyalli ~311 satırın ~78'i: explanation_unclear 31 + option_set_wrong 17 + unnecessary_question'ın bir kısmı + görsel kararın yazıyla sorulması + toplu paketler); ayrıca ~35 dismiss/deny satırının çoğu zamanlama sorunu
  - Çözüm: CLAUDE.md'ye ve rol dosyalarına zorunlu bir AskUserQuestion şablonu yaz. Her soruda şunlar olsun: (1) Bugün ne oluyor: sayfa → düğme, gerekirse ekran görüntüsü. (2) Somut örnek senaryo, isimli kişiyle. (3) Her seçenekte sonuç: ne olur, kime görünür, engel mi uyarı mı, $ maliyet. (4) Dayanak ve güven derecesi. (5) Her soruda 'Claude karar versin', 'Backlog'a yaz', 'Önce sohbette konuşalım' kaçışları. Ek kurallar: ID ve jargon yasak. Görsel kararda önce dinle, sonra gerçek ekranda mockup. Kategori sorularında multiSelect. Toplu paket yok, her ürün kararı ayrı soru. İsteğe bağlı olarak bir AskUserQuestion PreToolUse kontrolü eklenebilir: BL-xxx/jargon tespiti, dayanak etiketi yoksa uyarı. Hook raporu boş geldiği için bunun uygulanabilirliği ayrıca doğrulanmalı.
  - Kanıt idx: 37, 409, 412, 291, 468, 489, 490, 496, 497, 743, 759, 442, 516, 321, 58, 254, 256, 344, 645, 649, 559, 536, 533, 124, 225, 221, 219, 171, 252, 764, 79, 419, 407, 27, 135, 228, 229
- **(a) Dokümanda olmayan ürün bilgisi. Mert'in kafasındaki ayrıntılı model KARARLAR'da yazılı değil:
- Katılım, davet, onboarding ve welcome akışı.
- Workspace üyelik durumları.
- ABD'ye özel girdi kuralları.
- E-posta tekilliği ve legal/preferred name.
- MVP kategori sınırı.
- UI zevk ilkeleri: masaüstü öncelik, sol menü, kısa metin.
Bu yüzden öneri genel SaaS varsayımına ya da 'en az kod' yoluna kayıyor. Bu satırların çoğu cevap verildikten sonra yazılmış; soru sorulduğu anda dokümanda yoktu.**
  - Pay: ~%24 (domain_rule_gap 60'ın ~48'i + yazılı olmayan UI zevki ~15 + MVP/roadmap gerçekleri ~6 + yazılı olmayan süreç tercihleri ~8)
  - Çözüm: (1) KARARLAR'a üç yeni bölüm ekle: 'Katılım ve giriş akışı', 'Form ve girdi kuralları (ABD)', 'MVP sınırı'. Bu analizdeki domain_gaps buraya taşınabilir. (2) docs/plan/MERT-ILKELERI.md dosyasını oluştur. İçinde bu analizdeki 25 ilke olsun; her biri kanıt idx'i, karşı örneği ve son doğrulama tarihiyle. Dosya CLAUDE.md'den @import ile yüklensin. (3) Her AskUserQuestion cevabını (soru, seçenekler, öneri, cevap, serbest metin) repoda bir karar günlüğüne yaz. Bu bir PostToolUse hook'u ya da oturum sonu taramasıyla yapılabilir. Serbest metin ve 'diğer' cevapları 'KARARLAR adayı' olarak işaretle; Mert onaylayınca terfi ettir.
  - Kanıt idx: 180, 184, 190, 215, 216, 217, 218, 220, 277, 278, 283, 185, 187, 426, 471, 509, 385, 341, 53, 122, 126, 154, 157, 292, 300, 303, 214
- **(d) Claude'un varsayılan eğilimleri: aşırı temkin, gereksiz tören, genel SaaS varsayımı.
- Canlı tenant yokken yedek/shadow/park/aşamalı geçiş ve ücretli ultrareview öneriyor.
- Testler geçmişken merge/push için onay istiyor.
- Kendi yapabileceği operasyonu Mert'e bırakıyor.
- Ürün işlevinde en ucuz/kozmetik ya da 'mevcut davranışı koru' yolunu seçiyor.
- Restoran gerçekliği yerine genel SaaS kalıbı uyguluyor: Homebase deseni, kurucuya istisna, owner'a esneklik, 'hiçbir şey kaçmasın' diye admin'e de bildirim, mobil öncelik, Linear/Notion minimalizmi.
- Ters yönde: görsel işte akış ve hata düzeltmesi ekleyerek kapsamı büyütüyor.**
  - Pay: ~%22 (scope ~30 + process_pace ~15 + risk_tolerance ~12 + cost_money ~4 + genel UI varsayımı ~8)
  - Çözüm: CLAUDE.md'ye bir 'Ödünleşim sırası ve anti-varsayılanlar' bölümü yaz:
- Ürün satışta değil, canlı tenant yok; geçiş töreni yapma.
- MVP içindeki ürün işlevinde tam çözüm; kozmetik kestirme yok.
- Görsel işte yalnız görünüm değişir; akış ve hatalar ayrı iş.
- Kod, veri ve yerel git işinde hızlı ve özerk ol. Başka oturuma, makine düzeyine, oturum arşivine ve kalıcı yetkiye dokunma.
- Önce ücretsiz seçenek; her altyapı seçeneğinde $ yaz.
- Restoran gerçekliği genel SaaS kalıbının önündedir: çok lokasyon, müdür hem yönetir hem çalışır, hiyerarşik onay, masaüstü yönetim.
Öneri seçmeden önce tek satırlık öz denetim yap: 'Bu seçeneği en ucuz/en temkinli olduğu için mi işaretliyorum? Hangi ilke bunu destekliyor?'
  - Kanıt idx: 42, 222, 250, 209, 603, 351, 630, 666, 129, 765, 777, 153, 101, 103, 41, 81, 385, 538, 66, 257, 300, 604, 540, 488, 122, 673, 674, 669, 677, 752, 206, 30, 34, 100
- **(b) Bilgi yazılı ama öneri verilirken bakılmamış. Atlanan kaynaklar:
- KARARLAR'daki terim ve kurallar: workspace/team, UI-09 aksiyon yeşil, UI Lab'in ertelenmesi, Line Up'ın sadeleşecek olması.
- CLAUDE.md'deki ABD pazarı.
- Önceki cevaplar.
- Kodun bugünkü davranışı.
- Ortamın durumu: Docker açık mı, RC açık mı, restart gerekli mi.
Ayrıca kod vizyonun kanıtı sayılıyor. Dokümanlar da çelişkili ve bayat (nf-arayuz:22, KK-51/57, MVP-PLAN, KOORDINATOR:5'teki ters dayanak sırası). Bu durum yanlış kaynağın okunmasına yol açıyor.**
  - Pay: ~%12 (~35 satır)
  - Çözüm: (1) Sorudan önce arama zorunlu olsun. Soru metnindeki 3-5 anahtar kelimeyle KARARLAR, MERT-ILKELERI ve KOORDINATOR taranır. Her '(Önerilen)' seçeneğinin açıklamasına 'Dayanak: KARARLAR:NN', 'P-xx' ya da 'emsal yok' ve güven derecesi yazılır. (2) Dayanak sırası 'KARARLAR (Mert) > Mert ilkeleri > ROADMAP > SaaS mantığı' olur; KOORDINATOR:5 buna göre düzeltilir. (3) Bayat ve çelişkili satırlar temizlenir. KK'ler 'kullanıcı kararları' başlığından ayrı bir bölüme taşınır. (4) Kod ya da ortam hakkında bir iddia ölçülmeden soru yazılmaz. Soruya 'Bugün kod şöyle yapıyor (dosya:satır)' satırı eklenir.
  - Kanıt idx: 288, 451, 260, 695, 268, 348, 721, 149, 185, 189, 274, 282, 712, 360, 301, 553, 556, 406, 290, 347, 349, 285, 286
- **(e) Gerçekten emsali olmayan yeni kararlar. Örnekler: saat dilimi davranışı, onaylı iznin iptalini kimin onaylayacağı, yetki kapsam modeli, Line Up'ın geleceği, terminoloji, IA (bilgi mimarisi), compliance entegrasyonu. Mert bu konuları seçmeli soruyla kapatmıyor. Ya sohbette konuşuyor, ya TBD bırakıyor, ya da 'sektörü araştır, sen gerekçeli öner' diyor.**
  - Pay: ~%8 (~25 satır)
  - Çözüm: Emsal yoksa önce rakip araştırması yap (7shifts, Deputy, When I Work, Homebase). Bulguyu tablo halinde göster, ardından gerekçeli ve güveni açıkça düşük işaretli bir öneri sun. Temel modelleri (yetki, saat dilimi, izin iptali) seçmeli soruya indirgeme; 'sohbette konuşalım' ya da TBD seçeneğini öne koy. Görsel/zevk sorularında '(Önerilen)' etiketi koyma, ya da 'düşük güven' diye yaz. Verilen karar ilke dosyasına yeni emsal olarak eklensin.
  - Kanıt idx: 550, 566, 583, 491, 358, 367, 368, 125, 641, 339, 146, 16, 17, 46, 233
- **(f) Ölçüm hatası (ek). Öneri etiketi tutarsız yazıldığı için regex isabetli önerileri yakalamıyor: '(önerilen)', '(Öneri)', '(Onerilen)', '(B′, Önerilen)', '(Tavsiye)'. Dismiss, deny ve durum soruları da karar sorularıyla aynı havuzda sayılıyor. Bu yüzden %66,5 gerçek isabeti olduğundan düşük gösteriyor ve alan bazında nerede ıskalandığını gizliyor.**
  - Pay: no_signal 98 satırın ~40'ı aslında isabetli öneri; ~35 dismiss/deny; ~25 durum sorusu
  - Çözüm: Tek ve sabit bir etiket kullan: '(Önerilen)'. Ölçümde büyük/küçük harf ve aksan farkını yok say. Soruları türüne göre ayrı say: karar, durum/teyit, dismiss. Kabul oranını alan bazında izle: onboarding/join, ui, schedule, ops, process. Her hafta en düşük alanın satırlarını ilke dosyasına geri besle.
  - Kanıt idx: 2, 3, 4, 78, 84, 85, 86, 92, 93, 138, 141, 181, 272, 298, 299, 306, 355, 606

## Aday ilkeler ve şüpheci kararı

### P01 (process/ops; güven high; yazılı: no; şüpheci: holds_with_condition)

Ürün henüz satışta değil, gerçek tenant ya da kullanıcı yok. Shadow, aşamalı geçiş, 'park et', geriye uyumluluk ya da test verisini yedekleme gibi seremoniler önerilmez; pazara en sağlam çıkacak doğrudan çözüm seçilir.

- Koşul: Yalnız kod ve migration seremonileri için geçerli: shadow, cutover, geriye uyumluluk, park yok (42, 222). Canlı (hosted) veritabanına gönderimde 'önce yedek' Mert'in kabul ettiği varsayılandır. Test verisini yedeklemede tutarsız: 603'te 'yedekleme bile' dedi, aynı türden veride 395 ve 766'da yedekli silmeyi seçti.
- Not: Tenant yok diye seremoni reddi kod tarafında net. Yedek ise canlı veritabanı için istenen bir adım (586). Aynı FX verisinde 395'te yedekli silmeyi kabul etti, 603'te reddetti; tek örnekle genelleme yapılmamalı.
- Kanıt idx: 42, 222, 250, 209, 603, 351
- Karşı örnek idx: 395, 766, 586, 476, 269

### P02 (scope/product; güven high; yazılı: no; şüpheci: holds_with_condition)

MVP kapsamındaki ürün işlevinde kozmetik, en ucuz ya da 'bugünkü davranışı koru' kestirmesi önerilmez; gerçek ve tam çözüm seçilir. Eksik yetenek kurulur, değerli ama gizli özellik görünür yapılır, kural konunca kod ve test aynı turda uyumlanır, yetki tutarsızlığı backlog'a atılmaz.

- Koşul: Yalnız o an yapılan işin çekirdek davranışı için geçerli. Yolda bulunan yan bulgular ve ikincil işler için Mert backlog'u ya da dar v1'i kendisi seçiyor ya da kabul ediyor.
- Not: 280'de önerilen engeli reddedip 'Bugünkü gibi kalsın' dedi. 302 ve 39'da dar seçeneği seçti. 338, 339 ve 752'de 'Kenara koy' ya da 'backlog' dedi. 508'de eksik yeteneği (müdür notu) backlog'a attı. Yani 'her zaman tam çözüm' doğru değil.
- Kanıt idx: 101, 103, 41, 385, 341, 66, 538, 257, 133
- Karşı örnek idx: 39, 280, 302, 338, 339, 508, 752

### P03 (ui/scope; güven high; yazılı: no; şüpheci: holds_with_condition)

Görsel yenilemede yalnız görünüm değişir. Akış, adım sayısı, hata düzeltmeleri ve Mert'in saymadığı öğeler kapsama eklenmez. Mert'in verdiği liste kesin kapsamdır; yolda bulunan sorunlar backlog'a yazılır.

- Koşul: Yalnız Mert işi açıkça 'görünüm' turu olarak çerçevelediğinde geçerli (09-29 Schedule pencereleri: 669, 677, 752). Akış ve kurulum yeniden tasarımlarında Mert mantık ve bilgi mimarisini kapsama kendisi ekliyor.
- Not: 257'de 'yalnız UI' seçeneği vardı, Mert tüm mantık değişikliklerini ve fazlasını ekledi. 287'de tam envanter ve IA yeniden düşünmeyi istedi. 747'de listesi dışındaki metinleri de kaldırttı.
- Kanıt idx: 669, 677, 752, 206, 30, 685
- Karşı örnek idx: 257, 287, 702, 747

### P04 (ui/process; güven high; yazılı: partial; şüpheci: holds_with_condition)

Görsel ve yerleşim kararları yazıyla sorulmaz. Önce Mert'in sayfa sayfa sorun turu ve istişaresi dinlenir. Sonra gerçek ekranda 2-3 varyant gösterilir; tutmazsa birbirinden gerçekten farklı çok sayıda varyant, güncel ve önceki hâliyle yan yana sunulur. Görsel varyantlara '(Önerilen)' etiketi konmaz ya da 'düşük güven' yazılır.

- Koşul: Yeni bir görsel bileşen ya da yerleşim tasarlanıyorsa mockup ve çok varyant gerekli (481, 501, 645, 649). Renk, token, kontrast ve kenar gibi tutarlılık ayarları yazıyla ve '(Önerilen)' ile sorulabiliyor. Gösterilen varyantlarda '(Önerilen)' Mert tarafından kabul edildi.
- Not: 'Görsele (Önerilen) konmaz' alt iddiası çürüdü: 565, 769 ve 60'ta önerilen varyant seçildi. 692'de mockup'sız 'Doğrudan uygula'yı kabul etti. Zorunlu 'önce sorun turu' sırası da 694 ve 697'de atlandı.
- Kanıt idx: 58, 254, 256, 344, 420, 668, 481, 501, 645, 649, 228, 231
- Karşı örnek idx: 461, 466, 565, 769, 60, 692, 589, 592, 694

### P05 (process/questions; güven high; yazılı: no; şüpheci: holds_with_condition)

Her karar sorusu sonuç diliyle sorulur. Önce bugün ne olduğu (sayfa → düğme, ekran görüntüsü), sonra somut örnek senaryo verilir. Her seçenekte ne olacağı, kime görüneceği ve engel mi uyarı mı olduğu yazılır. BL numarası, branch adı, jargon ve iç ad kullanılmaz.

- Koşul: Ürün davranışı (vardiya, izin, onay kuralları) sorularında senaryo, koordinat ve sonuç dili şart. Operasyon, git ve altyapı sorularında BL/task kimlikli kısa sorular sorunsuz cevaplandı. Bazı büyük konular hiç çoktan seçmeli sorulmamalı, sohbette tartışılmalı (536, 566, 583).
- Not: 442, 468, 475, 479, 490, 496, 497, 516 ve 759 güçlü destek veriyor. Jargonlu operasyon soruları ise itirazsız cevaplandı, yani kural her soru türü için mutlak değil.
- Kanıt idx: 37, 409, 412, 291, 468, 489, 490, 496, 497, 743, 759, 442, 516
- Karşı örnek idx: 160, 164, 405, 744, 749

### P06 (cost/ops; güven high; yazılı: no; şüpheci: holds_with_condition)

Altyapı ve araç seçeneklerinde aylık ya da tek seferlik dolar maliyeti yazılır. Ücretsiz ve anahtarsız yol önce gelir; ücretsiz katmanlar birleştirilebiliyorsa ikisi birden kullanılır. Lansman öncesi yeni ücretli hesap ya da servis açılmaz; güvenlik incelemesi temizse ücretli ek inceleme varsayılan değildir.

- Koşul: Ücretsiz yol önce gelir, dolar maliyeti yazılır (34, 100, 161, 263, 400). Ücretli ek inceleme (ultrareview) kararı tutarsız: ücretsiz hak hatırlatıldığında (607) ve yetki çekirdeği gibi riskli işte (762) istendi, diğerlerinde reddedildi (630, 666).
- Not: 607'de güvenlik incelemesi temizken önerilen 'Hayır'ı reddedip ultrareview istedi (3 ücretsiz hak vardı). 48'de ücretsiz-yalnız yol yerine hibrit yolu seçti (rebuild öncesi).
- Kanıt idx: 400, 100, 34, 161, 263, 630, 666
- Karşı örnek idx: 607, 762, 48

### P07 (roles/permissions; güven high; yazılı: yes; şüpheci: holds_with_condition)

Talepler her zaman bir üst kademeye gider; eş rütbe birbirini onaylamaz, kimse kendi talebini onaylayamaz. Manager yalnız kendi lokasyonunda karar verir, tamamen işten çıkarma admin ya da owner'ındır. Bildirim yalnız karar verecek ya da işi doğrudan etkilenen kişiye gider, admin gürültüsü yoktur. Bildirimi alan kişi bildirimin konusunu açabilmelidir.

- Koşul: 'Talep üste gider' izin, takas ve devir talepleri için geçerli (365, 786). İstisnalar var: yayın anındaki müsaitlik uyarısını rütbeden bağımsız olarak yayınlayan onaylar (500). Aynı lokasyondaki eş müdür, karar verici olmasa da bildirimi alır ve okur (447, 450). Owner kendi iznini onaysız kaydeder (364).
- Not: Bildirim yalnız karar verene gitmiyor; eş müdür bilgi bildirimi alıyor. 337'de manager'ın tam işten çıkarmasına izin verildi, ama aynı gün 366 ile admin/owner'a çevrildi (KARARLAR:55 son hâli).
- Kanıt idx: 365, 363, 366, 488, 380, 450, 486
- Karşı örnek idx: 500, 447, 450, 364, 337

### P08 (roles/permissions; güven medium; yazılı: yes; şüpheci: holds)

Ayrıcalık geçmiş statüden değil, bugünkü rolden gelir. Kurucuya ya da owner'a 'saygı' istisnası yapılmaz: rol düşünce muafiyet de düşer, owner da bir işe yazılmadan önce o işe atanır. İstisna yalnız veri modelinde açıkça tanımlıysa geçerlidir (Management/Owner sistem kaydı, owner'ın her lokasyonda çalışabilmesi).

- Not: Son kararlar (540, 546, 604) destekliyor. Bugünkü role bağlı owner ayrıcalıkları (564, 575, 448) ilkeyle uyumlu. 530'da 'owner atanmadan her pozisyonda çalışır' dedi, ama aynı gün 540 ve 546 ile tersine çevrildi.
- Kanıt idx: 604, 540, 530, 546, 535
- Karşı örnek idx: 530

### P09 (schedule/data; güven high; yazılı: partial; şüpheci: holds)

Sistem kullanıcının verisini sessizce düşürmez ya da değiştirmez; düşürmesi gerekiyorsa kullanıcıyı uyarır. Yayınlanmış veri geriye dönük değişmez; 'exclude' gibi işaretler yalnız yeni açılan taslağı etkiler. Bulunan sessiz davranış en azından backlog'a yazılır.

- Not: 371, 472, 474, 507, 509, 545, 563, 612, 740, 756 ve 787 güçlü destek veriyor. Zayıf istisnalar: 280'de kapanan işe sessiz davet kabulünü 'Bugünkü gibi' bıraktı (veri düşürme değil). 375'te çakışan kabul otomatik düşüyor, uyarı belirtilmemiş.
- Kanıt idx: 509, 545, 546, 325, 375
- Karşı örnek idx: 280, 375

### P10 (onboarding/join; güven high; yazılı: no; şüpheci: holds_with_condition)

Kullanıcının niyeti sorulur, kullanıcı zorlanmaz; ilerlemesi de kaybolmaz. Kurallar: 
- Bekleyen davet her girişte ilk ekranda gösterilir.
- Tek workspace'i olan doğrudan rolüne göre ilgili ekrana iner.
- Yarım kalan kurulum kaydedilir; kişi kaldığı yerden sürdürebilir ya da silebilir.
- Bir kez karşılanmış kişi sonradan yeniden 'yeni' sayılmaz.

- Koşul: Dört alt kural tutuyor (184, 215, 216, 217, 220, 278). Ancak bekleyen davet varken 'kendi işletmeni kur' serbest bir niyet seçimi değil: 180 ve 219'da engellendi ya da gizlendi. İstisna: kapatılmış işletmenin sahibi (276).
- Not: 'Kullanıcı zorlanmaz' başlığıyla çelişiyor. Create düğmesi kuralı 216, 218 ve 219'da aynı gün içinde değişti; kural kararsız, karar vermeden önce yeniden sorulmalı.
- Kanıt idx: 184, 215, 216, 217, 220, 277, 278
- Karşı örnek idx: 180, 219, 218

### P11 (employees/forms; güven high; yazılı: partial; şüpheci: holds)

Doğru veri, şık ama tahmine dayalı UX'ten önce gelir. Zorunlu alanlar tahminle ya da kopyayla doldurulmaz: legal name zorunludur ve kişi kendisi yazar. Yapısal veri ayrı alanlarda tutulur. Çakışma, yazıldığı anda uyarılır. Kullanıcının yazdığı ve herkese görünen içerik (preferred name) işverenin denetiminden geçebilir.

- Not: 36, 283, 426, 711, 712 ve 303 tutarlı. Tek karşı örnek 97: şehir adıyla tahmine dayalı yetki alanı gösterimini kabul etti. Bu rebuild öncesi compliance dönemine ait.
- Kanıt idx: 36, 426, 711, 712, 283, 300, 303, 264
- Karşı örnek idx: 97

### P12 (product/market; güven high; yazılı: no; şüpheci: holds_with_condition)

Pazar yalnız ABD, dil İngilizce. Bu gerçek her kararda varsayılan olarak uygulanır ve yeniden sorulmaz:
- Girdiler ASCII; Türkçe ve aksanlı harf yok, tire serbest.
- Telefon yalnız rakam, +1 sabit, ülke seçici yok, yazarken (xxx) xxx-xxxx maskesi.

- Koşul: ABD ve İngilizce pazarı sağlam (149, ayrıca 25 ve 59). Telefon kuralı tek ama açık bir örneğe dayanıyor (187). Karakter kuralı yalnız Türkçe harf yasağı ve serbest tire (185). Tüm aksanlı harfleri (é, ñ) yasaklayan ASCII genellemesi hiçbir cevapta yok.
- Not: Karşı örnek bulunmadı. Ancak 'aksanlı harf yok' çıkarımı desteksiz; ABD'deki İspanyolca isimler (José) için Mert'e sorulmalı. Telefon ve karakter alt kuralları tek örnekli.
- Kanıt idx: 149, 185, 187

### P13 (scope/mvp; güven high; yazılı: partial; şüpheci: holds_with_condition)

MVP sınırı madde madde değil, kategori düzeyinde çizilir. Compliance, payroll, time tracking, break ve Stripe billing MVP sonrasıdır. Sonradan sıfırdan tasarlanacak modüllere (Line Up, bildirim sistemi) bugün yatırım yapılmaz; bu modüller dondurulmaz, silinir ve ayrı bir plana alınır.

- Koşul: Kategori sınırı (compliance, payroll, time tracking, break, Stripe MVP sonrası) ve Line Up'ın silinmesi tutuyor (154, 292, 384, 411; KARARLAR:120). Bildirim platformu silinmedi; kapsam dışı sayılsa da yeni bildirim davranışları kurulmaya devam ediyor.
- Not: 'Bildirime bugün yatırım yapılmaz, silinir' çürüdü: 473, 784 ve 798'de yeni bildirim ve hatırlatma kuruldu. 163'te kiosk ve zaman takibi önce 'gizle, kod kalsın' dendi, sonra silindi (356).
- Kanıt idx: 154, 157, 292, 380, 384, 348, 146
- Karşı örnek idx: 473, 640, 784, 798, 163

### P14 (architecture/review; güven high; yazılı: no; şüpheci: holds_with_condition)

Mimari temizlikte, denetimde ve UI tutarlılığında kapsam en geniş tutulur: tüm repo, kullanıcı yolculuğunun bütün ekran ailesi, kardeş akış. Mevcut kod ve yapı vizyonun kanıtı değildir; kod vizyonla çelişirse kod yanlış sayılır ve Mert'e sorulur. Yapı enterprise multi-tenant kalıplarına göre baştan düşünülebilir.

- Koşul: Geniş kapsam yalnız Mert açıkça bir temizlik, denetim ya da yeniden tasarım programı başlattığında geçerlidir. Günlük iş içindeki UI/ortak bileşen düzeltmelerinde kapsam dar tutulur, yeni bulgular kayda alınır. 'Kod vizyonun kanıtı değildir' kısmı ise koşulsuz geçerlidir.
- Not: Geniş kapsam yalnız program tipi işlerde görülüyor (356, 287, 226, 608). Sıradan UI tutarlılığı ve denetim işlerinde Mert dar seçti: 678 'Yalnız bu 4 pencere', 186 'Yalnız Locations', 695 'başka sayfalara yansımaz', 90 'Sadece triyaj'. 347 ve 422'de kapsamı kendisi daraltmak istiyor.
- Kanıt idx: 356, 608, 69, 226, 232, 237, 285, 287, 347, 349
- Karşı örnek idx: 678, 186, 695, 620, 422, 90, 262, 435

### P15 (process/ops; güven high; yazılı: partial; şüpheci: holds_with_condition)

Kod, veri ve yerel git işlerinde Claude hızlı ve özerktir:
- Testler geçtiyse merge ve push yapar.
- Kendi dosyalarını açık yol vererek commit eder.
- Veri yazmayan gezinmeyi kendisi yapar.
- Kendi yapabileceği operasyonu Mert'e devretmez.
Ama şunlara dokunmaz: başka oturumun bitmemiş işi, makine düzeyindeki yeniden başlatmalar (WSL, Docker), oturum arşivi, kalıcı yetki. Bu konularda izin tek seferliktir ve yalnız geri alınabilir silme yapılır.

- Koşul: Kod ve git işlerinde özerklik geçerli. Ancak 'dokunmaz' listesindeki konular yasak değildir; her biri tek tek onaya bağlıdır. Makine yeniden başlatma, oturum arşivi ve başka oturumun dosyaları bu kapsamdadır. Test verisi ve dal silmede geri dönüşsüz silme de onayla yapılabilir.
- Not: Mert, 554'te Docker'ı Claude'un yeniden başlatmasını, 629'da yerel Supabase'in yeniden başlatılmasını onayladı. 99'da başka oturumun dosyalarını commit ettirdi, 603'te 'direk sil yedekleme bile' dedi, 129'da kalıcı merge+push yetkisi verdi. Arşivler (527, 570) tek tek onayla yapılıyor.
- Kanıt idx: 129, 765, 777, 153, 244, 248, 28, 64, 65, 105, 555, 659, 686, 617, 392, 688
- Karşı örnek idx: 554, 629, 106, 99, 603, 209, 736, 129

### P16 (process/rules; güven medium; yazılı: partial; şüpheci: holds_with_condition)

Kural sertliğinde varsayılan 'orta sert'tir: kural işi durdurmaz ama uyarır ve izler.
- Yeni lint ya da denetim önce uyarı modunda gelir.
- Bypass edilirse ayrıntılı log tutulur ve geri dönüş planı hazırdır.
- Yöneticiye uyarı gösterilir, iptal ya da üzerine yazma kararı ona bırakılır.
Yalnız sert/yumuşak ikilisi sunulmaz; üçüncü kademe de seçenek olarak eklenir.

- Koşul: 'Orta sert' varsayılanı yalnız süreç ve geliştirici araç kurallarında (hook, lint, CI) geçerlidir. Ürün iş kurallarında Mert sık sık kesin engel seçiyor. Üçüncü kademe her zaman eklenmez.
- Not: 764 ve 267 süreç tarafını destekliyor. Ürün kurallarında Mert sert engel seçti: 180, 470, 512, 283. Üç kademe 416'da istendi, ama 373'te iki seçenekliyi seçti, 493'te ayar satırını tamamen kaldırttı.
- Kanıt idx: 764, 763, 267, 416, 178
- Karşı örnek idx: 180, 470, 512, 283, 560, 577, 373, 493

### P17 (process/workflow; güven low; yazılı: partial; şüpheci: holds_with_condition)

Varsayılan tek hattır. Başlanan iş bitene kadar sürer, yolda bulunanlar backlog'a yazılır, fazlar Mert'in takip edebileceği sırayla yürür. 'Hızlanmak', tek işi parçalara bölüp birden çok oturumda yürütmektir. Bağımsız ve küçük işlerde Mert yine de paralel başlatmayı seçebilir; bu yüzden paralelliği Mert'e seçenek olarak sun, kendin karar verme.

- Koşul: Backlog yalnız iş dışı ya da büyük bulgular içindir. Aynı işle doğrudan ilgili küçük bulgular ve güvenlik/görsel hatalar mevcut işe eklenir. Paralellik 'tek hat'tan sonra da Mert onayıyla seçilebiliyor.
- Not: Tek hat 622 ve 156 ile destekleniyor. Ancak yolda bulunan küçük sorunlarda Mert çoğu kez 'Bu işe ekle/düzelt' seçti (449, 507, 623, 631, 652; 538 'Şimdi yapılsın'). Paralel işi önerildiğinde kabul etti (660, 767). Bu, kararın Mert'e bırakılması kuralıyla uyumlu.
- Kanıt idx: 622, 618, 156, 752, 635, 647, 456, 413
- Karşı örnek idx: 449, 507, 623, 631, 652, 538

### P18 (process/questions; güven high; yazılı: no; şüpheci: holds_with_condition)

Ürün kararları tek tek sorulur ve her biri açıklanır. 'Hepsi önerilen gibi' paketi ya da açıklamasız toplu evet/hayır listesi yoktur. Temel modeller (yetki kapsamı, saat dilimi, izin iptali) seçmeli soruyla kapatılmaz; önce chat'te başlık başlık konuşulur ya da TBD bırakılır.

- Koşul: Toplu 'hepsi önerilen' paketi yasağı 2026-09-27'den (536, 559) sonra geçerlidir. Chat'e ya da TBD'ye taşınan, yalnız en üst düzey temel model seçimidir (kapsam modeli M1–M4, çok saat dilimli hafta, izin iptali onayı). Bu modelin içindeki alt sorular seçmeli sorulabilir.
- Not: Mert 393'te 'Hepsi A (Önerilen)' paketini, 402'de toplu ops onayını kabul etti; ikisi de 27 Eylül öncesi. Saat dilimi (549), yönetici kapsamı (370) ve revoke (789) seçmeli soruyla kapandı. Sohbete taşınanlar yalnız üst modeller oldu: 358, 566, 583.
- Kanıt idx: 559, 536, 533, 358, 491, 566, 583, 550
- Karşı örnek idx: 393, 402, 549, 370, 789

### P19 (process/questions; güven high; yazılı: no; şüpheci: holds_with_condition)

Bazı kararlar Mert'e sorulmaz. Saf teknik iç kararlarda (şema, merge sırası, test dosyası hizalaması, kontrast) Claude, uygulamanın çok büyüyeceğini varsayıp en az bakım isteyen yolu kendisi seçer. Sektörde emsali olan UX ve terminoloji kararlarında 7shifts, Deputy, When I Work ve Homebase'i araştırır, gerekçesiyle karar verir. İstisna: test mi kod mu doğru belirsizse ürün kararıdır ve tek tek sorulur.

- Koşul: Claude'un kendi başına karar vermesi yalnız saf teknik iç kararlarda geçerlidir (şema, bakım maliyeti, kontrast, merge sırası). Görünür UX kararlarında sektör emsali araştırılır ama varyantlar gösterilir, seçimi Mert yapar.
- Not: Teknik delege etme 38, 591, 285, 286 ile destekleniyor. Ama 52'de Mert, 7shifts/Deputy standardına dayanan öneriyi reddetti. 668'de 'her birinden birer tane göster' dedi. 187'de telefon formatını kendisi tanımladı.
- Kanıt idx: 38, 205, 338, 591, 16, 17, 233, 368, 285, 320
- Karşı örnek idx: 52, 668, 187, 81

### P20 (ui; güven medium; yazılı: partial; şüpheci: holds_with_condition)

UI zevki:
- Sade ve kompakt: alan altı açıklama yok, gereksiz bölüm ve bağlam etiketi yok, pencerede tek Save noktası.
- Global bileşen diline sadakat; aktif öğenin düğmesi de aynı renkte ve tıklanabilir kalır.
- Türetilmiş öğe (ghost) ayrı bir görsel dil almaz; aynı bileşenin taralı ve soluk hâlidir.
- Belirsizlikte rakip vardiya SaaS'larının tanıdık kalıbı seçilir.
- Masaüstü önceliklidir; gezinme sol menüde toplanır.

- Koşul: Alan altındaki kısa açıklamalar tamamen yasak değildir. Tek cümle, tek ana mesaj taşıyan ve geliştirici notu gibi yazılmamış metin kabul edilir. 'Sol menü' kuralı masaüstü içindir; telefonda alt çubuk kullanılır. Ortak bileşen değişikliği diğer sayfalara kendiliğinden yayılmaz.
- Not: Sade, tek Save ve ghost dili güçlü biçimde destekleniyor (703, 729, 503, 506, 747, 710). Ancak açıklama metni 474, 465 ve 517'de tutuldu. Mobil navigasyonda 565'te alt çubuk seçildi. Rakip kalıbı 673–676'da seçildi, 52'de reddedildi.
- Kanıt idx: 703, 747, 710, 729, 695, 207, 503, 494, 673, 674, 122, 126
- Karşı örnek idx: 474, 465, 517, 767, 565, 52, 186

### P21 (ui/copy; güven high; yazılı: partial; şüpheci: holds)

Kullanıcıya görünen metin:
- Kısa ve tek ana mesajlı olur; geliştirici ya da sistem notu gibi yazılmaz.
- Çalışana vardiyayı opsiyonel gibi hissettiren yumuşatma kullanılmaz.
- Erişim yönlendirmesinde kişi adı yerine rol yazılır ('Admin').
- Sistem terimi 'workspace / team'dir.

- Not: Karşı örnek bulunamadı. Destekleyen kayıtlar: 514, 517, 474, 747 (kısa ve geliştirici notu olmayan metin); 471 ('Admin'); 288, 451, 455 (workspace/team). Rol adı ve 'opsiyonel hissettirme' alt maddelerinin her biri tek örneğe dayanıyor (471, 514).
- Kanıt idx: 514, 515, 517, 474, 471, 288, 451

### P22 (process/docs; güven high; yazılı: partial; şüpheci: holds)

Mert'in en güncel açık kararı, sonradan yazılmış genel kuralın ve koordinatör kararının üstündedir. Çelişki ertelenmez: açık karar uygulanır, kural metni güncellenir. Ertelenmiş araçlar ve süreçler (UI Lab) seçeneklere konmaz. Eski kilitli bir karar bugünkü konuşmayla çelişirse eskisi dayatılmaz, sorulur.

- Not: Destekleyenler: 451/455 (karar kuraldan üstün, çelişki ertelenmedi), 180 (kilitli eski karar yerine güncel tercih), 359 (eski karar soruldu, değişti), 268 (UI Lab ertelendi). 605'te yeni bir olgu çıkınca önceki karar (598) uygulanmadı, yeniden soruldu. Bu, ilkenin son cümlesiyle uyumlu; 'Ertelenmiş araç' maddesi tek örneğe (268) dayanıyor.
- Kanıt idx: 260, 451, 268, 288, 695, 180, 189

### P23 (schedule; güven high; yazılı: partial; şüpheci: holds_with_condition)

Bir kural önerilirken uç durumlar baştan kapsanır: yayınlanmamış hafta, vardiyasız gün, lokasyonsuz kişi, çok lokasyonlu çalışan. Manager'ın göremediği bilgi yüzünden çakışma yaratması engellenir; çalışanın başka lokasyondaki vardiyası ızgarada ghost olarak görünür.

- Koşul: Uç durumlar, üründe gerçekten oluşabilecekse baştan kapsanır. Bugün oluşamayan durumlar (0 kayıt) ya da mevcut tenant/eski veri durumları kodlanmaz, kural olarak kilitlenir. Çok saat dilimli lokasyon gibi büyük modeller TBD'ye gider.
- Not: Destekleyenler: 52 ve 360 (ghost ile çakışmayı önleme), 361 (yayınlanmamış hafta sorusunu Mert kendisi sordu), 531 ve 661 (lokasyonsuz kişi). Ancak 605'te imkânsız uç durum için 'kural olarak kilitle, kod yazma' seçildi. 42'de 'mevcut tenantları düşünme' dendi.
- Kanıt idx: 361, 360, 52, 661, 531, 375
- Karşı örnek idx: 605, 42, 566

### P24 (schedule/swaps; güven medium; yazılı: yes; şüpheci: holds_with_condition)

Çalışan kendi rızasıyla kendi kısıtlarını ezebilir (müsaitlik, onaylı izin). Sistemin ve işletmenin kısıtlarını ezemez: lokasyon ve iş uygunluğu, manager onayı. Dinlenme ve yol kuralı ihlalleri onay ekranında açıkça gösterilir. Bekleyen kabul yalnız gerçek çakışmada düşer.

- Koşul: Onaylı izni ezme yalnız takas ve bırakılmış vardiya pickup'ında geçerlidir. Onaylı izni olan kişi cover talebi listesinde hiç çıkmaz. Müsaitlik (izin değil) ise cover'da 'müsait değil' etiketiyle ezilebilir.
- Not: Ana fikir destekleniyor: 379 (izin kısalır), 381 (cover'da etiketle görünür), 376, 382 ve 375 (gerçek çakışmada kabul düşer). Ancak 378'de Mert, onaylı izinli kişinin cover listesinde hiç çıkmamasını istedi; bu, 'her işlemde ezebilir' genellemesini sınırlıyor.
- Kanıt idx: 378, 375, 382
- Karşı örnek idx: 378

### P25 (time-off/onboarding; güven medium; yazılı: partial; şüpheci: holds_with_condition)

Verilen karar geri alınabilir olmalıdır: revoke kalır, yarım taslak silinebilir, asılı teklif süresi dolunca kendiliğinden düşer. Kısmi onay yoktur; red gerekçesine alternatif yazılır. Geri dönüşsüz bir eylemin sonucu açıkça yazılır.

- Koşul: Geri alınabilirlik izin ve onay kararlarında (revoke, discard, süre dolunca düşme) geçerlidir. Sonucu açıkça yazılırsa ve alternatif yol varsa (yeniden davet gibi) Mert geri dönüşsüz eylemi de kabul ediyor.
- Not: Kısmi onay yasağı 783 ve 797 ile, revoke ve discard 783, 220 ve 279 ile destekleniyor. Ancak 284'te Mert 'geri dönülebilir Decline' yerine geri alınamaz Decline'ı seçti. 463'te notun gizlenmesi yerine silinmesini, 281'de otomatik silmeyi seçti. 788'de revoke sonrası vardiya geri dönmüyor.
- Kanıt idx: 780, 284, 220, 279
- Karşı örnek idx: 284, 463, 281, 788

## KARARLAR'da olmayan kural adayları

1. (forms/locations) ABD'ye özel girdi kuralları:
- Metin alanlarında Türkçe ve aksanlı harf yasak, tire serbest.
- Telefon alanına yalnız rakam girilir; +1 sabittir, ülke seçici ve uluslararası numara yoktur.
- Yazarken (xxx) xxx-xxxx maskesi uygulanır; mevcut E.164 şeması kullanılır. — idx 185, 187, 149
2. (employees/invites) Bir organizasyonda e-posta tekildir. Aynı e-postayla davetli ya da davetsiz ikinci bir kayıt açılamaz. Çakışma kaydetme anında değil, çekmeceye yazıldığı anda uyarılır. — idx 283
3. (onboarding/join) Giriş sonrası yönlendirme:
- Bekleyen yeni davet, her girişte ilk ekranda 'Active invitation found' olarak gösterilir.
- 'Not now' denirse: tek workspace varsa oraya, birden fazla varsa davetin de listelendiği seçim ekranına gidilir.
- Tek organizasyonu olan kullanıcı doğrudan rolüne göre ilgili ekrana iner. — idx 184, 217
4. (onboarding/join) Hiç workspace'i olmayan ve bekleyen daveti olan kişi önce daveti çözer, kabul ya da ret (sert engel). Daha önce işletme kurmuş kişi bekleyen davet yüzünden durdurulmaz. — idx 180, 276
5. (onboarding/join) 'Create your own business' seçeneğinin görünürlüğü: bekleyen davet varken davet ekranında gösterilmez; 2+ açık iş varken (davet ya da yarım onboarding) gizlenir. İki cevap arasında küçük bir fark var; netleştirilmeli. — idx 218, 219
6. (onboarding/join) Owner olmadığı bir workspace'te aktif üyeliği bulunan hesap kendi işletmesini açamaz; bunun için ayrı hesap gerekir. — idx 189
7. (onboarding/join) Welcome back: employer kurulumunu yarıda bırakan kullanıcı zorla onboarding'e sokulmaz. Ekran davetleri ve yarım işi listeler, 'Create' ve 'davet bekliyorum' seçeneklerini sunup niyetini sorar. Bir kez karşılanmış kişi (organizasyonu kapatsa, devretse ya da çıkarılsa da) yeniden 'yeni' sayılmaz. — idx 215, 216
8. (onboarding) Onboarding'den çıkmak vazgeçmek değildir: ilerleme kaydedilir, kişi kaldığı yerden devam eder. Yarım taslakta 'Continue setup' ve 'Discard' bulunur. Kaybedilecek kişi ya da veri yoksa 'tamamen durdur/sil' için parola istenmez; bu eylem 'start over'dan ayrıdır. — idx 220, 277, 278
9. (onboarding) 'Create' doğrudan onboarding'in ilk adımını açar. Arada workspace adı diyaloğu ya da hesap ayarları sayfası yoktur. — idx 214
10. (onboarding/join) Workspace üyelik durumları:
- terminated: listeden tamamen düşer.
- pending/suspended: listede görünür ama erişim vermez.
- Aktif üyelik yoksa: no-organization ekranı. — idx 190
11. (onboarding/employees) Çalışan onboarding'inde sıfırlama (reset) yoktur; testler ve kod buna göre uyumlanır. — idx 341
12. (employees/profile) Legal name boş kalamaz ve tahminle ya da kopyayla doldurulmaz. Davette employer girer; kişi zorunlu alan olarak kendisi yazar. Middle name ve preferred name dışındaki bütün alanlar zorunludur. — idx 426, 711, 712
13. (profile/settings) Preferred name, workspace ayarında iki moddan biriyle çalışır:
- Auto approve: anında yayınlanır, yöneticiye bildirim gider.
- Manager approval: onay bekler; reddedilirse sessizce iptal olur.
Preferred name legal belgelerde asla kullanılmaz. — idx 303, 300
14. (onboarding/join) Favori ya da varsayılan olarak işaretlenen workspace seçimi sunucuda saklanır ve cihazlar arası geçerlidir. İşaretlenmemişse sistem tahmin yürütmez, her girişte yeniden sorar. — idx 53
15. (schedule/templates) Şablon uygulanırken düşen ya da değişen veri için kullanıcı uyarılır; veri sessizce düşürülmez. — idx 509
16. (schedule) Gizli ama müdüre değer katan özellik (BL-062) silinmez; görünür yapılır, test edilir ve çalıştırılır. — idx 385
17. (roles/copy) Erişim yönlendirme metninde owner'ın adı yerine rol ('Admin') yazılır. Kullanıcı metinleri developer ya da sistem mesajı gibi yazılmaz. — idx 471, 474
18. (ui) Varsayılan tasarım önceliği masaüstüdür. Schedule kart etkileşimleri fare odaklıdır: not yalnız ikonun üzerine gelince açılır, tık ya da sürükleme onu kapatır; mobil hareket tasarlanmaz. — idx 122, 651
19. (ui/navigation) Sayfa içi hub sekmeleri kaldırılır; bütün gezinme sol menüde toplanır. Henüz yapılmamış sayfalar menüde placeholder olarak durur. — idx 126
20. (schedule/templates) 'Save as template' hem draft ekranında hem Templates ekranında bulunur. — idx 139
21. (scope/mvp) Compliance, payroll, time tracking ve break ile ilgili her şey MVP sonrasıdır. Stripe billing şimdilik yoktur; ödeme kapısı ve entitlements işine girilmez. — idx 154, 157, 292
22. (account/ui) Account Profile düzeni:
- Fotoğraf en tepede, özenli tasarımla; legal name üstte.
- 'How you appear' bölümü çıkarılır; 'Who to reach' adı 'Emergency contact' olur.
- Workspace adı etiketi gösterilmez; düzen kompakttır. — idx 703, 704, 706, 710
23. (account/workspaces) Workspaces listesinde aktif satırın 'Open' düğmesi de yeşil ve tıklanabilir kalır. 'Current' rozeti yerine satır vurgusu kullanılır. — idx 207
24. (employees/ui) Bir pencerede tek kaydetme noktası olur: sağ alttaki Save. Bölüm içinde ayrı Save düğmesi olmaz. — idx 729

## Soru tasarımı sorunları

- Jargon, iç ad ve ID ile soru: BL-111/112, branch ya da task kodu, 'giriş modu dönüşümü', persist/enforcement, seed yayını, R2-R3. Mert bu soruları ya anlamadı ya da 'bu neydi' diye geri sordu (37, 409, 412, 291, 321, 516, 759).
- Soyut kural diliyle soru. Ekranın yeri (sayfa → düğme), ekran görüntüsü ve önce/sonra örneği verilmedi. Mert iki kez 'koordinat ver, SS paylaş, tekrar sor' dedi (468, 479, 496, 497, 490, 442, 475).
- Ürün sonucu yerine uygulama yolu soruldu ('basit yol / kesin yol', veri modeli farkı). Ne olacağı, engel mi uyarı mı olduğu ve kime görüneceği anlatılmadı (489, 487, 37).
- Görsel ve yerleşim kararı yazıyla ya da tek kartla soruldu. Varyantlar az ve birbirine benziyordu; '(Önerilen)' görsel varyanta konuldu ve üç tur boyunca hepsi reddedildi (58, 254, 256, 344, 645, 649, 501, 420, 668).
- Soru yanlış zamanda soruldu: spec netleşmeden ya da Mert sayfaları kendisi gezmeden önce varyant ve sıralama soruları geldi. Sonuç çok sayıda dismiss ve deny oldu (55, 56, 166, 228, 229, 230, 231, 322).
- Mevcut kod davranışı ya da ortam durumu doğrulanmadan soru soruldu ya da yanlış önkabul kuruldu. Örnekler: Docker kapalı varsayıldı, RC açık mı diye soruldu, restart gerekip gerekmediği kontrol edilmedi, drawer davranışı yanlış tarif edildi, oturum sağlam varsayıldı (274, 282, 553, 556, 406, 199, 179, 290).
- Seçenek setinde üçüncü yol eksikti. Mert'in istediği yollar seçenekte yoktu: mevcut migration paketine ekle, UI'ı DB kuralına uydur, 'Claude yapsın, yetki veriyorum', backlog'a yaz, orta sert kural (221, 219, 171, 252, 764, 763).
- Çoklu cevap gerektiren durumlar tek seçimli soruldu. Mert birden fazlasını işaretledi ya da '1-2-3' yazdı (124, 225, 667, 456).
- Kararlar toplu ve açıklamasız sunuldu: 'hepsi önerilen gibi' paketi, evet/hayır listesi. Mert 'tek tek çoktan seçmeli yolla' ve 'önce chat'te başlık başlık anlat' dedi (559, 536, 533).
- Ürün sahibine saf teknik mikro kararlar ve kod değişikliği gerektirmeyen teyitler soruldu: şema, test dosyası hizalaması, merge sırası, kontrast (38, 205, 338, 346, 591, 194).
- Araştırılabilecek ya da zaten bilinen şeyler soruldu: ABD pazarı ve İngilizce, terminoloji, 'SaaS'ta ne mantıklı'. Mert 'sen araştır, karar ver' dedi (149, 233, 368, 367, 16, 17, 285).
- Maliyet bilgisi eksikti: altyapı seçeneklerinde $ yerine dakika verildi, ücretli servis ücretsiz alternatif araştırılmadan önerildi (400, 100, 161).
- Ertelenmiş araçlar ya da bayat ve kilitli eski kararlar seçeneklere ve öneriye kondu: UI Lab, eski davet kuralı (268, 180, 189).
- Silme, arşiv ya da commit onayında etkilenen ve geride kalan öğeler listelenmedi. Açık takip maddeleri gösterilmedi; 'senin kararın mı' sorusundan önce değişikliğin ne yaptığı anlatılmadı (79, 419, 407, 431, 27, 135).
- Öneri etiketi tutarsız yazıldı: '(önerilen)', '(Öneri)', '(Onerilen)', '(Tavsiye)', '(B′, Önerilen)'. Bu yüzden ~40 isabetli öneri ölçümde 'öneri yok' sayıldı (2, 4, 78, 84, 86, 298, 355).
- Önerilerin hiçbiri bir KARARLAR satırına, ilkeye ya da emsale dayandırılmadı; güven derecesi de belirtilmedi. Bu yüzden Mert önerinin neden ilk sırada olduğunu göremiyor (721, 288, 451).

## Belge envanteri (karar sistemi)

**Newfork karar sistemi envanteri.** Ölçüm 2026-09-30, `origin/main` `c345ed83`. Yerel main `f8da5ce7`; karar dosyaları ikisinde aynı. Kısaltmalar: R=`C:/Users/TheWe/Documents/Codex/newfork-clean`, G=`C:/Users/TheWe/.claude`, M=`G/projects/C--Users-TheWe-Documents-Codex-newfork-clean/memory`.

## 1. Vizyon nerede yazılı, ne eksik

**Yazılı olan:**
- R/CLAUDE.md:11-13 (§1): "ABD'deki restoranlar için çok kiracılı vardiya planlama SaaS'ı. Hedef: self-serve, ücretli ABD lansmanı."
- R/docs/plan/ROADMAP.md:3: MVP sonucu. Owner kurar, davet eder, yayınlar; çalışan katılır, programını görür, talep gönderir; "Stripe ile satılabilir."
- R/docs/plan/MVP-PLAN.md:5-6: Restoran sahibi landing'den trial başlatır. Kapsam dışı listesi ROADMAP.md:40-43 ve MVP-PLAN.md:112-118.
- R/docs/plan/KOORDINATOR-KARARLARI.md:5-8: Dayanak sırası "SaaS mantığı, ROADMAP, KARARLAR". Bağlam: çok lokasyon, müdür hem yönetir hem vardiya alır, saat dilimleri.
- R/.claude/agents/nf-arayuz.md:16: "restoran sahibi, müdürü ve saatlik çalışan için sade dil".
- "İyi"nin tanımı yalnız mühendislik çıtası olarak var (CLAUDE.md:240-264): tenant güvenliği, ≤50 ms, token, WCAG. Ürün açısından "iyi" tanımlı değil.
- Mert'in vizyon cümleleri yalnız hafıza dosyalarında dağınık:
  - "uygulama bir kokpit…" (M/settings-three-scope-ia.md:15).
  - Linear/Notion stilini seçti, "Newfork dili" ve "rakipler" stillerini reddetti (M/schedule-topright-windows-style-b.md:14).
  - "daha hızlı çıkış yapılır" (R/docs/plan/tasks/EMP-001.md:32).

**Eksik olan:**
- **Persona.** İşletme büyüklüğü, lokasyon sayısı, müdürün cihazı ve teknik düzeyi, saatlik çalışanın telefon kullanımı, alıcı ile kullanıcı ayrımı yok.
- **Rakipler.** Kopyala/kaçın tablosu yok. Rakip adları yalnız araştırma listesinde (nf-planlama.md:14) ve iki KK dayanağında geçiyor (KOORDINATOR:66 7shifts/When I Work, :88 Homebase). docs/brand yok.
- **Ödünleşim sırası yok.** Basitlik/esneklik, hız/güvenlik, tutarlılık/ekran özel çözümü yazılmamış. Örtük sinyaller çelişiyor:
  - Employees çekmecesi kapanırken hiç uyarmıyor, hız seçilmiş (KARARLAR.md:203, kullanıcı K7).
  - Belge çekmecesi "Discard unsaved changes?" diye soruyor, güvenlik seçilmiş (KARARLAR.md:162, KK-50 + BL-467).
- **Anti-hedef yok.** Yalnız kapsam dışı listesi var. "Ne yapmayız / nasıl olmayız" yazılmamış.
- **Dayanak sırası ters.** KOORDINATOR:5 genel "SaaS mantığı"nı Mert'in açık kurallarının (KARARLAR) üstüne koyuyor.

## 2. Mert'in kararları nasıl kaydediliyor

- **KARARLAR.md (300 satır, ~32k token):**
  - UI/DATA/OPS tablosu, 27 satır. Sütunlar: ID / Ne zaman / Kaynak / Sınır.
  - "Ürün kuralları" (:37-120): 56 madde. 28'i "kullanıcı" etiketli; isimli örnekler var (Ayşe, Can).
  - "Ekran kararları" (:122-300): 8 ekran, 53 madde.
  - Tarihli satır 73.
  - "Neden" yazan madde çok az: ekran kararlarında 53'ün 6'sı (ör. :172, :182, :203).
  - Reddedilen seçenekler neredeyse hiç yok. Yalnız yerine geçen kurallar var (`~~` 4, "yerine geçti" 5, "geri alındı" 2).
  - CLAUDE.md:328-331 kaydın biçimini "kural, kodda nerede, ne işe yarar" diye tanımlıyor; nedene ve alternatife yer yok.
- **Görev dosyalarındaki karar tabloları:** S/K numaralı, "kim" sütunlu (EMP-001.md:19-35). Mert'in aynı gün fikir değiştirdiği yerleri gösteriyor: K4 ilk cevap→"Her müdür", K7(i) ilk cevap→tersi.
- **Öneri ile cevabı yan yana tutan tek yer:** R/docs/plan/tasks/BACKLOG-PROGRAM.md:281-300, "Kullanıcıya dönüşte". Yapı soru + seçenekler + öneri + "Cevap".
- **559 AskUserQuestion cevabının kendisi repoda hiçbir yerde kayıtlı değil.** Yalnız transcript'lerde duruyor.

## 3. KOORDINATOR-KARARLARI (68 KK, KK-1…KK-68)

Dosyanın kendi protokolü der ki Mert düzeltirse maddenin altına "Kullanıcı: …" yazılır (:10-11). Bu satır **hiç kullanılmamış**; `git log -S` boş döndü. Yani onay kanalı yok, sessizlik onay sayılıyor.

| Sınıf | Sayı | KK'ler |
|---|---|---|
| Kullanıcı istedi ya da açıkça uyguladı | 5 | 15, 16, 18 ("2 tane daha" isteği), 50 (BL-467'de "hepsi korunsun" ile genişletti), 68 (canlıya main'den önce kendisi gönderdi) |
| Dolaylı (kullanıcı canlıya gönderdi ya da ultrareview koştu, karara yorum yok) | 5 | 13, 38, 39, 55, 67 |
| Kullanıcının sonraki kararıyla değişti ya da konusuz kaldı | 4 | 29, 33, 35 S1/S2 (EMP-001 S1 "yalnız yönetir"i kaldırdı, KARARLAR:45, :58); 9 (BL-121 onaylı G14 planında "bir sonraki planda"ya ertelendi) |
| **Kullanıcı ters çevirdi** | 3 | aşağıda |
| Koordinatörün kendi düzeltmesi | 5 | 5→12; 10 (BL-309)→23; 14→50 K1; 44 (kullanıcıya yanlış açıklama, §0c #23); 60 |
| Kanıt yok | 46 | 17'si salt süreç (1-4, 22, 26-28, 30, 37, 40-42, 52, 53, 58, 66); ~29'u ürün ya da teknik karar, geri bildirim yok |

**Ters çevrilenler:**
- **KK-51 ve KK-57** (%90 haftalık kullanımda yeni iş açılmaz). Mert 2026-10-01: "Haftalık limiti şu an için dert etme" (M/weekly-limit-not-a-brake.md). Dosyada ikisi hâlâ "geçerli" (KOORDINATOR:382, :424).
- **KK-65** ("site bu repodan yayın almıyor" dayanağıyla main'i canlı migration'dan önce almak). Mert olguyu düzeltti (M/vercel-live-deploy.md); canlıda Employees çekmecesi ~2 saat 20 dakika bozuk kaldı. Düzeltme notu KOORDINATOR:480'de.

**Ek notlar:**
- KK-43 aynı yanlış dayanağı taşıyor (:323) ve düzeltme notu yok; arkasındaki soru Mert'te bekliyor (ILERLEME §0c #5).
- KK-35 S3'teki ölçülmemiş varsayım main'e bir Profile gerilemesi soktu (:272).
- Dönüş sorularında öneri tutarlılığı (BACKLOG-PROGRAM:281-300):
  - Tuttu: BL-467, BL-489.
  - Kısmen: BL-480 (öneri "cümle ekle", cevap "mockup sun", sonra B).
  - Tutmadı: BL-475 (öneri "kalsın", cevap "A→Z, elle sıralama kalksın", aynı gün departmanlara genişledi).

## 4. Yanlış öneri, yanlış okuma ve düzeltme kayıtları (tarih – olay)

OBSERVATIONS.md (G/OBSERVATIONS.md):
- 09-22 – Tek mesajı bekleyen istek beş mesajda geldi, fixture üç kez yeniden üretildi (:14).
- 09-22 – "Devam" sınırsız bir evet sanıldı, istenmeyen yarım gün çalışıldı (:41).
- 09-22 – Küçük iş derin kazıya dönüştü (:57).
- 09-22, 09-24 – Anlam istenirken sayı verildi; CI maliyeti dakika verildi, Mert doları sordu (:75, :91).
- 09-22 – Bir olgu itirazı aslında kelime farkıydı ("shift" ile "shift type"; workspace adı) (:101).
- 09-22 – Ortak fixture silindi, sonra geri kondu; kullanıcıya karar geri alması (:122); 12/34 buton sayımı yanlıştı (:140).
- 09-24…09-29 – Yük altında alınan ölçümle kullanıcıya yanlış hüküm söylendi (:170-227).
- 09-24 – İnşadan önce sorulan soru bir günlük ürün kuralını değiştirdi; iki seçenekli öneri yanlıştı, Mert üç seviye istedi (:253).
- 09-26 – Rol oturumları yerine alt ajan kullanıldı; Mert yönü düzeltti (:369).
- 09-28 – Seçenek metnindeki ayrıntılar kullanıcı kararı diye kayda geçti (:379).
- 09-28 – Ölçülmemiş "bu olmaz" iddiasıyla kapsam dışı bırakıldı (:398).
- 09-28 – Koordinatör dağıldı; Mert "Dokunma", "Newfork-clean dışında" dedi. "Hızlanmak" "iki paralel iş" diye okundu; seçenekli soruda **cevap hiçbir seçenek değildi**, serbest metindi (:442-453).
- 09-28 – 3, sonra 10 varyant reddedildi ("hiçbirisi"). Üçüncü tur, yönü Mert referanslarla koyunca tuttu (:458-499).
- 09-29 – Üç yerleşim varyantı reddedildi; istenen stil değil yapıydı (:518).
- 09-29 – Bayat paket derlemesi yüzünden yanlış teşhis; Mert'e iki kez "düzeldi" denildi (:555).
- 09-30 – Rol hafızası işten sonra okundu, kural iki kez yazıldı (:582).

Hafıza dosyaları (M/):
- 09-16 – Soyut taslaklar ve "yeni yön" A/B/C varyantları reddedildi (realistic-mockups.md).
- 09-17, 09-22 – "all secondary white" reddedildi; "Cancel change" yeniden adlandırması ve "disabled Open" geri çevrildi (button-language-decision.md).
- 09-18, 09-28 – "beni dinle benimle istişare et"; ikinci kez yine varyant dayatıldı (consult-before-solving-ui.md).
- 09-20 – "business" sözcüğü "workspace"e geri döndü (ui-vocabulary-business-team.md).
- 09-24, 09-26 – İngilizceye kayıldı; "asla İngilizce konuşma" (reply-in-turkish.md).
- 09-25 – Kopya mesajlara cevap gürültüsü (duplicate-mailbox-no-reply.md).
- 09-28 – Başka klasörün oturumlarını arşivleme önerisi (session-cleanup-scope.md).
- 09-28, 09-29 – "2 paralel" aynı gün geri alındı; "her iş büyüyor" (single-track-and-computed-plan.md).
- 09-30 – KK'ler kural diliyle yazıldı, Mert "app'te ne değişti" diye istedi (user-away-mode.md).
- 09-30 – "Site canlı değil" inancı düzeltildi (vercel-live-deploy.md).
- 10-01 – Kullanım limiti iki kez fren olarak önerildi (weekly-limit-not-a-brake.md).
- 09-30 – Mert kendi kararını aynı gün iki kez değiştirdi: K4 ve K7 (EMP-001.md:28, :31-33).

## 5. Her oturuma ne yükleniyor

**Otomatik yüklenen:**
- G/CLAUDE.md, 444 satır.
- R/CLAUDE.md 372 satır + @DELEGASYON.md 86 satır (CLAUDE.md:9).
- M/MEMORY.md, 42 satırlık dizin; konu dosyaları yüklenmiyor.
- Proje hook'ları yalnız git/kilit/posta kutusu işi yapıyor (guard.mjs, inbox.mjs). GSD hook'ları ve guard/inbox betikleri KARARLAR ya da AskUserQuestion'a hiç bakmıyor (grep 0).
- Bu alt ajanda bir eklentinin SubagentStart hook'u "PONYTAIL MODE ACTIVE" persona metni enjekte etti. Ponytail ve caveman eklentileri global açık; yüzlerce skill adı her bağlama giriyor. Bunlar Mert'in vizyonuyla bağlam için yarışıyor.
- Rol alt ajanına rol dosyası ve `.claude/agent-memory/<rol>/MEMORY.md` giriyor.

**Yalnız istenince okunan:** KARARLAR (300 satır / ~32k token), KOORDINATOR-KARARLARI (501 / ~40k), ROADMAP, MVP-PLAN, ILERLEME, design-canvas, OBSERVATIONS (591 satır; hiçbir yerden import edilmiyor) ve hafıza konu dosyaları.

**Zorlama yok.** "Önce KARARLAR'a bak" yalnız talimat: CLAUDE.md:20-22, :46-47; nf-arayuz.md:21. "Önerilen ilk sırada, (Önerilen) etiketli" kuralı (CLAUDE.md:291-292; G/CLAUDE.md:68-70) var ama önerinin bir KARARLAR maddesine ya da emsale dayandırılması, ya da güven derecesi istenmiyor.

## 6. Çelişkiler ve bayat kurallar

1. **Kelime kuralı çelişkisi.** nf-arayuz.md:22 "workspace / team sistem kelimesi, kullanma" diyor. CLAUDE.md:256-257, KARARLAR:19 ve hafıza "workspace / team kullan" diyor.
2. **Ürün kuralları bölümü karışık.** KARARLAR:39 "Kullanıcı kararları" başlığı altında onaylanmamış KK'ler kural olarak duruyor: KK-24 (:57); ekran kararlarında 13 "koordinatör kararı" (:201-209 vb.). Sonraki oturumlar bunları Mert'in kararı sanıyor.
3. **Kullanıcı yokken ne yapılır.** CLAUDE.md:20-22 ve :232 "cevabı yoksa tahmin etme, kullanıcıya sor" diyor. Kullanıcı yokken karar verme modu yalnız KOORDINATOR:3-4 ve hafızada; anayasada yok.
4. **Tek hat.** CLAUDE.md:309-313 "tek hat" diyor. KOORDINATOR:17 "TEK iş" diyor ama KK-15/16 paralel; 09-30 kuralı "varsayılan tek, istenirse ikinci" (BACKLOG-PROGRAM:362) onay bekliyor (ILERLEME §0c #4d).
5. **Backlog'dan öneri.** G/CLAUDE.md:376-379 "her iş sonunda backlog'dan öner" diyor. R/CLAUDE.md:321-323 bunu daraltıyor; OBSERVATIONS:449 kuralın kök neden olduğu için kaldırıldığını yazıyor.
6. **Tören seviyesi.** G/CLAUDE.md:83 ve :250-258 her gerçek işte izin ve model önerisi istiyor; rol dosyalarında model sabit. Bu, DELEGASYON:3-5'teki "çok zaman kaybettiriyor" kararıyla gerilimde.
7. **KK-51/57 bayat** (bkz. §3). KK-43:323'te düzeltilmemiş "canlı değil" iddiası duruyor.
8. **MVP-PLAN.md bayat.**
   - :18 eski canlı Supabase (`ndcqztpwwzxcqlidgcwi`); bugünkü canlı veritabanı `hvyvyisrqyathtliyyyv`.
   - :19 "Vercel cron dakikada bir"; KOORDINATOR:147 "iç cron yok" diyor.
   - :6 ve F2/F3 Line Up ile push bildirimini sayıyor; KARARLAR:109 ve :120 ikisini de "kapsam dışı, sonra sıfırdan" yapıyor.
9. **Faz sırası üç yerde farklı.** CLAUDE.md:14-15 F0→FJ→F1→F2…F6; ROADMAP:17 ve MVP-PLAN:120 F0→FJ→F1→F6.
10. **KARARLAR:5 bayat.** "(rescue) kaynakları RESCUE-001 bitene kadar" diyor; RESCUE-001 bitti (MVP-PLAN:31).
11. **İzin ayarı.** KARARLAR:86 "onaylı izin kesin engel, ayarı yok" diyor; :291-292 ekranda "Require confirmation / Block" seçeneğinin hâlâ durduğunu yazıyor.
12. **Hafızada bayat kayıtlar.**
    - project-claude-md-removed.md "CLAUDE.md silindi, yeniden yazılmayacak" diyor; dosya duruyor ve MEMORY.md:16'da dizinde.
    - realistic-mockups.md "antrasit birincil buton, yeşil yalnız seçili" diyor; UI-09'a göre aksiyon yeşil. Aynı dosyanın "koordinatör kod yazmaz" cümlesi DELEGASYON:12 ile çelişiyor.
    - coordinator-role.md eski oturum kimliklerini taşıyor.
13. **"Önce dinle" dersi rol dosyasına girmemiş.** Ders üç kez tekrarlandı (OBSERVATIONS:458-528; consult-before-solving-ui) ama nf-arayuz.md:23 hâlâ doğrudan "2-3 varyant hazırla" diyor; soru turu ya da içerik envanteri adımı yok. G/CLAUDE.md:321 üç kez görülen dersin kurala terfi etmesini istiyor.
14. **Tasarım kaynağı belirsiz.** CLAUDE.md:257 "tasarım kararlarının kaynağı design-canvas.md" diyor. Canvas yalnız giriş öncesi ekranlarla Account'u kapsıyor (design-canvas.md:5-7, :30-31); Account 2026-09-29'da yeniden tasarlandı. Canvas'ın güncelliği ölçülmedi; design-canvas-gaps.md (09-20) büyük olasılıkla bayat.
15. **Çekmece kapanış kuralı iki ekranda zıt.** Belge çekmecesi soruyor, Employees çekmecesi sormuyor (bkz. §1). Bunu çözecek bir ilke yazılı değil.

## Madenci desenleri

- (dilim 0) Ürün kuralı bilgisi eksik: öneri genel SaaS standardına ya da 'en az kod' varsayımına dayanıyor. Oysa Mert'in çok lokasyon, rol/rütbe, davet ve giriş akışı, isim ve izin için ayrıntılı, tutarlı bir modeli var. Bu kararlar zamanla da değişiyor (416→:90, 676→:222, 544→:60), yani öneri her zaman KARARLAR'ın en güncel satırına dayanmalı. — idx 52, 184, 216, 300, 416, 544, 712, 780, 604, 540, 180
- (dilim 0) Açıklama yetersiz: soyut kural dili, BL numaraları ve jargon kullanılıyor. Mert uygulama içindeki yeri (sayfa → düğme), ekran görüntüsü, somut örnek, dolar maliyeti ve artı/eksi raporu istiyor; toplu evet/hayır yerine önce chat'te derin açıklama bekliyor. — idx 412, 432, 468, 496, 516, 536, 400, 80
- (dilim 0) Görsel kararlar metinle ya da kartla soruluyor; Mert 2-3 mockup varyantını (her referanstan bir tane) gerçek ekranda görerek seçmek istiyor. Kart ve vardiya rozeti gibi yoğun ekranlarda somut bilgi sırası veriyor. — idx 256, 344, 420, 668, 212, 504
- (dilim 0) Kapsam iki uçlu, öneri ise ortada kalıyor. Mimari ve doğruluk işinde Mert en geniş kapsamı ve sökmeyi istiyor (yeniden tasarlanacak modül dondurulmaz, silinir). Yürüyen işte ise yeni kalem eklenmez, backlog'a yazılır. Öneriler ara yol sunuyor (dondur, paralel yürüt, fırsat buldukça ekle, nadir vakaya yeni kural koy). — idx 356, 384, 608, 232, 456, 348, 752, 156, 280
- (dilim 0) Risk tercihi: geri dönüşsüz işlemlere ve kalıcı yetkilere karşı temkinli (tek seferlik izin, yalnız geri alınabilir silme, bypass'ta log ve yedek, başka oturumun işine dokunmama). Güvenlik açığında ise yüzeyi tamamen kaldıran sert çözümü seçiyor. Öneriler kalıcı izin isterken ya da ikili sert/yumuşak sunarken bu orta yolu kaçırıyor. — idx 392, 688, 764, 64, 92, 168
- (dilim 0) Sorulmaması gereken ya da yanlış kurulmuş sorular var: ertelenmiş bir araca (UI Lab) dayanan seçenekler, henüz verilmemiş marka kararı, zaten yapılmış bir durum, çoklu cevap gerektiren tek seçimli soru, 'SaaS'ta ne mantıklı' diye Claude'un araştırıp karar vermesini bekleyen sorular. Ayrıca bir ölçüm notu: '(öneri)', '(Öneri)', 'Onerilen' etiketleri regex'e uymadığı için bu satırlar no_rec sayılıyor, oysa bu satırlarda öneri aslında tuttu. — idx 268, 112, 556, 124, 16, 368, 228, 84, 92, 272, 276, 284, 304, 308, 312
- (dilim 1) Öneri en hızlı, en ucuz ya da 'mevcut davranışı koru' yönüne kayıyor; ürün işlevinde Mert gerçek ve tam çözümü istiyor (koyu temayı kur, gerçek sertifikasyon, lisanslı içerik, gizli özelliği görünür yap, çoklu lokasyonlu sihirbaz, kuralı koyup kodu ve testi şimdi uyumla). Görsel cilalama işlerinde ise tersi geçerli: kapsam dar tutulur, akış ve hatalar eklenmez. — idx 41, 81, 101, 257, 385, 341, 669, 677
- (dilim 1) Sorular jargonla, iç adlarla (BL-xxx, 'giriş modu dönüşümü', persist/enforcement) ve uygulama yoluyla soruluyor. Mert sonucu istiyor: ne olur, engel mi uyarı mı, kime görünür. Bunu sade dille, örnekle, ekran görüntüsü ve koordinatla görmek istiyor. — idx 37, 321, 409, 489, 497, 533
- (dilim 1) Uç durumlar ve sessiz davranışlar gözden kaçıyor. Mert 'ama yayınlanmamış hafta / yayınlanmış program / lokasyonsuz kişi olursa?' diye ekliyor; veriyi sessizce düşürmeyi ya da sessiz atlamayı kabul etmiyor (uyar, kaydet). Yayınlanmış veri geriye dönük değişmez. — idx 361, 509, 325, 545, 661, 737
- (dilim 1) Görsel kararlar 2-4 metin seçeneğiyle tutmuyor. Mert mockup istiyor: çok sayıda (5-10), birbirinden gerçekten farklı, profesyonel varyant, mevcut ve önceki hâl yan yana, birlikte istişare. Rakip ürünlerin kalıbını tercih ediyor; Claude'un önerdiği varyant sık sık reddediliyor. — idx 481, 501, 645, 649, 673, 229, 225
- (dilim 1) Seremoni fazlası: testler geçtiyse merge, push, bağlantı ve test verisi silme otomatik yapılmalı; ajanın kendi yapabileceği operasyon kullanıcıya devredilmemeli. Sınırlar ise korunuyor: rol/koordinatör kuralı delinmez, paralel oturumların yarım işi gönderilmez, teknik sıralama Mert'e sorulmaz. — idx 129, 413, 765, 777, 153, 209, 653, 105, 205
- (dilim 1) Araştırılabilecek ya da zaten bilinen konular soruluyor. Mert'in beklentisi: enterprise SaaS best practice'i araştır ve kendin karar ver, yapıyı baştan düşünmekten çekinme, KARARLAR.md'yi oku, kodu vizyonun kanıtı sayma. ABD pazarı ve İngilizce varsayılandır (TR harfi yok, telefon yalnız +1). — idx 17, 149, 233, 285, 349, 721, 185
- (dilim 2) Ürün kuralı eksikliği: Mert'in kafasında ayrıntılı bir alan modeli var (workspace üyelik durumları, onboarding'e kaldığı yerden devam, owner'ın çalışan kaydı ve otomatik atamaları, Management departmanının yeri, rızaya dayalı müsaitlik ezme, resmi ad zorunluluğu). Öneriler bunu bilmeden genel SaaS varsayımıyla kuruluyor. Bu kuralların bir kısmı KARARLAR.md'ye girdi, onboarding/join tarafı (190, 218, 278, 426) hâlâ yazılı değil. — idx 190, 218, 278, 314, 378, 426, 530, 542, 546
- (dilim 2) Aşırı temkin ve fazla tören: Ürün satışta değil, canlı tenant yok. Claude buna rağmen shadow/aşamalı geçiş, park etme, ertelenmiş kapsam ve ücretli ultrareview öneriyor. Mert her seferinde doğrudan, tam ve hızlı çözümü seçiyor. — idx 42, 66, 222, 250, 538, 630, 666
- (dilim 2) Görmeden ya da anlamadan karar vermiyor: Görsel kararlar için mockup (en az 2-3 varyant), karmaşık kurallar için ekran adlarıyla somut senaryo, adım adım neden-sonuç anlatımı ve 'bugün kod nasıl çalışıyor' bilgisi istiyor. Temel modeller (yetki kapsamı, saat dilimi) tek soruyla kapatılamıyor. — idx 58, 254, 282, 358, 422, 442, 490, 566
- (dilim 2) Mevcut durumu doğrulamadan soru ya da iddia: Claude bugünkü kod davranışını yanlış tarif ediyor ya da ortamı kontrol etmeden onay istiyor. Saf teknik kararları (şema, test dosyası hizalaması, kod değişikliği olmayan teyit) da ürün sahibine soruyor. Mert 'sen karar ver', 'kontrol et' diyor, soruyu reddediyor ya da kenara koyuyor. — idx 38, 194, 274, 286, 290, 338, 346, 406
- (dilim 2) Kapsam ayarı ters yönde ıskalıyor: Mert verdiği listeye birebir uyulmasını istiyor (fazla kolon eklenmesin, saymadığı butonlara dokunulmasın). Buna karşılık düzeltmenin tek sayfada değil, kullanıcı yolculuğunun tüm ekran ailesinde yapılmasını istiyor. MVP sınırını madde madde değil, kategori düzeyinde çiziyor (compliance/payroll/time tracking MVP sonrası). Büyük belirsiz modülleri (Line Up) ayrı plana ayırıyor. — idx 30, 146, 154, 206, 226, 234, 302
- (dilim 2) UI ve metin zevki: Sade ve tek tip görünüm istiyor (ghost renksiz ve belirgin, gereksiz bağlam etiketi yok), alışılmış rakip kalıplarını seçiyor, masaüstünü öne alıyor, navigasyonu sol menüde topluyor. Metinler kısa olmalı, geliştirici dilinde olmamalı ve çalışana vardiyayı opsiyonel gibi hissettirmemeli. — idx 122, 126, 474, 494, 514, 674, 706, 710
- (dilim 3) Açıklama eksikliği: Claude Mert'in bağlamı hatırladığını varsayıp task/branch ID'si, kısaltma ya da soyut yetki diliyle soruyor. Mert, değişikliğin neyi etkilediğini, bugünkü davranışı, etkilenen dosyaları ve ekrandaki yeri örnekle görmeden seçim yapmıyor. Soru şablonu: önce bugün ne oluyor (sözlü + ekran konumu), sonra örnek senaryo, sonra seçenekler. — idx 27, 79, 135, 291, 407, 419, 431, 475, 479, 487, 743, 759
- (dilim 3) Seçenekler teknik ikiliğe sıkışıyor; Mert'in kuralı ise kullanıcı niyetine ve rol hiyerarşisine dayanıyor. Öneriler ya karmaşık oylama kuralları kuruyor ya da DB'yi değiştirmeyi öneriyor; Mert basit hiyerarşiyi, anlık doğrulamayı ya da 'UI'ı kurala uydur' gibi üçüncü bir yolu seçiyor. Rol, kapsam ve uygunluk kuralları artık KARARLAR.md'de (359, 363, 375, 531, 535 = yes). Katılım, onboarding ve form kuralları (welcome, e-posta tekilliği, ABD telefonu, 'Admin' yönlendirmesi, Create butonu) KARARLAR.md'de hiç yok. — idx 187, 215, 219, 283, 303, 363, 375, 471, 535, 539, 711
- (dilim 3) Kod ve veri işlerinde fazla seremoni: Claude yedekleme, koordinatöre sorma, 'dokunma', erteleme ya da tek hat kuralını öneriyor; Mert hız istiyor ve gerekirse işi Claude'a yaptırıyor. Ama makine/sistem işleri (WSL yeniden başlatma), oturum arşivi ve kritik güvenlik incelemesinde Mert tersine daha temkinli. Kural: veri ve kodda hızlı, altyapıda, oturumlarda ve güvenlikte temkinli. — idx 99, 255, 603, 679, 451, 171, 779, 555, 659, 607, 63
- (dilim 3) UI zevki: varyantlar yalnız yüzeysel stil farkı sunuyor. Mert ise minimalizm (açıklama metni yok, gereksiz bölüm yok), tutarlılık (aynı bileşenin soluk/taralı hâli, global tarza sadakat, aktif öğede tıklanabilir düğme) ve bilgi mimarisi değişikliği (alan sırası, standart terimler) istiyor. Katalogda sistem kayıtları ayrıcalıksız; çalışma ekranlarında özel konum alıyor. — idx 139, 175, 207, 503, 515, 703, 747, 775, 695, 651
- (dilim 3) Karar formatı Mert'te: toplu 'hepsi önerilen gibi' paketlerini ve Claude'un 'sonra konuşalım' ya da 'backlog'a yaz' ile karar kesinleştirmesini reddediyor. Büyük kuralları sohbette ya da TBD olarak bekletiyor, emin olmadığında SaaS emsaline dayalı gerekçeli öneri istiyor, küçük görsel/erişilebilirlik kararlarını ise tamamen Claude'a bırakıyor. — idx 559, 491, 583, 339, 367, 591, 635
- (dilim 3) Kod ≠ vizyon: öneriler mevcut kodu ve yapıyı baz alıp artımlı ilerliyor; Mert yapının yanlış kurulmuş olabileceğini söylüyor ve kök nedeni veri modelinde çözüyor (Management/Owner otomatik kaydı, account sekmesini yeniden düşünme). Ölçüm notu: '(öneri)', '(Öneri)', '(Onerilen)', '(B′, Önerilen)' gibi etiketler regex'e takılmadığı için bu dilimdeki 9 isabetli öneri no_rec sayıldı; gerçek kabul oranı raporlanandan biraz yüksek. — idx 287, 347, 535, 127, 3, 63, 83, 275, 355
