
  // Each live item gets its code and its screen tab.
  var LIVE_AT = {
    "BL-1029 · BL-843": ["employees", "E1"], "BL-1026 · BL-713": ["schedule", "S1"],
    "BL-664 (5)": ["settings", "A1"], "BL-664 (6)": ["settings", "A2"], "BL-850": ["workspace", "W1"],
    "BL-258": ["account", "H1"], "BL-723 (2)": ["schedule", "S12"], "BL-723 (3)": ["schedule", "S13"]
  };
  ITEMS.forEach(function (it) { var at = LIVE_AT[it.bl]; it.kind = "live"; it.tab = at[0]; it.code = at[1]; });

  var OLD_SCHEDULE = "Bu sayfa 9 Ekim'deki uygulamadan kuruldu (main afb24b35). O günden beri Schedule'a başka değişiklikler girdi; Original bugünkü main'den biraz farklı görünebilir. Seçtiğin varyant kodlanırken bugünkü koda uygulanır.";
  var TESTPAGE = "Pencerenin sağ altındaki \"Test page\" düğmesine bas, menüden madde numarasını seç ve varyantlar arasında geç. Pencerenin içinde tıklayabilir, menü ve pencere açabilirsin.";

  var EMBEDS = [
    {
      tab: "schedule", code: "S2", bl: "İzinli günde diğer lokasyonda Add shift thread'i", title: "Atanmadığı lokasyondaki hücre", where: "Schedule · düzenleme modu",
      mode: "page", src: "embed/atanmamis/index.html", orig: "https://claude.ai/artifact/PeCwcUC922XVirLhgBYfBr", origName: "Schedule · Atanmamış lokasyon hücresi",
      facts: [
        ["Ne", "Düzenlerken bir kişinin atanmadığı lokasyondaki boş hücre bugün normal görünüyor; çift tıklayınca Add shift açılıyor, kaydedince sunucu \"Not assigned to this location\" diye reddediyor. A, B, C bu hücreyi kapalı gösterir: hafif içe çökük, üzerine gelince kırmızı \"+ Add shift\", tıklayınca hiçbir şey açılmaz."],
        ["Ghost kart", "D ayrıca ghost kartı (kişinin başka lokasyondaki vardiyası) kendi renginde gösteriyor. Ghost kartın rengi artık ayrı maddede soruluyor: S15 \"Ghost kart asıl vardiyanın renginde\". Bu maddede yalnız hücreyi seç; D'yi hücre için seçersen ghost rengi yine S15'teki seçimine göre olur."],
        ["Nerede", "Schedule → düzenleme modu → Harbor & Vine Downtown bölümünde Emma Wilson, Grace Murphy, Noah Garcia satırları (yalnız Uptown'a atanmışlar)."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"İzinli günde diğer lokasyonda Add shift\" thread'i; cevabını o thread'e iletirim."]
      ],
            asks: ["Hücre için Original, A, B, C ya da D?", "Bu hücrelerde sağ tık menüsü ve vardiyayı sürükleyip bırakma da kapansın mı?", "Böyle bir hücrede izin günü varsa kırmızı \"Time off\" görünmeye devam etsin mi?"],
      mine: "O thread'in önerisi hücre için A'ydı (en sakin olanı).",
      howto: "Üstteki \"Varyant\" düğmeleriyle geç. Downtown bölümünde Emma Wilson'ın boş hücresinin üzerine gel, çift tıkla."
    },
    {
      tab: "schedule", code: "S3", bl: "eski Schedule sayfasında madde 2", old: true, title: "New Schedule penceresi", where: "Schedule → sağ üst New Schedule",
      mode: "app", src: "embed/schedule/ust-cubuk.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Üst çubuk",
      facts: [
        ["Ne", "Taslak oluşturan New Schedule menüsünün tasarımı. Original, 28 Eylül'de seçtiğin \"stil B\" (sade liste, 13 px, tek yeşil aksiyon). 9 Ekim'de istediğin 1–5 yeni varyant ve 28 Eylül turunun stil A ve C'si de var."],
        ["Dikkat", "28 Eylül stilleri tek pencereyi değil, sağ üstteki bütün pencereleri (Published menüsü, Publish, New Schedule) birlikte boyar."],
        ["Kim", "Owner, admin, manager."],
        ["Yeni", "12 Ekim'de istediğin geniş tablo tasarımı (S18) bu pencerenin yerine geçebilir: S18'de A ya da B seçersen bu madde \"Artık geçersiz\"e taşınır."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, 1–5'ten biri mi, 28 Eylül A ya da C mi?"], howto: TESTPAGE + " Bu madde: 2."
    },
    {
      tab: "schedule", code: "S4", bl: "eski Schedule sayfasında madde 5", old: true, title: "Export menüsü", where: "Schedule → Export",
      mode: "app", src: "embed/schedule/ust-cubuk.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Üst çubuk",
      facts: [
        ["Ne", "Export düğmesinin açtığı menü. Original, 16 Eylül'de seçtiğin D (yan panel). 9 Ekim'de 1–5 yeni varyant, 16 Eylül turunun A, B, C, E, F'si de var."],
        ["Bugün", "Export penceresi öteki sağ üst pencerelerin \"stil B\"sinde değil (BL-318)."],
        ["Kim", "Owner, admin, manager."],
        ["Yeni", "12 Ekim'de istediğin geniş tablo tasarımı (S18) bu pencerenin yerine geçebilir: S18'de A ya da B seçersen bu madde \"Artık geçersiz\"e taşınır."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, 1–5'ten biri mi, 16 Eylül A, B, C, E ya da F mi?"], howto: TESTPAGE + " Bu madde: 5."
    },
    {
      tab: "schedule", code: "S5", bl: "eski Schedule sayfasında madde 7; soru listesinde Soru-20", old: true, title: "Dar ekranda ve uzun adlarda üst çubuk taşması", where: "Schedule → üst çubuk",
      mode: "app", src: "embed/schedule/ust-cubuk.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Üst çubuk",
      facts: [
        ["Ne", "936 ve 1024 px genişlikte ya da uzun lokasyon adlarında Schedule'ın üst çubuğu 4–7 satıra çıkıyor. Original (6 Ekim A) ve A, B, C, D var."],
        ["Not", "6 Ekim'de \"başka bir fikrim var\" demiştin; o fikir hiçbir kayda geçmedi. Varsa kendi cümlenle yaz."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, A, B, C, D'den biri mi, yoksa kendi fikrin mi?"], howto: TESTPAGE + " Bu madde: 7. Taşmayı görmek için tarayıcıyı daraltman gerekmez; varyantlar dar hâli de gösterir."
    },
    {
      tab: "schedule", code: "S6", bl: "eski Schedule sayfasında madde 8", old: true, title: "Unpublish onay penceresi", where: "Schedule → Published ▾ → Unpublish",
      mode: "app", src: "embed/schedule/ust-cubuk.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Üst çubuk",
      facts: [
        ["Ne", "Yayındaki haftayı yayından kaldırırken çıkan onay penceresi. Original ve 5 varyant. Pencere bugün öteki sağ üst pencerelerin stilinde değil."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, 1–5'ten biri mi?"], howto: TESTPAGE + " Bu madde: 8."
    },
    {
      tab: "schedule", code: "S7", bl: "eski Schedule sayfasında madde 9; BL-715", old: true, title: "Review default hours penceresi", where: "Schedule → düzenleme şeridi",
      mode: "app", src: "embed/schedule/ust-cubuk.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Üst çubuk",
      facts: [
        ["Ne", "Düzenlerken vardiya tiplerinin varsayılan saatlerini gözden geçiren pencere. Original ve 3 varyant; ne işe yaradığı menüdeki \"Ne işe yarar?\" düğmesinde."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, 1–3'ten biri mi?"], howto: TESTPAGE + " Bu madde: 9."
    },
    {
      tab: "schedule", code: "S8", bl: "eski Schedule sayfasında madde 11", old: true, title: "Açık vardiya işareti", where: "Schedule → Unassigned satırı",
      mode: "app", src: "embed/schedule/pencereler.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Vardiya pencereleri",
      facts: [
        ["Ne", "Düzenlerken Unassigned satırındaki açık (kimseye verilmemiş) vardiyanın göze çarpması. Original, A Soft pulse (yumuşak nabız), B Spotlight, C Moving outline (hareketli çerçeve)."],
        ["Kim", "Owner, admin, manager; yalnız düzenleme modunda."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, A, B ya da C mi?"], howto: TESTPAGE + " Bu madde: 11."
    },
    {
      tab: "schedule", code: "S9", bl: "eski Schedule sayfasında madde 12–13", old: true, title: "Edit shift ve Add shift pencereleri", where: "Schedule → hücreye tıkla",
      mode: "app", src: "embed/schedule/pencereler.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Vardiya pencereleri",
      facts: [
        ["Ne", "Hücreye ya da vardiyaya tıklayınca açılan pencere. Original ve 5 aile: Compact card, Side panel, Keyboard first, Day timeline, Grows from the cell."],
        ["Yeni", "12 Ekim'deki yeni pencere tasarımı (S19, Form ve Timeline) beş ailenin yerine geçer; pencere sorusu orada cevaplanır."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original mı, beş aileden hangisi?"], howto: TESTPAGE + " Bu madde: 12–13."
    },
    {
      tab: "schedule", code: "S10", bl: "eski Schedule sayfasında madde 14", old: true, title: "Açık vardiya ekleme ve saat yazma", where: "Schedule → Unassigned → Add shift",
      mode: "app", src: "embed/schedule/pencereler.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Vardiya pencereleri",
      facts: [
        ["Ne", "Unassigned satırına vardiya ekleyen pencere (S9'daki aynı 5 aile) ve saat kutuları: Original (iki kutu), A tek kutu (\"9-5\" yazınca 9:00 AM – 5:00 PM), B iki kutu + liste. 12h / 24h düğmesi de var."],
        ["Yeni", "12 Ekim'deki yeni pencere tasarımı (S19, Form ve Timeline) beş ailenin yerine geçer; pencere sorusu orada cevaplanır."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: OLD_SCHEDULE, asks: ["Pencere: S9 ile aynı mı olsun, ayrı mı?", "Saat yazma: Original, A ya da B?"], howto: TESTPAGE + " Bu madde: 14."
    },
    {
      tab: "schedule", code: "S11", bl: "BL-717; Soru-21", old: true, title: "Tek lokasyonlu haftada Pazar görünmüyor", where: "Schedule · tek lokasyon, 1440 ekran",
      mode: "app", src: "embed/schedule/test.html", orig: "https://claude.ai/artifact/RNJEGWCDgdG2NpYRpWF4g3", origName: "Schedule test page (birleşik), sekme Schedule (seçimlerinle)",
      facts: [
        ["Ne", "Tek lokasyon seçiliyken 1440 px ekranda 7 günün yalnız 5'i görünüyor; Pazar'ı görmek için yana kaydırmak gerekiyor. Original, B (yedi gün genişliği paylaşır, hepsi sığar), C (sol menü kapalı açılır)."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: OLD_SCHEDULE, asks: ["Original, B ya da C?"], mine: "Önceki öneri B: menüye dokunmadan yedi gün sığar.",
      howto: "Önce üst çubuktaki lokasyon süzgecinden tek lokasyon seç. Sonra sağ alttaki \"Test page\" menüsünde \"One-location week\" bölümünden varyantı seç."
    },
    {
      tab: "schedule", code: "S14", bl: "BL-682", title: "İki lokasyonun haftası ekrana sığmıyor", where: "Schedule · All locations - Separate, 1440 ekran",
      mode: "page", src: "embed/bl-682/index.html",
      facts: [
        ["Ne", "Lokasyon seçicide \"All locations - Separate\" seçiliyken (lokasyonlar ayrı bloklar hâlinde alt alta) 1440 genişlikteki ekranda her lokasyonun haftası yaklaşık 400 piksel taşıyor: Cuma yarım, Cumartesi ve Pazar sağda kalıyor; sağa kaydırınca bir lokasyonun sonu ile öbürünün başı ekranın ortasına düşüyor. 1920 ekranda sorun yok. \"Merged\" ve tek lokasyon zaten sığıyor."],
        ["Neden", "Gün sütunu kartın tek satırlık genişliğinden (146 piksel) daha dar olamıyor; ekranın yedide biri ise 134 piksel."],
        ["Varyantlar", "A: her lokasyonun haftası bir ekrana sığar; kart başlığı ve saat kelime arasından alt satıra geçer (harf harf bölünmez); çalışan adı sütunu gerekirse 200'den 144 piksele kadar daralır. Bu, Merged ve tek lokasyonun bugünkü kuralı. B: hafta yine sığar, çalışan sütunu 200 piksel kalır; kartlar tek satır, sığmayan kısım \"…\" ile kesilir, diğer lokasyonun gri kartlarında görev adı ve bitiş saati okunmaz."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"Çok lokasyonlu haftada rozet taşması\" thread'i; A ile kodlanmış dalı hazır, cevabını o thread'e iletirim."]
      ],
      asks: ["Original, A ya da B?"], mine: "O thread'in önerisi A: Separate görünümü de Merged ve tek lokasyonla aynı sığdırma kuralına uyar, kartlarda yazı kesilmez.",
      howto: "Gömülü sayfanın üstündeki \"Örnek senaryo\" düğmeleriyle Bugün, A ve B arasında geç; masaüstü görüntüsünde ızgarayı sağa kaydırıp Cumartesi ve Pazar'ı ara."
    },
    {
      tab: "employees", code: "E2", bl: "BL-768", title: "İşten çıkarma penceresindeki uyarı cümlesi", where: "Employees → çalışan çekmecesi → Terminate",
      mode: "page", src: "embed/bl-768/index.html",
      facts: [
        ["Ne", "Bir çalışan işten çıkarılınca henüz başlamamış yayınlanmış vardiyaları açığa düşer. Terminate penceresi bugün bunların \"manager follow-ups\" yaratacağını söylüyor ama hiçbir müdüre bir şey gitmiyor. Karar defterine göre (KK-174) artık o lokasyonun müdürüne bildirim gidecek; Settings → Notifications'a da yeni satır gelecek. Bu ikisi kararlı."],
        ["Soru", "Yalnız penceredeki cümle: A aynı kalır (\"…will become open and create manager follow-ups.\"), bildirim gelince doğru olur. B kimin haber alacağını açıkça söyler (\"…will become open, and the managers of their location will be notified.\"). Sayfada farklı cümle sarı işaretli."],
        ["Kim", "Pencereyi owner ve admin görür, bildirimi lokasyon müdürü alır (örnekte Downtown müdürü Rachel Adams)."],
        ["Görünüm", "Bu madde uygulamanın kendisi değil, değişen üç yerin çizimi: pencere cümlesi, müdürün bildirimi ve ayar satırı."],
        ["Sahibi", "\"İşten çıkarmada yönetici takip işi boş\" thread'i; A ile kodluyor, B seçilirse yalnız cümleyi değiştirir. Cevabını o thread'e iletirim."]
      ],
      asks: ["Pencere cümlesi A mı B mi?"], mine: "O thread'in önerisi A: cümle zaten doğru hâle geliyor, metin değişmeden kalır.",
      howto: "Sayfada üç sütun yan yana: bugün, A ve B. Sarı işaretli cümleyi karşılaştır."
    },
    {
      tab: "schedule", code: "S15", bl: "Vardiya kartı, hayalet vardiya ve sürükleme thread'i", title: "Ghost kart asıl vardiyanın renginde", where: "Schedule · düzenleme modu, ghost kartlar",
      mode: "app", src: "embed/ghost/app.html", orig: "https://claude.ai/artifact/SKVYPZu4hnDupzU7Jn1xWo", origName: "Ghost shift colors",
      paneLabel: "Masaüstü 1440 · gerçek Schedule kodu (Vardiya kartı thread'inin dalı), örnek veri; sağ alttaki \"Test page\" ile Original ve A–J arasında geç",
      facts: [
        ["İsteğin, 12 Ekim 4:17 AM", "\"Ghost shift badge'in rengi, o badge'in yansıması olduğu orijinal shiftin rengi ne ise o renkte olsun. Sadece ölü bir tonda. Ama yüzde yüz orijinal shifti yansıtsın.\""],
        ["Ne", "Ghost kart, kişinin başka lokasyondaki vardiyasının bu lokasyondaki yansıması. Bugün bütün ghost kartlar tek ölü gri, taramalı. Varyantların hepsinde çerçeve, yerleşim, yazılar ve konum iğnesi asıl kartla aynı; yalnız renk değişir. Yazılar asıl kartın yazı renginde, en kötü zeminde bile okunaklı (kontrast 5:1'in üstünde). Hareket yok."],
        ["Varyantlar", "A ölü ton: asıl kartın rengi griye doğru yarı yarıya söndürülmüş. B soluk: aynı renk, çok açık, solmuş baskı gibi. C ölü ton ve tarama: A'nın rengi, bugünkü ince tarama kendi renginde. D soluk ve içe çökük: 11 Ekim'deki tarifin (S2'deki D ile aynı), üst kenarda kendi renginde iç gölge. E rengi %70 çekilmiş asıl kart. F ölü ton ve kesikli çerçeve."],
        ["İsteğin, 12 Ekim 2:04 PM", "\"Tıklanamayan buton gibi disabled, canı gitmiş cansızlaşmış\". Bunun için dört yeni varyant: G–J düz, gölgesiz; yazı gri ve normal kalınlıkta."],
        ["Yeni varyantlar", ["G, kapalı düğme: gri zemin, gri yazı; kendi rengi yalnız sol kenarda ince bir çizgi. En \"kapalı\" görünen.", "H, rengi çekilmiş: kendi rengi neredeyse griye inmiş, yazı gri. Rengin izi kalıyor ama canlılığı yok.", "I, yarı saydam: asıl kartın kendisi, yarı saydam (klasik \"disabled düğme\"). Yazı okunurluğu yetersiz (aşağıdaki uyarı).", "J, buzlu: kendi rengi beyaz bir tülün altında; açık ve soluk, yazı gri."]],
        ["Nerede", "Schedule → New Schedule → Edit live schedule → Harbor & Vine Downtown bölümü. Ghost kartlar: Emma Wilson (yeşil Lunch-Server), Grace Murphy (pembe Close-Bartender), Marcus Reed (mor Dinner-Line Cook). Asıl kartlarla karşılaştır: Carlos Rivera (yeşil), Jake Thompson (mor), Daniel Kim (pembe, Cuma)."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"Vardiya kartı, hayalet vardiya ve sürükleme\" thread'i; cevabını o thread'e iletirim."]
      ],
      warn: "I'nın yazısı okunurluk sınırının altında: zeminle kontrastı yaklaşık 2.5:1, olması gereken en az 4.5:1 (WCAG AA). I seçilirse yazı ayrıca koyulaştırılmalı; G, H ve J sınırı tutuyor. Bugünkü bir kararı değiştirir: karar defterinde \"bütün hayaletler tek ölü gri\" (26 Eylül, KARARLAR.md satır 446). Seçtiğin varyant o satırın yerine yazılır. Ayrıca yöneticinin göremediği bir lokasyondaki ghost kart bugün yalnız vardiya tipinin adını taşıyor, rengini taşımıyor; tam yansıma için sunucunun tipin rengini de göndermesi gerekiyor (küçük bir veritabanı eki).",
      asks: ["Original ya da A–J'den biri?"],
      howto: "Sağ alttaki \"Test page\" düğmesine bas, Original ile A–J arasında geç. Düzenleme moduna gir (New Schedule → Edit live schedule), Downtown bölümünde Emma Wilson, Grace Murphy ve Marcus Reed'in ghost kartlarını Carlos Rivera, Jake Thompson ve Daniel Kim'in asıl kartlarıyla karşılaştır."
    },
    {
      tab: "schedule", code: "S16", bl: "Vardiya kartı, hayalet vardiya ve sürükleme thread'i", title: "Kartta Live işareti ve Edited etiketi", where: "Schedule · düzenleme modu, vardiya kartları",
      mode: "page", src: "embed/kart-isaret/index.html", orig: "https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL", origName: "Schedule shift cards (tam kart kataloğu)",
      paneLabel: "Gerçek Schedule kodu (main e0763dd5), örnek veri; sağ alttaki \"Test page\" ile varyantları değiştir (pencerenin içinde kaydır)",
      facts: [
        ["İsteğin, 12 Ekim 4:45 AM", "\"Live scheduledaki bir shift editlenince NEW yazar gibi Edited yazsın. Publish edilmiş shiftlerde ise sağ üstünde yeşil live işareti ya da top çıksın, ya da live yazsın, bilmiyorum.\""],
        ["Soru 1: yayındaki kart", "Live işareti yalnız düzenleme modunda çıkar. Original: işaret yok (9 Ekim kararın). L1: sağ üstte 8 piksel yeşil nokta. L2: sağ altta yeşil \"LIVE\", NEW etiketiyle aynı biçim ve yerde. L3: sağ üstte küçük yeşil tik."],
        ["Soru 2: düzenlenmiş kart", "Yayında olup değiştirilmiş, henüz yayınlanmamış kart. Original: solda koyu şerit ve sağ üstte kalem. E1: sağ altta amber \"EDITED\", NEW'in yerinde ve biçiminde; şerit kalır, kalem kalkar. E2: sağ üstte amber \"EDITED\", kalemin yerinde; şerit kalkar. E3: E2 ile aynı, mavi tonda."],
        ["Nerede", "Schedule → New Schedule → Edit live schedule → Harbor & Vine Downtown, Pazartesi: Ethan Brooks (düzenlenmiş), Maria Lopez (silinmiş), Aisha Johnson (yeni, NEW); öbür Downtown kartları yayında. Uptown taslak, bütün kartlar NEW. Sayfanın altındaki \"All shift cards\" sekmesinde bütün varyantlar yan yana."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"Vardiya kartı, hayalet vardiya ve sürükleme\" thread'i; cevabını o thread'e iletirim."]
      ],
      warn: "Bugünkü bir kararı değiştirir: karar defterinde \"yayınlanmışta işaret yok, yayınlanmamışta NEW etiketi\" (9 Ekim, KARARLAR.md satır 502). Live'dan biri seçilirse \"işaret yok\" kısmı, Edited'dan biri seçilirse şerit ve kalem değişir. Sağ alttaki etiketler (NEW, LIVE, E1) uzun saatlerin üstüne biner (ör. \"11:30 AM - 3:30 PM\"); bu bugünkü NEW'de de var. Sağ üstteki EDITED (E2, E3) uzun başlıklara yaklaşır. Ghost kartın rengi ayrı madde (S15); burada bugünkü hâliyle.",
      asks: ["Yayındaki kart: Original, L1, L2 ya da L3?", "Düzenlenmiş kart: Original, E1, E2 ya da E3?"],
      howto: "Sağ alttaki \"Test page\" düğmesine bas; \"Live mark\" ve \"Edited label\" satırlarından varyant seç. Düzenleme moduna gir, Downtown Pazartesi'de Ethan Brooks'un kartına ve yayındaki kartlara bak."
    },
    {
      tab: "settings", code: "A6", bl: "Başlangıç bitişe eşit uyarı metni thread'i", title: "Shift types sayfası yeni liste dilinde", where: "Settings → Shift catalog (ya da Shift types ve Shift labels)",
      mode: "page", src: "embed/shift-catalog/index.html",
      paneLabel: "Gerçek uygulama kodu (main e0763dd5 üstüne varyant denemesi, main'de yok), örnek veri; üstteki \"Varyant\" ve senaryo düğmeleriyle geç (pencerenin içinde kaydır)",
      facts: [
        ["İsteğin, 12 Ekim 5:17 AM", "\"Shift types sayfasını güncel design dilimize uygun olarak yenile. Artifact olarak güncelle önce ve sun.\""],
        ["Ortak (A, B, C)", "Başlık Locations ve Documents gibi: \"SETTINGS\" üst yazısı, büyük başlık, altında açıklama, başlıkta düğme yok. Arama satırı genişliği doldurur, yeşil ekleme düğmesi satırın sağ ucunda. \"Show archived\" kutusu kalkar. Telefonda her vardiya türü bir kart (\"7:00 AM – 12:00 PM · 5 h\"). Ekleme ve düzenleme çekmecesi değişmez."],
        ["Varyantlar", "Original: bugünkü hâl; başlığın sağında Shift types / Shift labels sekmeleri ve \"Add shift type\", küçük arama, \"Show archived\" kutusu, telefonda sıkışık tablo. A: menüde yine tek \"Shift catalog\"; Shift types ve Shift labels sayfanın içinde sekme; Active / Archived aramanın solunda açılır listede. B: menüde iki ayrı satır, \"Shift types\" ve \"Shift labels\"; her biri kendi sayfası, Locations ile aynı; sayfa içi sekmeler Active / Archived. C: B'nin aynısı, tabloda \"Default hours\", \"Length\" ve vardiyanın günün hangi kısmını kapladığını kendi renginde gösteren 24 saatlik gün çubuğu."],
        ["Senaryolar", "Her varyantta: Shift types, Breakfast'ı düzenle, Başlangıç = bitiş, Yeni vardiya türü, Shift labels, Yeni etiket."],
        ["Kim", "Owner ve admin."],
        ["Sahibi", "\"Başlangıç bitişe eşit uyarı metni\" thread'i; cevabını o thread'e iletirim."]
      ],
      warn: "Karar defterindeki gezinme kuralı: sayfa içi sekmeler kalkar, bütün gezinme sol menüde. Original ve A buna uymuyor, B ve C uyuyor; B ya da C seçilirse Settings menüsünde \"Shift catalog\" satırı ikiye ayrılır. C'deki gün çubuğu yeni bir görsel öğe, başka liste sayfasında yok. Settings → Jobs hâlâ eski görünümde; bu madde onu değiştirmiyor.",
      asks: ["Original, A, B ya da C?"],
      howto: "Gömülü sayfanın üstündeki \"Varyant\" düğmeleriyle Original, A, B ve C arasında geç; senaryo düğmeleriyle düzenleme çekmecesini ve Shift labels'ı aç. Masaüstü ve telefon yan yana çalışır."
    },
    {
      tab: "schedule", code: "S17", bl: "Edit modunda kaybolan ilerleme thread'i", title: "Düzenlerken başka sayfaya geçince uyarı penceresi", where: "Schedule · düzenleme modu → sol menüden başka sayfa",
      mode: "page", src: "embed/ayrilma/index.html",
      paneLabel: "Bugünkü Schedule penceresinin birebir CSS'iyle sade bir düzenleme görünümü (uygulamanın kendisi değil); üstten varyant seç, soldaki menüye tıkla",
      facts: [
        ["İsteğin, 12 Ekim 1:24 PM", "Düzenleme modunda yanlışlıkla başka sayfaya tıklayınca \"kaydetmek istiyor musun / emin misin\" uyarısı çıkmıyor; iş tutarsız biçimde kayboluyor ya da sonradan boş sayfada beliriyor."],
        ["Varyantlar", "Original: bugün, menüye tıklayınca sormadan sayfa değişir; pencere yalnız şeritteki Discard'da çıkar. A: bugünkü Schedule penceresi, üç düğme: Keep editing (beyaz), Discard and leave (kırmızı), Save draft (yeşil); Save draft bugünkü taslak adı penceresini açar, kaydedince seçilen sayfaya geçer. B: iki düğme, Stay here ve Discard and leave (My Availability ve Profile'daki ayrılma penceresi gibi). C: A'nın düğmeleri; Save draft ad sormadan \"Auto-save · Mert · saat\" taslağı yapar."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"Edit modunda kaybolan ilerleme\" thread'i; cevabını o thread'e iletirim."]
      ],
      warn: "Davranış ayrıca o thread'deki karar kartında soruluyor (sor, yalnız sor, sormadan kaydet). Kart \"sormadan kaydet\" çıkarsa bu pencere hiç yapılmaz. Kod önerilen A ile yazılacak; B ya da C seçilirse yalnız pencere değişir.",
      asks: ["Original, A, B ya da C?"], mine: "O thread'in önerisi A: bugünkü Schedule penceresiyle aynı, taslak kaydetme yolu da açık.",
      howto: "Gömülü sayfanın üstünden varyant seç, sonra soldaki menüden Employees, Announcements ya da Settings'e tıkla."
    },
    {
      tab: "schedule", code: "S18", bl: "Üst çubuk ve Schedule pencereleri thread'i", title: "New Schedule penceresi geniş tablo, içinde Export ve Templates", where: "Schedule → sağ üst New Schedule",
      mode: "app", src: "embed/new-schedule/index.html",
      paneLabel: "Masaüstü 1440 · gerçek Schedule kodu (main 6165af0f), örnek veri; sağ alttaki \"Test page\" ile Original, A ve B arasında geç",
      facts: [
        ["İsteklerin, 12 Ekim", [
          "1:49 PM: New Schedule penceresi geniş tablo olsun, Export ve Templates akışları da içine girsin. 1:53 PM: önce tasarım sayfası.",
          "3:23 PM (B): sol üstteki tarih başlığı kalksın, Schedules, Templates ve Export sekmeleri oraya taşınsın.",
          "3:24 PM (B): Templates sekmesinde sağ üstte \"Save template\"; basınca kaydetme formu aşağıda açılsın.",
          "3:29 PM: pencere daha dar ve kompakt; ad ile \"Use\" arasında büyük boşluk olmasın. 3:47 PM: \"Use\" ve ⋯ sonrasında, Save template'in altında boşluk kalmasın.",
          "3:57 PM: şablon akışı için dört öneriye \"olur\" dedin (aşağıda \"Şablon akışı\"). Schedule ve şablon akışları aynı olsun, ayrı sekmelerde ilerlesin.",
          "Hepsi sayfada uygulandı. Açık kalan tek soru: A mı, B mi?"
        ]],
        ["Ortak (A ve B)", "Pencere içeriği kadar geniş, en çok 600 px; \"Use\" ve ⋯ en uzun şablon adının hemen yanında. Export adımı önizleme yüzünden geniş açılır. Üst çubuktaki Export ve Templates düğmeleri kalkar, ikisi bu pencerenin içine girer. Tablo: bu haftanın yayındaki programı ve taslakları; her satırda ad, durum (Live / Draft), vardiya, saat, açık vardiya sayısı, son değişiklik (kimin yaptığı fareyle üstüne gelince). Satıra basınca o program ızgarada görünür. Akışlar sayfanın kendi işleyicileriyle gerçekten çalışır."],
        ["Varyantlar", ["Original: bugünkü main; üst çubukta üç ayrı düğme (New Schedule, Export, Templates) ve üç ayrı pencere.", "A, tablo ve satır menüsü: her program satırının sonunda kalem (düzenle) ve ⋯ menüsü (Show on grid, Export…, Save as template…, Unpublish…, Delete draft). Tablonun altında kayıtlı şablonlar. Bir akış seçilince pencere o adıma geçer, \"Schedules\" geri düğmesiyle tabloya döner.", "B, sekmeli tablo: pencerenin en üst satırında, tarih başlığının yerinde üç sekme, Schedules, Templates, Export. Templates sekmesinde sağ üstte \"Save template\", form listenin altında açılır. Export sekmesinin başında hangi programın dışa aktarılacağı seçilir. Sekmeler arasında genişlik biraz değişir."]],
        ["Şablon akışı (A ve B aynı, 3:57 PM onayın)", ["Her şablon satırında \"Use\", kalem ve ⋯ (Rename, Delete).", "Önizleme: satıra basınca şablon bu haftanın ızgarasına serilir; üst çubuktaki düğme \"Template · ad\" olur, altta \"Template preview\" şeridi (Edit template, Close preview). Hiçbir şey kaydedilmez ya da yayınlanmaz.", "Düzenleme: kalem şablonu düzenleme modunda açar; Publish yerine \"Save template\", Discard aynı, altta \"Editing template\" şeridi. Kişi atanabilir; isimsiz şablonda vardiyalar açık vardiya olarak başlar. Kaydedince şablon yeniden önizlemede görünür.", "Düzenlerken Use: Add (mevcut vardiyalar kalır) ya da Replace (şablonun kapsadığı, başlamamış vardiyalar önce silinir, kaç tane olduğu önceden yazılır); istenirse yalnız bazı departmanlar. Bugünkü davranış.", "Düzenleme dışında Use: önce \"Which schedule should it go into?\" (yayındaki program, bir taslak ya da yeni boş taslak; ekrandaki önceden seçili). Seçilen program düzenlemede açılır, pencere Add / Replace adımıyla geri gelir."]],
        ["Davranış", ["Export her zaman ekranda görüneni çıkarır; satırdan \"Export…\" seçilince önce o program ızgarada açılır, yanlış programı göndermemek için.", "Şablon yalnız düzenlenen haftaya uygulanır; çalışanlar yayınlanana kadar hiçbir şey görmez.", "Şablon önizlemesinde açık vardiyalar görünmez (Unassigned satırı yalnız düzenlemede çıkar); şerit sayısını yazar.", "Düzenlerken Export bugünkü gibi kilitli (\"önce kaydet ya da yayınla\")."]],
        ["Nerede", "Schedule → sağ üstteki New Schedule. Düzenlerken görmek için pencerede bir taslağın kalemine bas (ya da \"New blank schedule\"), sonra pencereyi yeniden aç. Şablon akışı: şablon satırına bas (önizleme), kaleme bas (düzenleme), Use'a bas."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"Üst çubuk ve Schedule pencereleri\" thread'i; cevabını o thread'e iletirim."]
      ],
      warn: "Bugünkü kararları değiştirir: 9 Ekim'de Templates penceresi için A, B, C reddedilmişti; bu yalnız New Schedule penceresi için onun yerine geçer. Bu sekmedeki \"New Schedule penceresi\" (S3) ve \"Export menüsü\" (S4) maddelerinin de yerine geçer: A ya da B seçilirse ikisi \"Artık geçersiz\"e taşınır. Gerçek koda geçerken arka uç işi gerekir: şablonu ızgarada açmak, düzenleyip kaydetmek ve tablodaki sayılar (vardiya, saat, açık) için bugün veri yok. \"Edit modunda kaybolan ilerleme\" işi (S17) düzenlemeden çıkma davranışını değiştiriyor; orada seçilen davranış bu penceredeki \"New blank schedule\" ve kalem düğmelerine de uygulanır.",
      asks: ["A mı, B mi?"],
      howto: "Sağ alttaki \"Test page\" düğmesine bas, Original, A ve B arasında geç; aynı menüdeki \"Ne değişiyor?\" Türkçe açıklamayı açar. Sonra sağ üstteki New Schedule'a bas: satırlara, ⋯ menüsüne (A) ya da sekmelere (B) bak; bir şablonu önizle, kalemle düzenleyip kaydet, Use ile uygula, Export'u dene."
    },
    {
      tab: "schedule", code: "S19", bl: "Vardiya ekleme ve düzenleme pencereleri thread'i", title: "Add / Edit shift penceresi: yeni hâl (Form ve Timeline)", where: "Schedule · düzenleme modu → vardiya kartına çift tık ya da boş hücrede Add shift",
      mode: "app", src: "embed/vardiya-penceresi/index.html", orig: "https://claude.ai/artifact/JLkkPNRt2bhD5DNSsZxWoH", origName: "Shift window redesign",
      paneLabel: "Masaüstü 1440 · gerçek Schedule kodu (main 6165af0f), örnek veri; sol alttaki \"Test page\" ile Original ve New arasında geç",
      facts: [
        ["İsteğin, 12 Ekim 3:41 PM", "\"Add/edit shift window için orijinal tasarımı geliştirmek istiyorum. Bir de küçük bir geçiş tuşuyla Day timeline varyasyonuna geçiş yapmak istiyorum … daha temiz, daha kullanışlı ve daha profesyonel.\" Kendi dokunuşlarını da ekleyeceğini yazdın."],
        ["Ne", "Tek pencere, iki görünüm: Form ve Timeline. Sağ üstteki iki simgeli küçük düğme (ya da Alt+T) aralarında geçer; seçim hatırlanır, imleç aynı alanda kalır. Davranış (kaydetme, silme, kural kutusu, not kartı) main'in aynısı; yalnız görünüm ve kullanım değişiyor."],
        ["İkisinde ortak", ["Başlıkta kim, hangi gün, hangi lokasyon tek satırda; küçük ok pencereyi hücreye bağlar, başlıktan sürüklenir.", "Saat en üstte, imleç içinde açılır (\"10\", \"00\", \"a\", sonra bitiş, Enter kaydeder); yanında süre, altında ücretli saat, ertesi güne taşma, haftalık saat (40'ı geçerse sarı \"overtime\"), izin ya da müsait değil uyarısı.", "Solda kısa etiket, sağda değer: Type, Break, Job, Labels, Note, Badge. Pencere bugünkünden belirgin kısa.", "Düzenlemede değişen satırın etiketinde yeşil nokta; üstüne gelince eski değer.", "Not tek satırla başlar, yazdıkça büyür; Ctrl+Enter nottan kaydeder.", "Kaydetmeden önce sarı kutuda kuralın ilk uyarısı (çakışma, dinlenme süresi).", "Alt çubuk: solda kırmızı iki tık Delete, beyaz Cancel, yeşil Save (Enter işaretli).", "Düzenlenen kart ızgarada yumuşak halkayla nefes alır; boş hücreye eklerken hücre yeşil çerçeve alır."]],
        ["Form", "404 px, satırlar alt alta. Açık vardiyada en üstte \"Who\": her kişinin yanında Free / Busy / Unavailable / Time off ve haftalık saati, boşta olanlar üstte."],
        ["Timeline", "720 px. Günün çizelgesi (5:00 AM → ertesi 5:00 AM); vardiya çubuğu sürüklenir, kenarlarından uzatılır (15 dakika adım; ok tuşları, Shift+ok bir saat). Kişinin öteki vardiyaları soluk, müsait olmadığı saat turuncu taralı, onaylı izin kırmızı. Üstte o lokasyonda her saat kaç kişi çalıştığını gösteren ince eğri. Açık vardiyada işi alabilecek herkes satır satır; satıra basmak vardiyayı o kişiye verir, \"Leave open\" açık bırakır."],
        ["Nerede", "Schedule → New Schedule → Edit live schedule (ya da bir taslağın Edit'i). Sonra bir vardiya kartına çift tık (Edit shift), çalışan satırında boş hücrede Add shift, en üstte Unassigned satırında aynısı (açık vardiya)."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı."],
        ["Sahibi", "\"Vardiya ekleme ve düzenleme pencereleri\" thread'i; yorumlarını ve seçimini o thread'e iletirim."]
      ],
      warn: "9 Ekim'deki beş ailenin (Compact card, Side panel, Keyboard first, Day timeline, Grows from the cell) yerine geçer: bu sekmedeki \"Edit shift ve Add shift pencereleri\" (S9) ve \"Açık vardiya ekleme ve saat yazma\" (S10) maddelerinin pencere sorusu buradan cevaplanır. Kendi dokunuşlarını eklemek istediğini yazdın; yorumlarını madde koduyla yaz. Demo sunucusu aynı kişiye çakışan iki vardiyayı reddetmiyor, gerçek veritabanı reddeder.",
      asks: ["Original mı, New mi?", "New'de pencere hangi görünümle açılsın: Form mu, Timeline mı?", "Eklemek ya da değiştirmek istediğin dokunuşlar?"],
      howto: "Sol alttaki \"Test page\" → \"Add / Edit shift window\": Original ya da New. Aynı menüde \"New window opens in\" (Form / Timeline) ve saat biçimi (12h / 24h). Sonra düzenleme moduna gir, bir karta çift tıkla, pencerede Alt+T ile görünüm değiştir."
    },
    {
      tab: "announcements", code: "D3", tag: "gerçek kod, dalda", bl: "Important Dates çekmecesi thread'i", title: "Audience sekmesi: toparlama", where: "Announcements → + New (ya da bir duyuru) → çekmece → Audience sekmesi",
      mode: "page", pages: [{ label: "Canlı deneme (masaüstü ve telefon)", src: "embed/audience/deneme.html" }, { label: "Varyantlar ve görüntüler", src: "embed/audience/index.html" }],
      orig: "https://claude.ai/artifact/1tUcSJNCQhECQDtpjj6b9V", origName: "Audience sekmesi deneme sayfası",
      paneLabel: "Gerçek uygulama kodu (çekmece dalı 36cf66f4 üstüne varyant denemesi, main'de yok), örnek veri. Canlı denemede üstten varyant ve durum seç; masaüstü ve telefon birlikte çalışır (pencerenin içinde kaydır)",
      facts: [
        ["İsteğin, 12 Ekim 3:16 PM", "\"Audience sekmesi UI olarak biraz kirli ve amatör duruyor. Bunu geliştirebilir misin?\""],
        ["Varyantlar", ["Original: bugün. Üstte açıklama cümlesi; solda alt alta üç süzgeç, herkes işaretli gelen yazı listesi, tam genişlik yeşil \"Add 8 people\"; sağda kişiler yalnız yazı, \"Not yet\" her satırda, onay saati yeşil kalın.", "A, bugüne en yakın: aynı iki bölme. Baş harfli yuvarlaklar, eşit satırlar, ince süzgeçler (davranış aynı), alt satırda \"6 selected\" ve küçük Add. Sağda kişi sayısı rozeti, çubuklu onay özeti ve Remind, iğneli tam lokasyon adı, \"Not yet\" yalnız grup başlığında (amber), onay saati gri ✓. Açıklama cümlesi kalkar.", "B: A'nın aynısı, ama üç süzgeç yerine tek arama kutusu (\"Search name, job or location\"); kimse seçili gelmez.", "C: tek liste. \"Who gets it\" bütün genişlikte, sağ üstte \"+ Add people\"; basınca aynı yerde arama ve liste, Cancel / Add."]],
        ["Görüntüler", "Her varyantta masaüstü 1440 (yalnız çekmece) ve telefon 390: yeni duyuru, kişi seçerken (B, C), iki kişi eklendi, yayında onaylar (6 of 18), müdürün gördüğü."],
        ["Kim", "Owner, admin, manager (müdür hâli ayrı görüntüde)."],
        ["Sahibi", "Important Dates çekmecesi thread'i; seçimini o thread'e iletirim, seçilen kodlanır, öbürleri silinir."]
      ],
      warn: "Önceki kararların korunuyor: bölme adları \"Add people\" ve \"Who gets it\", sağdaki gruplar, \"Ask people to acknowledge\" en altta (12 Ekim 5:06 ve 5:29 AM). B, \"süzgeçten sonra herkes seçili\" davranışını (12 Ekim 3:39 AM notların, madde 9) değiştirir; C iki bölmeyi tek listeye indirir.",
      asks: ["Original, A, B ya da C?"], mine: "O thread'in önerisi A: bugüne en yakın, davranış değişmiyor. B en sade sol bölmeyi veriyor.",
      howto: "\"Canlı deneme\"de üstteki Original / A / B / C ve durum düğmeleriyle geç; masaüstü ve telefon çerçevesinde gerçek çekmece açılır. Yeni duyuruda önce Details'te başlık ve bir lokasyon, sonra Audience sekmesi; kişi ekle, çıkar. \"Varyantlar ve görüntüler\"de 36 görüntü yan yana."
    },
    {
      tab: "schedule", code: "S21", proto: true, bl: "Vardiya kartı, hayalet vardiya ve sürükleme thread'i", title: "Vardiya kartı işaretleri: dördü seçildi, dar haftada uzun ad kaldı", where: "Schedule · vardiya kartları, düzenleme ve okuma modu",
      mode: "page", src: "embed/kart-isaretleri/index.html", orig: "https://claude.ai/artifact/7xJNYsZbknmsvGPk5jdd7p", origName: "Kart işaretleri: 46 taslak (sürüm 7, seçimlerin işaretli)",
      links: [["Seçimlerle kart kataloğu", "Schedule shift cards, tam kart kataloğu (sürüm 10: dört seçim ve ilk satır hizası uygulanmış)", "https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL"]],
      paneLabel: "Tıklanır sayfa, kartlar gerçek Schedule koduyla ve örnek veriyle çiziliyor, kod yok; \"Mark drafts\" sekmesinde dört grup ve seçtiklerinde \"Mert'in seçimi\" yazısı; \"Izgarada bunu kullan\" seçili taslağı Schedule sekmesindeki ızgaraya uygular (pencerenin içinde kaydır). Penceredeki kopya 13 Ekim akşamki 40 taslaklı sürüm; 16 · Çapraz ince ataş ve ilk satır hizası için yukarıdaki sürüm 7 bağlantısını aç",
      facts: [
        ["Ne", "Vardiya kartındaki dört işaretin yeni görünümü: müsait değil \"!\"i (turuncu), yayındaki vardiyanın LIVE'ı, taslakta eklenen ya da değişen vardiyanın NEW'i ve yönetici notu olan kartın işareti. Bunu 13 Ekim 2:58 PM'de istedin."],
        ["Seçtiklerin", ["\"!\" (müsait değil): 5 · Nokta, yalnız küçük turuncu nokta (3:41 PM).", "LIVE: 1 · Nokta + Live, yeşil nokta ve LIVE yazısı, kutu yok (3:41 PM).", "NEW: 7 · Yalın yazı, yalnız yeşil NEW (3:41 PM).", "Yönetici notu: 16 · Çapraz ince ataş; 11'in ince ataşı çapraz duruyor, 15'in yerinde, biraz büyük (5:56 PM)."]],
        ["İlk satır hizası kararlaştı (6:15 PM)", ["İşaretler (ataş, \"!\", LIVE, açık vardiyanın \"x2\"si, hayalet kartın konum iğnesi) her zaman kartın ilk satırıyla aynı hizada; kart onlar için yukarı büyümüyor, tepede boşluk kalmıyor.", "Bir satırdaki kartların ilk satırları hep aynı hizada; kart daha az satır taşıyorsa boşluk altta kalıyor.", "Dar haftada düzenlerken işaretler yazının üstünde kendi satırında duruyor; bu satır bütün kartlarda var, ilk satırlar yine aynı hizada."]],
        ["Açık kalan: dar haftada uzun ad", "Dar haftada okurken ad işarete 4 px'ten fazla yaklaşmıyor. Hepsi sığmıyorsa hafta en dar düzene geçiyor ve sığmayan ad \"…\" ile bitiyor. Örnek veride 1440 px ekranda hayalet kartlardaki \"Breakfast-Prep Cook\" adı \"Breakfast-Prep C…\" oluyor (4 kart). Bu \"…\" kalsın mı, Vardiya kartı thread'inde soruluyor."],
        ["Ölçülenler", "Tarayıcıda 1100–2400 px, okuma ve düzenleme: işaretlerin ortası ilk satırın ortasıyla aynı (en çok 1 px fark); ad ile işaret arası okurken en az 4 px, düzenlerken en az 2 px. Seçilen işaretlerin hepsi kontrast kuralını geçiyor."],
        ["Görüntü", "Önce ve şimdi, 1440 px: /mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/onizleme-ilk-satir.png"],
        ["Kim", "Owner, admin, manager (Schedule, masaüstü)."],
        ["Sahibi", "\"Vardiya kartı\" thread'i; \"!\" seçimi Important Dates thread'inin availability işine girer. Cevabını o thread'e iletirim."]
      ],
      asks: ["Dar haftada sığmayan ad \"…\" ile bitsin mi?"],
      howto: "\"Mark drafts\" sekmesinde seçtiğin dört taslağı gör; Schedule sekmesinde ızgara bu dördüyle açılır. Pencereyi daraltınca dar hafta düzenine geçer; hayalet kartlardaki uzun adı orada görürsün."
    },
    {
      tab: "schedule", code: "S20", proto: true, bl: "Lineup sayfası tasarımı thread'i", title: "Lineup: Schedule'ın altında yeni günlük sayfa", where: "Sol menü → Schedule → Lineup (yeni); çalışan telefonda Home → Today's lineup",
      mode: "page", pages: [{ label: "Üçü bir arada", src: "embed/lineup/index.html" }, { label: "A · List", src: "embed/lineup/a-liste/index.html" }, { label: "B · Cockpit", src: "embed/lineup/b-kokpit/index.html" }, { label: "C · Board", src: "embed/lineup/c-pano/index.html" }],
      orig: "https://claude.ai/artifact/T4Heypx662YmYWSnG36yxW", origName: "Lineup Mockups",
      paneLabel: "Tıklanır mockup, örnek veri, kod yok; üstteki koyu şeritte Who (rol), Show (masaüstü ve telefon), Now (saat) ve canlı olay düğmeleri (pencerenin içinde kaydır)",
      facts: [
        ["Durum", "Yalnız plan ve mockup. Kod yok, trene giden bir şey yok; kod sen \"kodla\" deyince başlar. Bu madde burada görmen ve karşılaştırman için; burada soru yok, sorular \"Lineup sayfası tasarımı\" thread'inde."],
        ["Ne", "Schedule'ın altında günlük operasyon sayfası: her gün, her lokasyonda, her shift type için bir lineup tablosu. Satırlar o günün yayınlanmış Schedule vardiyalarından gelir. Lineup'ta yapılan saat, pozisyon, label, section, sıra, call off ve not değişikliği yalnız Lineup'ta kalır, Schedule değişmez; tek istisna başka lokasyondan transfer. Paylaşınca bir sürüm yazılır, çalışan onu görür ve onaylar; müdürün onayladığı Shift Hub, izin ve Schedule değişikliği paylaşılmış sürüme anında yansır."],
        ["Kararların, 13 Ekim", ["Lineup'taki değişiklik Schedule'ı değiştirmez; değişen alanın yanında turuncu nokta, üstüne gelince \"Changed in this lineup only. Schedule: …\".", "Call off canlı vardiyayı değiştirmez; satır \"Not working today\" bölümüne iner.", "Paylaşılmış lineup'a değişiklik onay anında yansır, Republish gerekmez (yeşil \"Updated live\" şeridi).", "Başka lokasyondan kişiyi yalnız iki lokasyonu da yöneten çeker.", "Ayrı yetki yok; Schedule yetkileri kullanılır.", "Section listesi sonradan eklenir (\"+ Add section…\").", "Onaylı izni olan kişi Add Staff'ta görünür; eklenirse uyarı ve \"Add anyway\", Schedule değişmez.", "Hepsi mockup'larda uygulandı."]],
        ["Mockup'lar", ["A · List: bugünkü liste sayfalarına en yakın; her lokasyonun altında alt alta tablolar. Telefonda tek kart: \"Your spot\", Acknowledge, notlar ve ekip.", "B · Cockpit: solda günün özeti (her lineup'ın durumu ve onay çubuğu, \"Needs attention\", canlı akış), sağda sık satırlı tablolar ve \"Read\" sütunu. Telefonda üç sekme: My shift, Team, Notes.", "C · Board: her lokasyon bir satır, shift type'lar yan yana sütun, kişiler kart. Telefonda Employee Home'daki gibi koyu yeşil büyük kart, onay düğmesi kartın içinde."]],
        ["Denemek için", "Üstteki koyu şerit ürünün parçası değil: Who (Owner, Admin, Manager yalnız Downtown), Show (masaüstü ve telefon, yalnız biri), Now (10:30, 2:40, 4:30, 11:45; kilit ve geçmiş hâli), canlı olaylar (Shift Hub cover, swap, pickup, izin onayı, kısa saatli gün, başka müdürün eklediği vardiya, çalışanın onayı). Örnek owner: Grace Whitman. Pazar 18 Ekim Downtown kapalı gün, Perşembe 15 Ekim Uptown kısa saatli gün."],
        ["Kim", "Owner, admin, manager masaüstünde düzenler ve paylaşır (manager yalnız kendi lokasyonları). Çalışan telefonda kendi lineup'ını görür ve onaylar. Masaüstü sayfası telefonda kapalı, Schedule gibi."],
        ["Plan", "Tam plan (veri modeli, varsayılan kararlar, yapım sırası): /mnt/project-files/pages/gorsel-kararlar/gelen/lineup/PLAN.md."],
        ["Sahibi", "\"Lineup sayfası tasarımı\" thread'i; yorumlarını o thread'e iletirim."]
      ],
      howto: "Üstteki düğmelerle üçü bir arada ya da tek tek A, B, C. Mockup'un koyu şeridinden rolü ve saati değiştir, canlı olayları dene; bir satırda call off, Add Staff ve Share'e bas."
    },
    {
      tab: "requests", code: "R4", proto: true, bl: "Takas kırmızı düğmeler thread'i", title: "Vardiya değişimi: release, cover, swap", where: "Çalışan telefonu: Home → vardiya → Your shift; müdür: Requests → Shift changes",
      mode: "page", src: "embed/vardiya-degisim/index.html",
      paneLabel: "Tıklanır mockup, örnek veri, kod yok; soldan bir an seç, çalışan telefonu, müdür masaüstü ve müdür telefonu o anı gösterir (pencerenin içinde kaydır)",
      facts: [
        ["Durum", "Tek mockup, henüz varyant yok (bir mockup istedin). Plan ve kararların: /mnt/project-files/notes/vardiya-degisim/PLAN.md. Kod yok."],
        ["Ne", "Vardiyayı başkasına vermenin üç ayrı, adlı yolu. Release: vardiya havuza düşer, uygun herkes görür, isteyenler arasından müdür seçer. Ask someone to cover: en çok 3 kişiye sorulur, kabul edenler arasından müdür seçer. Swap: önceden anlaşılmış iki vardiya değişir, iki lokasyonun müdürü de onaylar. Üçü de müdür onayıyla; onaya kadar vardiya ilk çalışanda. Vardiyaya 4 saat kala istek açılamaz."],
        ["16 an", ["Veren (Maria): vardiyaya basınca üç seçenek; son 4 saat; release; cover; swap; My requests ve Take back.", "Alan (Jake): \"Extra shift available\" bildirimi; Available Shifts'te kartı kaydırma (sağa iste, sola geç); cover daveti Accept / Decline; swap onayı; telefonda Schedule → Who's working.", "Müdür (Rachel): Requests → Shift changes tablosu; release, cover ve swap kararı çekmecede (saat, fazla mesai, dinlenme, availability görünür); sahipsiz kalan vardiyalar için \"açık havuza konsun mu?\" sorusu."]],
        ["Kim", "Çalışan telefonda; owner, admin, manager masaüstünde ve telefonda Requests'te."],
        ["Sahibi", "\"Takas kırmızı düğmeler\" thread'i; yorumlarını o thread'e iletirim."]
      ],
      howto: "Soldaki listeden bir an seç (1–16); ekranlar tıklanır: düğmeler, kart kaydırma, çekmece. \"Baştan başlat\" ilk ana döner."
    },
    {
      tab: "employees", code: "E3", proto: true, bl: "Important Dates çekmecesi thread'i", title: "Availability tercih olarak: giriş ve okuma ekranı (yeni beş mockup)", where: "Çalışan: My Availability ve onboarding adımı; müdür: Availability sayfası, çalışan çekmecesi, Schedule",
      mode: "page", src: "embed/availability/index.html",
      paneLabel: "Tıklanır mockup, gerçek uygulama kabuğu üzerinde, örnek veri, kod yok; üstte Mockup (Original, 1–5), Screen (My Availability, Onboarding, Team, Drawer, Schedule, Employee schedule) ve Show (masaüstü, telefon) düğmeleri (pencerenin içinde kaydır)",
      facts: [
        ["Kuralın, 13 Ekim", "Availability çalışanın tercihi, garanti değil. Müdür çalışanın haftasını yalnız görür. Schedule'da hücrede turuncu \"!\" çıkar; vardiya atanınca onay istemeyen kısa bir uyarı gelir. Beş mockup'ta da bu aynı; fark çalışanın tercih girişinde ve müdürün okumasında."],
        ["İlk tur", "13 Ekim sabahki ilk beş mockup'ı beğenmedin, sildirdin. Bunlar sıfırdan, uygulamanın kendi görünüşüyle yapıldı."],
        ["Original", "Bugünkü hâl: her gün için \"Add hours\" ve \"All day\". Haftanın özeti yok, çekmecede kırmızı (izin rengi) var, Schedule'da her atamada onay kutusu çıkıyor, çalışan kendi programında işaret görmüyor."],
        ["Mockup'lar", ["1 · Rows (gün satırları): bugünkü tabloya en yakın; her gün bir satır, saat şeridinde sürükleyerek ya da Available / Some hours / Unavailable ile. Öğrenmesi en kolay; haftayı bir kalıpla doldurmak yok.", "2 · Week (hafta takvimi): Google Takvim gibi; saatler yukarıdan aşağı, birkaç güne tek sürüklemeyle konur. Saat bilgisi en net; telefonda tek gün görünür.", "3 · Dayparts (gün dilimleri): Morning, Midday, Evening, Late night kutuları ve hazır kalıplar (Weekdays only gibi). En hızlısı, telefonda rahat; \"6 PM sonrası\" gibi saat yarım kutu olur.", "4 · Day by day (gün gün): solda günler, sağda seçilen günün büyük ekranı ve saat kaydırıcısı. İlk kez kullanan için en anlaşılır; haftayı aynı anda düzenleyemezsin.", "5 · Rules (cümleyle kural): \"No weekends\", \"Fridays after 6 PM\" gibi kısa kurallar yazılır ya da seçilerek kurulur; sağda haftanın özeti. Müdür herkesin tercihini tek satırda okur; yazarak giriş İngilizce cümle bekler."]],
        ["Kim", "Çalışan (My Availability, onboarding adımı, telefon); owner, admin, manager (Team, çekmece, Schedule)."],
        ["Sahibi", "Important Dates çekmecesi thread'i; seçimini o thread'e iletirim."]
      ],
      warn: "Bu sekmedeki \"Müsaitlik işaretleri: kırmızı mı, amber mı?\" maddesiyle örtüşür: beş mockup'ın hepsinde renk her yerde turuncu. Burada bir mockup seçersen renk sorusu da onunla kapanır.",
      asks: ["Original, 1, 2, 3, 4 ya da 5?"],
      howto: "Üstteki Mockup düğmeleriyle geç; Screen ile çalışan ve müdür ekranlarını, Show ile masaüstü ve telefonu seç. Her mockup'ın altında Fikir, Artı, Eksi ve Dene kutusu var."
    },
    {
      tab: "kabuk", code: "K1", proto: true, bl: "Sol menüdeki gizli workspace seçici thread'i", title: "Sol menünün tepesindeki gizli workspace seçici", where: "Sol menü en üst · telefonda More",
      mode: "page", src: "embed/org-switcher/index.html",
      paneLabel: "Tıklanır mockup, main'in gerçek sol menüsü üzerinde, örnek veri, kod yok; üstten varyant, senaryo (3 workspace ve 1 davet ya da tek workspace) ve menü (açık, kapalı, daraltılmış) seçilir; masaüstü ve telefon birlikte değişir",
      facts: [
        ["Ne", "Sol menünün en tepesindeki workspace adı aslında bir seçici, ama öyle görünmüyor: tek workspace'te tıklanmayan kalın ad; ikinci workspace ya da davet olunca çerçevesiz bir düğme, çerçevesi yalnız fareyle üstüne gelince çıkıyor. Bunu 13 Ekim sabah 5:58'de sen fark ettin."],
        ["Bugünkü hatalar", ["Açılan menü sol menünün kenarında kesiliyor; davetin Answer düğmesi yarım görünüyor.", "Telefonda sol menü yok; müdürün telefonda workspace değiştirme yolu yok.", "Çalışanın More → Switch workspace'i Account → Workspaces'e, seçicinin \"All workspaces\"ı ise Workspace Hub'a gidiyor: aynı iş için iki ayrı sayfa."]],
        ["Varyantlar", ["A · Kaldır: tepede yalnız workspace adı; geçiş tek yerden, Account → Workspaces.", "B · Görünür seçici: aynı yerde çerçeveli düğme (harf rozeti, ad, rol, ⇅), tek workspace'te de tıklanır; menü kesilmez, altta \"Manage workspaces\"; daraltılmış menüde rozet; telefonda More'un tepesinde aynı liste.", "C · Hesap menüsünde: sol alttaki Account satırı bir menü açar (kim, workspace listesi, davet, Manage workspaces, Account settings, Sign out); tepede yalnız ad; telefonda More'daki Account satırı aynı listeyi açar."]],
        ["Kim", "Owner, admin, manager (sol menü, müdür telefon menüsü); çalışan (telefonda More)."],
        ["Sahibi", "\"Sol menüdeki gizli workspace seçici\" thread'i; seçimini o thread'e iletirim."]
      ],
      asks: ["Original, A, B ya da C?"],
      howto: "Üstteki düğmelerle varyant, senaryo ve menü hâlini seç. Masaüstünde sol menünün tepesine ya da sol alttaki Account satırına tıkla; workspace değiştirince iki pencere birlikte değişir."
    },
    {
      tab: "requests", code: "R5", proto: true, bl: "Takas kırmızı düğmeler thread'i", title: "Vardiya değişikliği türlerine ikon", where: "Requests → Shift changes listesi · masaüstü ve telefon",
      mode: "page", src: "embed/vardiya-ikonlari/index.html",
      paneLabel: "Tıklanır mockup, örnek veri, kod yok; bir ikon adayına bas, alttaki masaüstü ve telefon satırları o ikonla değişir (pencerenin içinde kaydır)",
      facts: [
        ["Ne", "Müdürün Requests → Shift changes listesinde her satırın başına talebin türünü gösteren ikon. Bugün masaüstünde ikon yok; telefonda türün baş harfi (P, C, S) yuvarlak içinde duruyor. Bunu 13 Ekim 3:32 PM'de sen istedin."],
        ["Swap", "İki ok (Two arrows); değişmiyor."],
        ["Pickup adayları", ["Raised hand: \"I'll take it\", vardiyayı isteyen el kaldırır; satırdaki \"3 want it\" ile aynı dil.", "Into the tray: havuzdaki vardiya birinin eline geçer; \"indir\" ikonuna benziyor.", "Calendar plus: takvimine bir vardiya eklenir.", "Dashed circle: bugün uygulamada açık vardiya işareti."]],
        ["Cover adayları", ["Steps in: biri gelir, arkadaşının yerine geçer.", "Person + check: biri kabul etti.", "Umbrella: \"cover\", arkadaşını korur.", "Person + search: bugün uygulamadaki Cover ikonu."]],
        ["Yerleşim", "Masaüstünde ikon kendi dar sütununda, Status'tan önce, köşeli karoda (yuvarlak karo kişi baş harfleri için). Telefonda baş harf yuvarlağının yerine geçer. Type sütunundaki yazı kalır; ekran okuyucu yazıyı okur."],
        ["Kim", "Owner, admin, manager (Requests); masaüstü ve telefon."],
        ["Sahibi", "\"Takas kırmızı düğmeler\" thread'i; seçimini o thread'e iletirim."]
      ],
      asks: ["Pickup için Raised hand, Into the tray, Calendar plus ya da Dashed circle?", "Cover için Steps in, Person + check, Umbrella ya da Person + search?"],
      mine: "O thread'in önerisi Pickup için Raised hand, Cover için Steps in.",
      howto: "Üstteki ikon kartlarından birine bas; alttaki masaüstü ve telefon satırları o ikonla değişir."
    },
    {
      tab: "requests", code: "R6", proto: true, bl: "Takas kırmızı düğmeler thread'i", title: "Shift changes satırları: çalışacak kişiyle başlayan cümle", where: "Requests → Shift changes listesi · masaüstü ve telefon (owner, admin, manager)",
      mode: "page", pages: [{ label: "Yeni satırlar (mockup)", src: "embed/vardiya-degisim/index.html" }, { label: "Original: bugünkü satırlar", src: "embed/satir-cumleleri/once.html" }, { label: "Önce ve sonra görüntüleri", src: "embed/satir-cumleleri/goruntuler.html" }],
      links: [["Deneme sayfası", "Shift changes satırları (tıklanır mockup)", "https://claude.ai/artifact/723BAcPXjhxwYePzqDGSxk"]],
      paneLabel: "Tıklanır mockup, örnek veri, kod yok; soldaki listeden 13. anı (Requests → Shift changes tablosu) seç, müdür masaüstü ve müdür telefonu yeni satırları gösterir (pencerenin içinde kaydır)",
      facts: [
        ["Ne", "13 Ekim 5:28 PM ve 5:30 PM'deki isteğinle Shift changes satırları sütunlardan cümleye dönüyor. Her satır ikonla ve vardiyayı çalışacak kişiyle başlıyor: \"Jake Miller and 2 others would like to pick up Maria Lopez's 4:00 PM Server shift at Downtown on Fri, Oct 16.\" Altında gri satırda \"Review the details and decide by …\"; karardan sonra \"Approved by you yesterday.\""],
        ["Original", "Bugün satır sütunlardan oluşuyor: Status, Shift change (vardiyanın sahibi), Type, Shift, Location, Waiting. Vardiyayı kimin alacağı satırda yazmıyor; çekmeceyi açmak gerekiyor."],
        ["Masaüstü", "Sütunlar Request, Status ve Waiting'e iniyor. Swap iki satırla açılıyor: \"Daniel takes Priya's 3:00 PM Server shift at Downtown on Sun, Oct 18.\" ve \"Priya takes Daniel's 5:00 PM Server shift at Midtown on Tue, Oct 20.\""],
        ["Telefon", "Kısa cümle (\"… would like to pick up Maria Lopez's Server shift.\"), altında gün · saat · lokasyon satırı, en altta durum ve \"Decide by …\". Swap'ta iki vardiya yan yana iki kutuda: gün, saat, lokasyon ve \"Priya → Daniel\"."],
        ["İkonlar", "Seçtiğin ikonlar: Pickup Raised hand, Cover Steps in, Swap iki ok."],
        ["Durum", "Yalnız plan, kod yok. Bugünkü hâlin yedeği /mnt/project-files/pages/vardiya-degisim-indir/yedek-2026-10-14-satirlar/, yeni görüntüler /mnt/project-files/pages/vardiya-degisim-indir/satir-cumleleri/."],
        ["Kim", "Owner, admin, manager (Requests); masaüstü ve telefon."],
        ["Sahibi", "\"Takas kırmızı düğmeler\" thread'i; yorumlarını o thread'e iletirim."]
      ],
      asks: ["Yeni satırlar mı, Original mı?"],
      howto: "Üstteki düğmelerle yeni mockup, Original ve önce/sonra görüntüleri arasında geç. Mockup'ta soldan 13. anı seç; 14–16. anlarda karar çekmecesi açılır, kararı verince satırın nasıl değiştiğini görürsün."
    },
    {
      tab: "ortak", code: "O1", proto: true, bl: "Erişim yok hatası ekranları thread'i", title: "Erişim yok kartı: \"You don't have access to …\"", where: "Yetkisi olmayan bir sayfa ya da çekmece açılınca (örnek: Workspace sayfası, Employees → çalışan çekmecesi) · masaüstü ve telefon",
      mode: "page", pages: [{ label: "Original", src: "embed/erisim-karti/orig.html" }, { label: "A · Çerçevesiz", src: "embed/erisim-karti/a.html" }, { label: "B · Yatay şerit", src: "embed/erisim-karti/b.html" }, { label: "C · Odak kartı", src: "embed/erisim-karti/c.html" }],
      orig: "https://claude.ai/artifact/Xr1CkDfyGejXq74pWdmnCW", origName: "Erişim yok ekranları (canlı karşılaştırma, üstte Kart düğmeleri: Original, A, B, C)",
      paneLabel: "Görüntüler mockup'tan, kod yok; her varyantta Workspace sayfası ve çalışan çekmecesi, masaüstü 1440 ve telefon 390 yan yana. Tıklanır hâli için yukarıdaki canlı karşılaştırma sayfasını aç",
      facts: [
        ["Ne", "Kişinin rolü ya da lokasyonları bir sayfayı veya çekmeceyi kapsamıyorsa çıkan kart: kilit, \"You don't have access to this workspace\" (ya da \"this employee\"), \"Your role or your locations don't include it. Ask an admin for access.\" ve yeşil Back to Home."],
        ["Varyantlar", ["Original: çerçeveli beyaz kutu, içerik alanının tepesinde, ortada kilit, başlık, iki satır, yeşil Back to Home.", "A · Çerçevesiz: kutu yok; içerik boş alanın ortasında duruyor.", "B · Yatay şerit: içerik alanının üstünde tek şerit, solda kilit ve yazı, sağda düğme; telefonda düğme alta, tam genişliğe iner.", "C · Odak kartı: dar (440 px), ortalı kart, yeşil tonlu daire içinde kilit, tam genişlik düğme."]],
        ["Kapsam", "Varyantlar yalnız bu kartı değiştirir; sayfaların içindeki satır içi uyarılar aynı kalır. Yapıldığı main: ff275b71 (14 Ekim)."],
        ["Kim", "Owner, admin, manager ve çalışan: kim yetkisi olmayan bir yere giderse."],
        ["Sahibi", "\"Erişim yok hatası ekranları\" thread'i; seçimini o thread'e iletirim."]
      ],
      asks: ["Original, A, B ya da C?"],
      howto: "Üstteki düğmelerle Original, A, B ve C arasında geç. Canlı karşılaştırma sayfasında üstteki Kart düğmeleriyle aynı varyantları gerçek ekranlar içinde, tıklanır hâlde dene."
    },
    {
      tab: "settings", code: "A7", proto: true, bl: "Jobs devir dosyası thread'i", title: "Jobs çekmecesi renk dengesi: her şey çok beyaz", where: "Settings → Jobs → bir job'a tıkla (örnek: Bartender çekmecesi) · masaüstü ve telefon",
      mode: "page", pages: [{ label: "Original", src: "embed/jobs-renk/orijinal.html" }, { label: "A · Gri zemin, beyaz kartlar", src: "embed/jobs-renk/a.html" }, { label: "B · Bölüm şeritleri", src: "embed/jobs-renk/b.html" }, { label: "C · Çizgi ve gölge", src: "embed/jobs-renk/c.html" }, { label: "D · Vurgu", src: "embed/jobs-renk/d.html" }, { label: "E · Hafif ton", src: "embed/jobs-renk/e.html" }, { label: "Arama kutusu (karara bağlandı)", src: "embed/jobs-renk/arama.html" }],
      paneLabel: "Görüntüler, kod yok; Original ve A–E, her birinde Bartender çekmecesi masaüstü 1440 ve telefon 390 yan yana",
      facts: [
        ["Ne", "Senin yorumun: \"her şey çok beyaz ve her şey birbirine giriyor\". Jobs çekmecesinde Details (Job name, renk, Department) ve Employees (All, Assigned, Not assigned, arama, çalışan listesi) aynı beyazın içinde; bölümleri yalnız ince çizgiler ayırıyor."],
        ["Varyantlar", ["Original: her şey beyaz, bölümler ince çizgiyle ayrılıyor.", "A · Gri zemin, beyaz kartlar: çekmecenin zemini sayfa grisi; Details ve Employees ayrı beyaz kartlarda; seçili çalışan satırı açık yeşil.", "B · Bölüm şeritleri: üst başlık, filtre alanı ve alttaki düğme şeridi açık gri; bölüm başlıkları küçük büyük harfle; çalışan listesi kenardan kenara; seçili satır açık yeşil."]],
        ["İkinci tur (14 Ekim 12:13 AM)", ["Senin isteğin: renk değiştirmeden çizgi, gölge ve vurguyla ya da tasarım diline yakın bir renkle.", "C · Çizgi ve gölge: renk yok; başlık ve alttaki düğme şeridi hafif gölgeyle ayrılıyor; bölüm başlıkları büyük; çerçeveler bir ton koyu; liste hafif gölgeli kart; seçili satırda solda yeşil çizgi, ad yeşil.", "D · Vurgu: zemin beyaz; bölüm başlıkları yeşil, küçük büyük harfle, solunda yeşil çizgi; iki bölüm arasında ince gri boşluk; liste kenarsız; seçili kişinin harf dairesi yeşil dolu.", "E · Hafif ton: çekmecenin içi çok açık gri; alanlar ve liste beyaz; seçili satır açık yeşil."]],
        ["Arama kutusu: karara bağlandı", "İç içe çift çerçeve bir hataydı; düzeltmesini kabul ettin. Hangi renk seçilirse seçilsin girer. Original görüntüler artık düzeltilmiş hâliyle."],
        ["Renkler", "Yeni renk yok; uygulamanın kendi tonları (sayfa grisi, açık gri yüzey, seçili satır yeşili, çizgi rengi)."],
        ["Kim", "Owner ve admin (Settings → Jobs)."],
        ["Sahibi", "\"Jobs devir dosyası\" thread'i; seçimini o thread'e iletirim."]
      ],
      asks: ["Original, A, B, C, D ya da E?"],
      howto: "Üstteki düğmelerle Original ve A–E arasında geç; her birinde masaüstü ve telefon yan yana. Son düğme arama kutusunun önce ve sonra hâli."
    },
    {
      tab: "ortak", code: "O2", proto: true, bl: "Erişim yok hatası ekranları thread'i", title: "Tek cümlelik uyarılar: sayfanın yerine geçen tek cümle", where: "17 yer: Schedule telefonda, Requests ve Shift Hub'da olmayan talep, olmayan vardiya ve duyuru, Documents, Availability, Settings (General, Roles, Jobs, şablon) · masaüstü ve telefon",
      mode: "page", pages: [{ label: "Original", src: "embed/tek-cumle/orig.html" }, { label: "A · Aynı aile", src: "embed/tek-cumle/a.html" }, { label: "B · Sade boş durum", src: "embed/tek-cumle/b.html" }, { label: "C · Bilgi şeridi", src: "embed/tek-cumle/c.html" }],
      orig: "https://claude.ai/artifact/7pQDWftLVrPVLGuxVRLuMV", origName: "Tek cümlelik uyarılar: 17 yerin hepsi (canlı sayfa)",
      paneLabel: "Görüntüler, kod yok; 17 yerden dördü (Schedule telefonda, olmayan talep, belge ayrıntısı, olmayan rol), her birinde masaüstü ve telefon yan yana. Bütün yerler için yukarıdaki canlı sayfayı aç",
      facts: [
        ["Ne", "13 Ekim 11:33 PM'de istedin: \"Schedule is available on a computer.\" gibi bir sayfanın, çekmecenin ya da pencerenin yerine geçen tek cümlelik uyarılar düzgün bir görünüme kavuşsun, telefonda da. 17 yer bulundu; bugün 9 ayrı görünümleri var."],
        ["Varyantlar", ["Original: tek gri cümle, ortada; düğme yok.", "A · Aynı aile: erişim kartının C'sine (Odak kartı) akraba; ortalı kart, yeşil tonlu daire içinde simge, başlık, kısa açıklama, yeşil tam genişlik düğme (örnek: \"Schedule opens on a computer\" ve Open Lineup).", "B · Sade boş durum: gölgesiz, açık gri zeminde simge, başlık, açıklama ve beyaz küçük düğme.", "C · Bilgi şeridi: içeriğin tepesinde tek şerit; solda simge, başlık ve açıklama, altında beyaz düğme."]],
        ["Üçünde aynı", "Metinler aynı. Olmayan kayıt ile yetki dışı kayıt aynı cümleyi alıyor (\"isn't available\"). Yükleme hatası olan iki yer (Employee Hub'daki Schedule, Shift Hub) zaten seçilmiş \"We couldn't load\" kartına gidiyor."],
        ["Bağlantı", "Birden çok ekran sekmesindeki \"Erişim yok kartı\" maddesiyle aynı aileden; orada C seçilirse A en uyumlu olanı."],
        ["Kim", "Owner, admin, manager ve çalışan; masaüstü ve telefon."],
        ["Sahibi", "\"Erişim yok hatası ekranları\" thread'i. Shift Hub ekranları Takas thread'inin, Jobs uyarısı Jobs thread'inin; ikisi de bu seçimi bekliyor."]
      ],
      asks: ["Original, A, B ya da C?"],
      howto: "Üstteki düğmelerle Original, A, B ve C arasında geç; her birinde aynı dört yer. 17 yerin hepsini canlı sayfada gör."
    },
    {
      tab: "requests", code: "R1", bl: "BL-1024", title: "Açılamayan talep bağlantısı (ikinci tur)", where: "Requests · müdür bildirimden açınca",
      mode: "page", src: "embed/bl-1024/index.html", orig: "https://claude.ai/artifact/2e9oGkM7BKsVgRHkJXwF8D", origName: "Requests: açılamayan talep bağlantısı (sürüm 4, ikinci tur)",
      facts: [
        ["Ne", "Müdür \"A shift request needs review\" bildirimine tıklıyor; talep artık yok ya da kendi lokasyonunun dışında. Bugün eski Shift Hub müdür ekranı açılıyor; altta kesik çizgili kutuda \"Request unavailable\" ve \"Back to requests\" var. O eski ekran siliniyor; Original yalnız görünüşü için burada."],
        ["İlk tur", "12 Ekim gecesi ilk turdaki C, A ve B'yi beğenmedin; Original'i daha şık buldun, sade ve basit bir tasarım istedin. Bu tur Original'in sade dilinden çıktı: ortada bir simge, kalın başlık, tek cümle, tek düğme."],
        ["Varyantlar", "D: Requests sayfası açılır, tablonun yerinde Requests'in kendi \"No requests\" boş hâliyle aynı kutu, beyaz \"Show all requests\" düğmesi. E: Original'in kesik çizgili kutusu neredeyse aynen, yeni sayfada tablonun yerinde, altta tam genişlikte \"Back to requests\". F: liste arkada açık kalır, sağdan çekmece açılır, ortasında aynı simge, başlık, cümle ve beyaz \"Close\"."],
        ["Cümle", "Karar verildi (12 Ekim 6:44 AM): üçünde de \"This request is no longer available.\" Bekleyen yalnız görünüm seçimi."],
        ["Kim", "Owner, admin, manager (örnekte Rachel Adams, Downtown müdürü)."],
        ["Sahibi", "\"Eski Shift Hub yönetici ekranları\" thread'i; cevabını o thread'e iletirim."]
      ],
      asks: ["Original, D, E ya da F?"], mine: "O thread'in önerisi D: sayfanın zaten kullandığı boş hâl, ekranlar arasında tek dil.",
      howto: "Gömülü sayfanın üstündeki \"Seçenek\" düğmeleriyle Original, D, E ve F arasında geç."
    },
    {
      tab: "requests", code: "R2", bl: "soru listesinde G3; BL-364", old: true, title: "Müdürün kısalttığı izin satırı", where: "Requests → Closed",
      mode: "page", src: "embed/eski/requests-g3.html", orig: "https://claude.ai/artifact/E6DvBpyyt8rZeDv7opzj1j", origName: "Requests Warnings Lab",
      facts: [
        ["Ne", "Müdür onaylı bir izni kısaltınca kapanmış talepler listesinde bu satır bugün \"Cancels approved time off\" diye görünüyor; kısaltıldığı anlaşılmıyor. Beş varyant var; önceki öneri 4: Type sütununda \"Shortened\"."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: "Bu varyantlar Requests'in eski listesinde çizildi (9 Ekim). Requests 11 Ekim'de yeni sekmelere geçti (All · Time off · Shift changes). Seçtiğin varyant yeni listeye yeniden çizilip sana bir kez daha gösterilir. Sayfanın üstündeki H2 takas penceresi kararlı, yalnız arşiv için duruyor.",
      asks: ["Bugünkü hâl mi, 1–5'ten hangisi?"], howto: "Sayfayı aşağı kaydır, \"Müdürün kısalttığı izin\" bölümündeki beş varyanta bak."
    },
    {
      tab: "requests", code: "R3", bl: "soru listesinde G13, 3. madde", kind: "question", qid: "q-g13", title: "Takas penceresi telefonda", where: "Requests → takas talebi · telefon"
    },
    {
      tab: "settings", code: "A3", bl: "BL-953", kind: "question", qid: "q-bl953", title: "Katalog çekmecelerinde sağ kenar hizası", where: "Settings → Jobs, Shift catalog, Documents…"
    },
    {
      tab: "settings", code: "A4", bl: "Soru-28", old: true, title: "Departments sekmesinin satır düzeni ve New department'ın yeri", where: "Settings → Jobs & departments",
      mode: "app", src: "embed/jobs/index.html", orig: "https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr", origName: "Jobs & departments",
      facts: [
        ["Ne", "7 Ekim'de Jobs sayfası için V1'i (ortak tablo dili) ve üç düzenlemeyi seçtin. Departments sekmesinin satır düzeni ve New department düğmesinin yeri hiç gösterilmemişti; 9 Ekim'de üç varyant çizildi: A Sade tablo, B İşler sütunda, C İşler adın altında."],
        ["Görsel olmayan iki soru", "Departman gruplarını katlama ve \"Collapse all\" kalsın mı; Archived sekmesinde arşivli departmanlar nerede görünsün (Soru-26, Soru-27). İstersen bunları da burada cevaplayabilirsin."],
        ["Kim", "Owner, admin."]
      ],
      warn: "Bu sayfa 7–9 Ekim'de çizildi. O günden beri Jobs sayfasına yalnız küçük düzeltmeler girdi (kırmızı Discard düğmesi, klavye odağı); seçtiğin hâller henüz kodda yok.",
      asks: ["Departments sekmesi: Original, A, B ya da C?"], howto: "Pencerenin altındaki çubuktan Original, A, B, C arasında geç; sayfadaki \"Departments\" sekmesine bas. Mor numaralar değişen yerleri gösterir."
    },
    {
      tab: "settings", code: "A5", bl: "soru listesinde G1 ve G2", old: true, title: "Settings → General için yeni yön", where: "Settings → General",
      mode: "page", src: "embed/general/index.html", orig: "https://claude.ai/artifact/Kwz63F5JeddW5S7y2kSsAi", origName: "Settings General Varyantları",
      facts: [
        ["Ne", "7 Ekim'de altı tasarımın (A–F) hiçbirini beğenmedin; sayfa bugünkü hâliyle kaldı. Yeni tur senin yönünü bekliyor. Sayfada bugünkü hâl, onda bulunan sorunlar (dört kaydetme yeri, farklı genişlikte dört yeşil düğme, telefonda taşan Manage logo) ve dört ek öneri var: workspace saat dilimi, tek logo her yerde, sahiplik ve kapatma bağlantısı, plan özeti (sayfada Ö1–Ö4)."],
        ["Görsel olmayan soru", "Workspace saat dilimi temel bir model kararı (G3); önce sohbette konuşulur, burada sorulmuyor."],
        ["Kim", "Owner, admin."]
      ],
      asks: ["Altı tasarımda neyi beğenmedin? Yeni tur bu cevaba göre çizilir.", "Dört ek öneriden hangileri girsin? Önceki öneri: tek logo her yerde ile sahiplik ve kapatma bağlantısı hemen, plan özeti Billing ekranıyla, workspace saat dilimi sohbetten sonra (sayfada Ö1–Ö4)."],
      howto: "Sayfayı aşağı kaydır: önce bugünkü hâl ve sorunlar, sonra dört ek öneri."
    },
    {
      tab: "account", code: "H2", bl: "BL-339", kind: "question", qid: "q-bl339", title: "Preferences'taki \"System\" seçeneğinin adı", where: "Account → Preferences"
    },
    {
      tab: "notifications", code: "B1", bl: "soru listesinde G9 ve G8", old: true, title: "Bildirim merkezi, ayar sayfası ve telefon", where: "Notifications · Settings → Notifications",
      mode: "page", src: "embed/bildirim/index.html", orig: "https://claude.ai/artifact/M8yVRt1fWEY8Sg24ze8Wmv", origName: "Bildirim Varyantları",
      facts: [
        ["Ne", "7 Ekim'de bugünkü bildirim sistemi için \"direk söksün atsın\" dedin. Yerine gelecek üç parçanın varyantları: bildirim merkezi (A Tablo, B İki şerit, C Panel), Settings → Notifications (A Sayfa yok, B Salt okunur, C Üç anahtar), telefon."],
        ["Önce", "Görsel seçim altı model sorusuna bağlı (hangi kanal, workspace ayarı, karar kime gider…). Onlar görsel değil; sayfada yazılı (G8)."],
        ["Kim", "Herkes; ayar sayfası owner ve admin."]
      ],
      warn: "Sayfa 7–9 Ekim'de hazırlandı; bugünkü hâlin görüntüleri 7 Ekim'den. Notifications kutusunun görünüşü o günden beri değişmedi (yalnız klavye düzeltmesi girdi); Settings → Notifications'taki Reset düğmeleri 9 Ekim'den beri kırmızı ve iki tıkla çalışıyor.",
      asks: ["Bildirim merkezi: A, B ya da C?", "Settings → Notifications: A, B ya da C?", "Telefon: A, B ya da C?", "Altı model sorusu (sayfada yazılı, G8)."],
      howto: "Sayfanın üstündeki sekmelerle Original, merkez, telefon ve ayar varyantları arasında geç."
    },
    {
      tab: "announcements", code: "D2", proto: true, coding: true, bl: "Important Dates çekmecesi işi", title: "Duyuru çekmecesi: yeni düzen", where: "Announcements → + New → çekmece; Announcements → Important Dates",
      mode: "page", pages: [{ label: "Yeni düzen (12 Ekim)", src: "embed/duyuru/index.html" }, { label: "Original: önceki sürüm (11 Ekim)", src: "embed/duyuru/onceki-11-ekim.html" }],
      paneLabel: "Tıklanır prototip: içindeki \"Akış\" düğmeleriyle senaryo seç, rol seçiciyle kimin açtığını değiştir (pencerenin içinde kaydır)",
      orig: "https://claude.ai/artifact/FXWWvxLd3T9v5Qfy4112Mm", origName: "Tek çekmece prototipi (11. sürüm, 12 Ekim 6:45 AM)",
      facts: [
        ["Ne", "Duyuru ve önemli tarih tek çekmecede. Bu, 12 Ekim'de tarif ettiğin yeni düzen. Original burada aynı prototipin 11 Ekim sürümü: + New'de iki seçenekli menü, ayrı \"Important date\" türü, lokasyonlar Details sekmesinde, uyarılar alt şeritte."],
        ["Durum", "Kodlanıyor. Kod yazılmasını istedin; Important Dates çekmecesi thread'i bu prototipi (11. sürüm) uyguluyor. Açık soru yok. Prototip burada karşılaştırma için duruyor; kod main'e girince madde \"Karara bağlanmış\" listesine geçer."],
        ["Notların, 12 Ekim 3:39 AM", [
          "Important Dates, Announcements'ın alt sayfası; menüde de onun altında. Uygulandı.",
          "Sekmeler All, Draft, Scheduled, Published kalıyor; Archived eklendi.",
          "Liste iki tablo: üstte aktif (en yakın tarih önce), altta geçmiş ya da süresi dolmuş (en yeni önce).",
          "+ New menüsüz, doğrudan çekmeceyi açıyor.",
          "Details: Title, Category, Message; Add to Important Dates ve Add to Calendar kutuları; When (Starts, Ends, + Add time); Repeats; kaydırma çubuğu yok. Saat ekleme ve Add to Calendar'ın anlamı kart cevaplarınla netleşti.",
          "Lokasyonlar ve saatler ikinci sekmede, yeni açıklamayla (sekmenin adı \"Locations & publishing\"); When'deki saat açılış saatini değiştirmiyor.",
          "Publishing: Now ya da Schedule for later, sonra Publish on; Show on the Schedule kutusu; kaydırma yok.",
          "Add to Important Dates işaretlenince öbür iki kutu kendiliğinden işaretleniyor, istersen kapatılıyor; lokasyonun saati değişince de serbest.",
          "Audience: süzgeçten sonra kişi kişi aç/kapa; \"Always told\" yazısı kalktı; \"Ask people to acknowledge\" listenin altında.",
          "Shifts: daha temiz, hizalı; kaydırma normal.",
          "Alttaki kırmızı uyarılar kalktı; zorunlu alanın uyarısı kendi yerinde.",
          "Add to Important Dates işaretli kayıt yayınlanınca Important Dates sayfasında listeleniyor."
        ]],
        ["Notun, 12 Ekim 3:41 AM", "Yeni tasarım bu sayfanın Announcements sekmesine gelsin; notlar tarihli olsun, senaryolarla tıklanabilsin. Bu madde o istek."],
        ["Kart cevapların, 12 Ekim 4:21–4:23 AM", [
          "Add to Calendar: Schedule'da sol üstteki takvim düğmesinin açtığı ay takvimine girer. İşaretli yayınlanmış kaydın günü noktayla işaretli, kapalı gün kırmızı. Çalışanın My schedule ekranında da var.",
          "Bir lokasyonun saati değişince kutular serbest kalır. Show on the Schedule kapalıysa kapalı gün Schedule'da yalnız taralı görünür.",
          "Etkinliğe saat eklemek tek tık: + Add time saatleri açık getirir, Remove time ile geri alınır."
        ]],
        ["Notların, 12 Ekim 5:04–5:12 AM", [
          "Publish yerine Next: yeni duyuruda her sekmede Next, zorunlu alanlar dolunca açılır; son sekmede Publish.",
          "Now ve Schedule for later temiz, tek sırada; Publish on yanında.",
          "Alt şerit tek sıra: özet solda, düğmeler sağda.",
          "Ask people to acknowledge en altta, alt çizginin hemen üstünde; Audience listeleri aşağı kadar uzanıyor.",
          "Saat kutuları ve işaretli kutuların içi siyah değil: açık yeşil içli kutu, beyaz saat kutusu.",
          "Klavyeyle tarih ve saat yazma hatası düzeltildi: yarım değer okunmuyor, imleç kaybolmuyor.",
          "Yayındaki duyuruda Shifts ile History arasında Acknowledged sekmesi: kim onayladı, ne zaman; Remind düğmesi."
        ]],
        ["Notların, 12 Ekim 5:29 AM (sadeleştirme)", [
          "Alt şeritteki özet cümlesi kalktı; yalnız düğmeler.",
          "Publishing tek satır: Schedule for later kutusu, işaretlenince tarih ve saat aynı satırda; ikinci başlık kalktı.",
          "\"Publishes now → Starts → Past\" zaman şeridi kalktı.",
          "Audience: Add people ve Who gets it başlıkları, sağda gruplu liste, kilit işaretleri yok.",
          "History: Employees çekmecesindeki gibi noktalı zaman çizelgesi, oklarla."
        ]],
        ["Notun, 12 Ekim 5:43 AM", "History ters çevrildi: en yeni en üstte, oklar yukarı bakıyor."],
        ["Notların, 12 Ekim 6:29–6:30 AM (liste)", [
          "Announcements listesi: Status (en solda), Announcement, Published on; Audience sütunu yok.",
          "Published on: yayınlanmamışta çizgi; zamanlanmışta planlanan gün gri.",
          "Published altındaki \"Upcoming\" kalktı; \"Today\" kaldı.",
          "\"Newest first\" kalktı; \"Past and expired\" artık \"Past\".",
          "Sütun başlığına basınca sıralama, ikinci basış ters; ilk açılışta en yeni yayın üstte, tarihi olmayan en altta.",
          "Biten duyuru salt okunur: uyarı yok, yalnız Archive.",
          "Telefon görünümü de plana uygun, masaüstüyle birlikte kodlanır; bütün uygulamanın telefon görünümünün üstünden sonra geçeceksin."
        ]],
        ["Akışlar", "Prototipteki \"Akış\" düğmeleri: Thanksgiving, + New'den Important Dates'e ve Schedule takvimine · zamanlanmış yayın · geri alma ve Archived · bugün kapanış · etkinlik saati ve kişi kişi seçim · çakışma ve saat sınırları · düz duyuru: Ends, Past, Couldn't publish · yetki: müdür ve şef · çalışan ekranları · serbest."],
        ["Kim", "Owner, admin, manager yazar; çalışan duyuruyu ve önemli tarihi görür (prototipte rol seçici var)."],
        ["Sahibi", "Important Dates çekmecesi thread'i; cevabını o thread'e iletirim."]
      ],
      howto: "Kutunun üstünden \"Yeni düzen\" ile \"Original\" arasında geç. Prototipin içinde \"Akış\" düğmesiyle bir senaryo seç (ör. Thanksgiving), adımları tıklayarak ilerle; masaüstü ve telefon yan yana çalışır. Değişiklik istersen kendi cümlenle yaz; kodlayan thread'e iletirim."
    },
    {
      tab: "announcements", code: "D1", bl: "EKRAN-07, S1 sorusu", old: true, title: "Yayındaki duyuruda Unpublish düğmesinin yeri", where: "Announcements → duyuru penceresi",
      mode: "page", src: "embed/eski/republish.html", orig: "https://claude.ai/artifact/6YJ3MmXnmAJMY7JYGboWj6", origName: "Republish Acknowledgements",
      facts: [
        ["Ne", "Duyuru penceresinin kuralları 4–5 Ekim'de kararlaştı; tek açık nokta yayındaki duyuruda Unpublish düğmesinin nerede duracağı. Sayfa onu sol altta gösteriyor; bu bir öneri, sen seçmedin."],
        ["Kim", "Owner, admin, manager."]
      ],
      warn: "Sayfa 5 Ekim'den; demo adları eski (Kadıköy, Ayşe). Duyuru ile önemli tarihi tek çekmecede birleştirme planı (Important Dates thread'i, şimdilik duraklatıldı) bu pencereyi değiştirebilir.",
      asks: ["Unpublish sol altta mı kalsın, başka bir yerde mi olsun? (kendi cümlenle)"], howto: "Sayfada bir duyuru aç (ör. \"New fall menu tasting\"); pencerenin altındaki düğmelere bak."
    }
  ];

  var TABS = [
    { id: "schedule", name: "Schedule", route: "/app/schedule", text: "Schedule ızgarası, üst çubuk ve pencereleri. Telefonda Schedule kapalı olduğu için çoğu madde yalnız masaüstünde." },
    { id: "requests", name: "Requests", route: "/app/schedule/requests", text: "İzin, takas ve vardiya değişikliği talepleri." },
    { id: "employees", name: "Employees", route: "/app/employees", text: "Çalışan listesi ve çalışan çekmecesi. Müsaitlik işareti maddesi çalışanın kendi My Availability ekranını da kapsar." },
    { id: "settings", name: "Settings", route: "/app/settings/…", text: "Workspace ayarları." },
    { id: "workspace", name: "Workspace", route: "/app", text: "Ana sayfa." },
    { id: "account", name: "Account", route: "/app/account/…", text: "Kişinin kendi hesap sayfaları." },
    { id: "notifications", name: "Notifications", route: "/app/notifications", text: "Bildirim kutusu ve bildirim ayarları." },
    { id: "announcements", name: "Announcements", route: "/app/announcements", text: "Duyurular." },
    { id: "kabuk", name: "Kabuk (sol menü)", route: "her sayfa", text: "Her sayfada duran sol menü, telefon alt menüsü ve hesap menüsü." },
    { id: "ortak", name: "Birden çok ekran", route: "", text: "Birden çok ekranı birlikte etkileyen görsel kararlar." },
    { id: "out", name: "Sayfada olmayanlar", route: "", text: "Bu sayfaya alınmayan, bekletilen ya da karara bağlanmış maddeler ve nedenleri." }
  ];

  // Visual decisions that still need their variants drawn; listed so nothing is lost.
  var TODO = {
    employees: ["<b>Çalışan çekmecesinin alt çubuğu telefonda taşıyor</b>: iki satıra mı insin, rol seçici gövdeye mi geçsin? Varyant çizilecek (BL-425)."],
    settings: ["<b>Belge yayınlama penceresinin yerleşimi</b> (Settings → Documents → Publish / Unpublish): asıl etki, yani kaç kişiden belge istenecek, en altta kalıyor. Varyant çizilecek (BL-852)."],
    workspace: ["<b>Workspace sayfasının başlığı</b>: liste sayfalarındaki başlık iskeleti mi, selamlama + tarih mi, bugünkü hâl mi? Varyant çizilecek (BL-815, Soru-22)."],
    ortak: [
      "<b>Liste tablolarında sıralama oku</b>: hep mi görünsün, yalnız üzerine gelince ve odakta mı? (Soru-2)",
      "<b>Sol menüde hesap düğmesi ve workspace değiştirici</b>: tek denetim mi olsun, ayrı mı kalsın? (BL-073)",
      "<b>Availability ekranı telefonda</b>: kart satırı mı, yapışkan sütunlu tablo mu, \"Available on a computer\" mı? (Soru-22)"
    ]
  };

  var OUT = [
    { h: "Bekletilenler (yalnız liste)", items: [
      "<b>Giriş, davet ve kurulum ekranları</b> (sign in, accept invitation, owner setup): e-posta servisi gelene kadar bekliyor (S-118). Açık görsel maddeler: giriş ekranları için dört soru (G4–G7), Giriş ve Katılım Keşfi'ndeki 14 seçim (<a href=\"https://claude.ai/artifact/PEYuSjGWXGN9dkb9LipikY\" target=\"_blank\" rel=\"noopener\">sayfa</a>), Giriş Tasarım Kitabı (<a href=\"https://claude.ai/artifact/BZkoou6GKHrEwcwoDZYqQu\" target=\"_blank\" rel=\"noopener\">sayfa</a>), giriş ve kurulum ekranlarının beş backlog maddesi (BL-927, BL-929, BL-930, BL-151, BL-950). Sen \"başla\" deyince bu sayfaya kendi sekmesiyle gelir.",
      "<b>Design tuvali</b> (<a href=\"https://claude.ai/artifact/4AGPsoDPMS4gS9M2rup6sZ\" target=\"_blank\" rel=\"noopener\">sayfa</a>): dokunulmuyor; eski çizimlerin silinmesi ayrı soru."
    ] },
    { h: "Karara bağlanmış ya da yerini yenisine bırakmış", items: [
      "<b>Availability tercih olarak: giriş ve okuma ekranı</b> (çalışan: My Availability ve onboarding; müdür: Availability sayfası, çekmece, Schedule): 13 Ekim 7:43 AM'de yeni beş mockup'tan 4 · Day by day'i seçtin: solda günler, sağda seçilen günün büyük ekranı, Available / Some hours / Unavailable ve saat kaydırıcısı, \"Same for other days\". Important Dates çekmecesi thread'i sıradaki adımı yürütüyor (eski E3).",
      "<b>Müsaitlik işaretleri: kırmızı mı, amber mı?</b> (Employees çekmecesi · My Availability): availability seçimiyle kapandı; Day by day dahil beş mockup'ın hepsinde müsaitlik rengi her yerde turuncu, hata satırları kırmızı kalır (eski E1).",
      "<b>Vardiya değişikliği türlerine ikon</b> (Requests → Shift changes · masaüstü ve telefon): 13 Ekim 5:28 PM'de önerilenleri kabul ettin: Pickup Raised hand, Cover Steps in, Swap iki ok. Takas kırmızı düğmeler thread'i yürütüyor (eski R5).",
      "<b>Sol menünün tepesindeki gizli workspace seçici</b> (sol menü en üst · telefonda More): 13 Ekim 7:05 AM'de seçiciyi Settings'in üstüne taşımayı istedin; bu D oldu ve kodlanıyor. Tepede workspace adı menü düğmesinin yanında düz yazı olarak kalıyor. Original, A, B ve C artık sorulmuyor (eski K1; Sol menüdeki gizli workspace seçici thread'i).",
      "<b>Audience sekmesi: toparlama</b> (Announcements → duyuru çekmecesi → Audience): 12 Ekim 5:42 PM'de C'yi seçtin, kodlandı: tek liste, \"Who gets it\" bütün genişlikte, sağ üstte \"+ Add people\"; Original, A ve B silindi. İki değişikliğin de yapıldı: \"Archive: unpublish first\" yazısı bütün çekmecelerden kalktı; telefonda alt satırda Unpublish ve yeşil düğme yan yana, \"Ask people to acknowledge\" en altta ve \"Who gets it\" listesi ona kadar uzuyor. Kod trene hazır. Son hâli deneme sayfasında (<a href=\"https://claude.ai/artifact/1tUcSJNCQhECQDtpjj6b9V\" target=\"_blank\" rel=\"noopener\">sayfa</a>) (eski D3; Important Dates çekmecesi thread'i).",
      "<b>New Schedule penceresi geniş tablo, içinde Export ve Templates</b> (Schedule → sağ üst New Schedule): 12 Ekim 5:00 PM'de B'yi seçtin: pencerenin en üst satırında, tarih başlığının yerinde Schedules, Templates ve Export sekmeleri; Templates'te sağ üstte Save template. Şablon akışı 3:57 PM'de onayladığın gibi (önizleme, kalemle düzenleme, Use ile Add / Replace ya da önce hangi programa yazılacağı). Ek olarak Schedules sekmesi Templates kadar sıkı olacak ve Open (açık vardiya) sütunu kalkacak. Uygulamayı \"Üst çubuk ve Schedule pencereleri\" thread'i yapıyor (eski S18).",
      "<b>Duyuru çekmecesi: yeni düzen</b> (Announcements → + New; Announcements → Important Dates): 12 Ekim sabahı notlarınla ve kart cevaplarınla son hâlini aldı (prototip 11. sürüm, <a href=\"https://claude.ai/artifact/FXWWvxLd3T9v5Qfy4112Mm\" target=\"_blank\" rel=\"noopener\">sayfa</a>). 12 Ekim öğleden sonra main'e ve canlıya girdi (main 3dd4acb9) (eski D2; Important Dates çekmecesi işi).",
      "<b>Vardiya kartında yayın işaretleri ve kart düzeni</b> (Schedule, düzenleme modu): 12 Ekim 7:03–7:13 AM'de kart kataloğu sayfasına (<a href=\"https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL\" target=\"_blank\" rel=\"noopener\">sayfa</a>) bıraktığın 9 yorumla seçtin: yayındaki kartın sağ üstünde yeşil LIVE; düzenlenen yayın kartında Edited yerine NEW, şerit ve kalem yok; silinecek kartta bulut simgesi yok; LIVE kartta turuncu ünlem satır başında çalışanın adının yanında; işaretler yazıya hiç değmez, yazı ortalı; ghost kartta konum iğnesi büyür; Saving şeridi yerine sağ üstte dönen işaret; kapalı gün izinli hücre gibi, CLOSED yalnız üzerine gelince; izinli hücreye sürüklerken \"Can't place a shift here\" yazısı yok. İlk turdaki Live 1–3 ve Edited 1–3 bunların yerine geçti. Kod, sen \"kodla\" diyene kadar bekliyor (eski S16; Vardiya kartı, hayalet vardiya ve sürükleme thread'i).",
      "<b>Açılamayan talep bağlantısı</b> (Requests, müdür bildirimden açınca): 12 Ekim 6:50 AM'de D'yi seçtin. Requests sayfası açılır, tablonun yerinde Requests'in kendi boş hâli ve beyaz \"Show all requests\" düğmesi; cümle \"This request is no longer available.\" (6:44 AM). Uygulamayı \"Eski Shift Hub yönetici ekranları\" thread'i yapıyor (eski R1; BL-1024).",
      "<b>Shift types sayfası yeni liste dilinde</b> (Settings → Shift catalog): 12 Ekim 5:45 AM'de A'yı seçtin: tek sayfa, Shift types ve Shift labels sayfanın içinde sekme. Ek olarak arama çubuğu tam genişlik olacak ve \"Active\" yazan açılır süzgeç kalkacak. Uygulamayı \"Başlangıç bitişe eşit uyarı metni\" thread'i yapıyor (eski A6).",
      "<b>İki lokasyonun haftası ekrana sığmıyor</b> (Schedule → All locations - Separate, 1440 ekran): 12 Ekim sabahı A'yı seçtin. Her lokasyonun haftası bir ekrana sığacak, kart yazısı kelime arasından alt satıra geçecek. \"Çok lokasyonlu haftada rozet taşması\" thread'inin A ile kodlanmış dalı trene girecek (eski S14; BL-682).",
      "<b>Geçmiş haftada kayıtlı taslak satırı</b> (Schedule → New Schedule menüsü): 11 Ekim akşamı A'yı seçtin, satıra \"Read-only\" etiketi ve \"Past week: you can view it, not edit it.\" açıklaması gelecek. Kodlanması için iş açılacak (eski S12; BL-723, 2. madde).",
      "<b>Mini takvimde haftanın başındaki noktalar</b> (Schedule → takvim düğmesi): 11 Ekim akşamı bugünkü hâli kalsın dedin. Ayrıca bir hata buldun: seçili haftanın turuncu bandındaki günlerin üzerine gelince hiçbir efekt çıkmıyor; diğer günlerdeki efekt orada da çıkacak. Koda baktım, tahminin doğru: turuncu bant rengi efektin rengini eziyor. Kodlanması için iş açılacak (eski S13; BL-723, 3. madde).",
      "<b>Eski ghost kart dalları</b> (<a href=\"https://claude.ai/artifact/LzLBAoEfPikvF3bxop8US7\" target=\"_blank\" rel=\"noopener\">sayfa</a>) ve 9 Ekim'in 20 ghost varyantı (eski Schedule sayfasında madde 10): 11 ve 12 Ekim'de ghost kart için yeni tarif verdin; şimdi S15'te soruluyor. Eski denemeler arşiv dalında yedekli.",
      "<b>FB-6.7 ekran varyantları</b> (<a href=\"https://claude.ai/artifact/EzDeoXWUFVKy8GBNabj4Hz\" target=\"_blank\" rel=\"noopener\">sayfa</a>): seçimlerin yapılmış (B1 A, B2 A, B3 A, C1 B, C2 A). Bekleyen tek şey sayfanın Original görünümünün açılıp açılmadığını teyit etmendi; görsel karar değil.",
      "<b>Important Dates çekmecesi, Soru 1–3</b> (<a href=\"https://claude.ai/artifact/LhdocLQ2tCScFrANYHag2Z\" target=\"_blank\" rel=\"noopener\">doküman</a>): saat ve yayın modeli soruları, görsel değil; \"Important Dates çekmecesi A uygulaması\" thread'inde bekliyor.",
      "<b>Onaylı izin hücresine tıklama</b> (eski Schedule sayfasında madde 6): 10 Ekim'de karar verdin, tam gün izinde Add shift açılmaz; kodda.",
      "<b>Templates penceresi</b>: 9 Ekim'de A, B, C reddedildi. 12 Ekim'de Templates ayrı pencere olmaktan çıktı, New Schedule penceresinin bir sekmesi oldu (eski S18, B).",
      "<b>Sağ üst pencere stilleri</b> (28 Eylül): stil B seçilmişti (KARARLAR). 12 Ekim'de New Schedule penceresi yeni tasarımla (eski S18, B) değişti.",
      "<b>Requests H2 takas penceresi</b>: kilitli, canlıda.",
      "<b>Jobs S1, S2</b>: düz Jobs listesi kalktı; sıralama kalıyor.",
      "<b>Employees telefon düzeni</b>: kişi başına kart, kararlı.",
      "<b>Telefon kuralları maskesi</b>: A seçildi (proje dosyasındaki liste bunu hâlâ \"karar bekliyor\" gösteriyor; düzeltilecek)."
    ] },
    { h: "Görsel olmayan açık sorular (başka yerde soruluyor)", items: [
      "Undo'nun ekranda görünmeyen bir adımı geri alması (BL-997); belge çekmecede mi açılsın, indirilsin mi (BL-829); çalışan çekmecesinde \"Cancel\" mı \"Close\" mı (BL-408); uygulama geneli renk kuralı, ertelendi (BL-117); bildirim sisteminin altı model sorusu (G8); workspace saat dilimi (G3); Jobs'ta grup katlama ve arşivli departmanlar (Soru-26, Soru-27); takas penceresindeki iki metin sorusu (G13, 1. ve 2. madde)."
    ] },
    { h: "Artık geçersiz", items: [
      "<b>New Schedule penceresi</b> (eski Schedule sayfasında madde 2) ve <b>Export menüsü</b> (madde 5): 9 Ekim'deki 1–5 varyantları ve 28 Eylül / 16 Eylül turları. 12 Ekim'de New Schedule penceresi için B'yi seçtin; Export o pencerenin bir sekmesi oldu, ayrı Export menüsü kalkıyor (eski S3, S4).",
      "<b>Yayındaki duyuruda Unpublish düğmesinin yeri</b> (eski duyuru penceresi, 5 Ekim): o pencere kalktı. Yeni duyuru çekmecesinde Unpublish, yayındaki duyurunun sol altında kırmızı, iki tıkla çalışan düğme; 12 Ekim akşamı yanındaki \"Archive: unpublish first\" notu da kalktı (Audience kararınla). Bu yerleşim onayladığın prototipten (11. sürüm) geldi ve canlıda (main 3dd4acb9) (eski D1).",
      "Telefonda Schedule ad sütunu: Schedule telefonda kapalı (BL-718). Üst çubuk ve liste sayfalarındaki gri tonu: seçilen renk kodda (BL-450, BL-600). Kapanmış bir madde (BL-430)."
    ] }
  ];

  // Decided items leave their tab; their line lives in OUT "Karara bağlanmış".
  var DECIDED = { "BL-723 (2)": 1, "BL-723 (3)": 1, "BL-682": 1, "Başlangıç bitişe eşit uyarı metni thread'i": 1, "BL-1024": 1 };
  var DECIDED_CODE = { S16: 1, D2: 1, D1: 1, S18: 1, S3: 1, S4: 1, D3: 1, K1: 1, E3: 1, E1: 1, R5: 1 };
  var ALL = ITEMS.concat(EMBEDS).filter(function (it) { return !DECIDED[it.bl] && !DECIDED_CODE[it.code]; });
  function itemsOf(tab) {
    return ALL.filter(function (it) { return it.tab === tab; }).sort(function (a, b) { return parseInt(a.code.slice(1), 10) - parseInt(b.code.slice(1), 10); });
  }

  var G = { tab: "schedule", item: 0, view: 0, v: 0 };
  try {
    var saved = JSON.parse(localStorage.getItem("nf.gorsel.tabs") || "{}");
    if (saved.tab && TABS.some(function (t) { return t.id === saved.tab; })) { G.tab = saved.tab; G.item = saved.item || 0; }
  } catch (e) {}
  var hash = (location.hash || "").slice(1).toLowerCase();
  if (hash) {
    TABS.forEach(function (t) { if (t.id === hash) { G.tab = t.id; G.item = 0; } });
    ALL.forEach(function (it) { if (it.code.toLowerCase() === hash) { G.tab = it.tab; G.item = itemsOf(it.tab).indexOf(it); } });
  }
  var frames = { desktop: null, phone: null };
  var mountId = 0;

  function list() { return itemsOf(G.tab); }
  function item() { var l = list(); return l[G.item] || l[0]; }
  function view() { return item().views[G.view] || item().views[0]; }
  function variant() { return item().variants[G.v] || item().variants[0]; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function save() { try { localStorage.setItem("nf.gorsel.tabs", JSON.stringify({ tab: G.tab, item: G.item })); } catch (e) {} }

  function renderTabs() {
    var box = document.getElementById("tabs"); box.textContent = "";
    TABS.forEach(function (t) {
      var b = el("button", "tab"); b.type = "button"; b.setAttribute("role", "tab"); b.dataset.tab = t.id;
      b.setAttribute("aria-selected", String(t.id === G.tab));
      b.appendChild(document.createTextNode(t.name));
      var n = t.id === "out" ? 0 : itemsOf(t.id).length + (TODO[t.id] ? TODO[t.id].length : 0);
      if (n) b.appendChild(el("span", "c", String(n)));
      box.appendChild(b);
    });
    var t = TABS.filter(function (x) { return x.id === G.tab; })[0];
    var head = document.getElementById("tabhead"); head.textContent = "";
    var h = el("h2", null, t.name + " "); if (t.route) h.appendChild(el("span", "bl", t.route));
    head.appendChild(h); head.appendChild(el("p", null, t.text));
    var out = G.tab === "out";
    document.getElementById("items").hidden = out || !list().length;
    document.getElementById("empty-tab").hidden = out || !!list().length;
    document.getElementById("detail").hidden = out || !list().length;
    document.getElementById("out").hidden = !out;
    var todo = document.getElementById("todo"); todo.textContent = "";
    var rows = TODO[G.tab] || [];
    todo.hidden = !rows.length;
    if (rows.length) {
      todo.appendChild(el("h3", null, "Varyantı henüz çizilmemiş görsel kararlar"));
      var ul = el("ul"); rows.forEach(function (r) { var li = el("li"); li.innerHTML = r; ul.appendChild(li); }); todo.appendChild(ul);
    }
  }
  function renderOut() {
    var box = document.getElementById("out"); box.textContent = "";
    OUT.forEach(function (s) {
      var sec = el("section"); sec.appendChild(el("h3", null, s.h));
      var ul = el("ul"); s.items.forEach(function (r) { var li = el("li"); li.innerHTML = r; ul.appendChild(li); }); sec.appendChild(ul);
      box.appendChild(sec);
    });
  }
  function renderItems() {
    var box = document.getElementById("items"); box.textContent = "";
    list().forEach(function (it, i) {
      var b = el("button", "item"); b.type = "button"; b.dataset.i = i;
      b.setAttribute("aria-pressed", String(i === G.item));
      var n = el("span", "n"); n.appendChild(el("b", null, it.code));
      if (it.kind === "question") n.appendChild(el("span", "kind q", "soru"));
      else if (it.tag) n.appendChild(el("span", "kind", it.tag));
      else if (it.coding) n.appendChild(el("span", "kind", "kodlanıyor"));
      else if (it.proto) n.appendChild(el("span", "kind q", "prototip, kod yok"));
      else if (it.old) n.appendChild(el("span", "kind old", "eski yapım"));
      else n.appendChild(el("span", "kind", "bugünkü main"));
      b.appendChild(n); b.appendChild(el("span", "t", it.title)); b.appendChild(el("span", "w", it.where));
      box.appendChild(b);
    });
  }
  function show(id, on) { document.getElementById(id).hidden = !on; }
  function renderDetail() {
    var it = item(); if (!it) return;
    var t = document.getElementById("d-title"); t.textContent = "";
    t.appendChild(el("span", "code", it.code)); t.appendChild(document.createTextNode(" " + it.title + " ")); t.appendChild(el("span", "paren", "(" + it.bl.replace(/ · /g, ", ") + ")"));
    var f = document.getElementById("d-facts"); f.textContent = "";
    (it.facts || []).forEach(function (p) {
      f.appendChild(el("dt", null, p[0]));
      if (!Array.isArray(p[1])) { f.appendChild(el("dd", null, p[1])); return; }
      var dd = el("dd"), ol = el("ol", "notes"); p[1].forEach(function (n) { ol.appendChild(el("li", null, n)); }); dd.appendChild(ol); f.appendChild(dd);
    });
    if (it.orig) {
      f.appendChild(el("dt", null, "İlk sayfası"));
      var dd = el("dd"); var a = el("a", "open-orig", it.origName + " ↗"); a.href = it.orig; a.target = "_blank"; a.rel = "noopener"; dd.appendChild(a); f.appendChild(dd);
    }
    (it.links || []).forEach(function (l) {
      f.appendChild(el("dt", null, l[0]));
      var dd = el("dd"); var a = el("a", "open-orig", l[1] + " ↗"); a.href = l[2]; a.target = "_blank"; a.rel = "noopener"; dd.appendChild(a); f.appendChild(dd);
    });
    show("d-facts", !!(it.facts || it.orig));
    var w = document.getElementById("d-warn"); w.textContent = it.warn || ""; show("d-warn", !!it.warn);
    var asks = document.getElementById("d-asks"); asks.textContent = "";
    (it.asks || []).forEach(function (q) { asks.appendChild(el("li", null, q)); });
    if (it.asks && it.asks.length) asks.appendChild(el("li", null, "Yazarak cevap vereceğim."));
    show("d-asks", !!(it.asks && it.asks.length));
    show("d-live", it.kind === "live");
    var q = document.getElementById("d-q"); q.textContent = "";
    if (it.kind === "question") q.appendChild(document.getElementById(it.qid).content.cloneNode(true));
    show("d-q", it.kind === "question");
    if (it.kind === "live") {
      var vw = document.getElementById("d-views"); vw.textContent = "";
      it.views.forEach(function (v, i) { var b = el("button", null, v.label); b.type = "button"; b.dataset.view = i; b.setAttribute("aria-pressed", String(i === G.view)); vw.appendChild(b); });
      var vs = document.getElementById("d-variants"); vs.textContent = "";
      it.variants.forEach(function (v, i) {
        var b = el("button", "v"); b.type = "button"; b.dataset.v = i; b.setAttribute("aria-pressed", String(i === G.v));
        var k = el("span", "k", v.k === "Original" ? "Original" : "Varyant " + v.k); if (v.rec) k.appendChild(el("span", "rec", "Önerim"));
        b.appendChild(k); b.appendChild(el("span", "d", v.d)); vs.appendChild(b);
      });
    }
    var mine = document.getElementById("d-mine"); mine.textContent = it.mine || ""; show("d-mine", !!it.mine);
    var note = document.getElementById("d-note"); note.textContent = it.kind === "live" ? (it.note || "") : (it.howto || ""); show("d-note", !!note.textContent);
  }

  function send(win, extra) {
    if (!win || item().kind !== "live") return;
    var v = variant();
    var m = { nf: "variant", key: item().bl + ":" + v.k, css: v.css };
    if (extra) for (var k in extra) m[k] = extra[k];
    try { win.postMessage(m, "*"); } catch (e) {}
  }
  function stageLive() {
    var stage = document.getElementById("d-stage");
    stage.innerHTML = '<div class="frames" id="frames"><div class="pane" style="flex:1 1 auto"><span class="pane-label">Masaüstü 1440 <span id="desk-scale"></span></span><div class="desk-fit" id="desk-fit"><div class="desk" id="desk"></div></div></div><div class="pane" style="flex:0 0 auto"><span class="pane-label">Telefon 390</span><div class="phone-fit" id="phone-fit"><div class="phone-shell"><div id="phone"></div></div></div></div></div>';
    var id = ++mountId, loaded = 0, vw = view();
    ["desktop", "phone"].forEach(function (name) {
      var host = document.getElementById(name === "desktop" ? "desk" : "phone");
      var fr = document.createElement("iframe");
      var params = "s=" + encodeURIComponent(vw.s) + "&sc=" + encodeURIComponent(vw.sc) + "&role=" + encodeURIComponent(vw.role) + "&frame=" + name + "&n=" + Date.now();
      fr.name = "pages:" + params;
      fr.title = (name === "desktop" ? "Masaüstü" : "Telefon") + " görünümü, " + vw.label;
      fr.addEventListener("load", function () {
        if (id !== mountId) return;
        loaded += 1;
        send(fr.contentWindow); // the look, at once
        if (loaded === 2) {
          // Both frames have reset their demo data; only now change it, then click.
          setTimeout(function () {
            if (id !== mountId) return;
            [frames.desktop, frames.phone].forEach(function (one) { send(one && one.contentWindow, { seed: vw.seed, go: vw.go, steps: vw.steps }); });
          }, 1100);
        }
      });
      fr.src = vw.file + "#" + params;
      host.appendChild(fr);
      frames[name] = fr;
    });
  }
  function stageEmbed() {
    ++mountId; frames = { desktop: null, phone: null };
    var it = item(), stage = document.getElementById("d-stage");
    if (it.mode === "app") {
      stage.innerHTML = '<div class="pane"><span class="pane-label">' + (it.paneLabel ? it.paneLabel + ' <span id="desk-scale"></span>' : 'Masaüstü 1440 <span id="desk-scale"></span> · eski sayfanın kendisi') + '</span><div class="desk-fit" id="desk-fit"><div class="desk" id="desk"></div></div></div>';
    } else {
      stage.innerHTML = '<div class="pane"><span class="pane-label">' + (it.paneLabel || "Eski sayfanın kendisi (kendi düğmeleriyle; pencerenin içinde kaydır)") + '</span><div class="pills" id="e-pages" hidden></div><div class="pagebox" id="pagebox"></div></div>';
    }
    var src = it.src;
    if (it.pages) {
      var pp = document.getElementById("e-pages"); pp.hidden = false;
      var at = it.pages[G.view] ? G.view : 0; src = it.pages[at].src;
      it.pages.forEach(function (pg, i) { var b = el("button", null, pg.label); b.type = "button"; b.dataset.epage = i; b.setAttribute("aria-pressed", String(i === at)); pp.appendChild(b); });
    }
    var fr = document.createElement("iframe");
    fr.title = it.title; fr.src = src;
    document.getElementById(it.mode === "app" ? "desk" : "pagebox").appendChild(fr);
  }
  function mount() {
    var it = item(), stage = document.getElementById("d-stage");
    if (!it || it.kind === "question") { ++mountId; stage.textContent = ""; return; }
    if (it.kind === "live") stageLive(); else stageEmbed();
    fit();
  }
  function restyle() { send(frames.desktop && frames.desktop.contentWindow); send(frames.phone && frames.phone.contentWindow); }
  // Each frame's saves and moves go to the other frame (as on every PAGES page).
  window.addEventListener("message", function (event) {
    var m = event.data;
    if (!m || m.nf !== "pages") return;
    var other = event.source === (frames.desktop && frames.desktop.contentWindow) ? frames.phone
      : event.source === (frames.phone && frames.phone.contentWindow) ? frames.desktop : null;
    if (other && other.contentWindow) other.contentWindow.postMessage(m, "*");
  });
  function fit() {
    var desk = document.getElementById("desk"); if (!desk) return;
    var box = document.getElementById("frames");
    var width = document.getElementById("d-stage").clientWidth;
    var phoneFit = document.getElementById("phone-fit");
    var side = !!phoneFit && (width - 410 - 24) / 1440 >= 0.5;
    if (box) box.dataset.layout = side ? "side" : "stack";
    var deskWidth = side ? width - 410 - 24 : width;
    var scale = Math.min(1, deskWidth / 1440);
    desk.style.transform = scale < 1 ? "scale(" + scale + ")" : "";
    var deskFit = document.getElementById("desk-fit");
    deskFit.style.width = Math.max(0, deskWidth) + "px";
    deskFit.style.height = Math.round(900 * scale) + "px";
    document.getElementById("desk-scale").textContent = "· %" + Math.round(scale * 100);
    if (phoneFit) {
      var phone = phoneFit.firstElementChild;
      var pScale = Math.min(1, width / 410);
      phone.style.transform = pScale < 1 ? "scale(" + pScale + ")" : "";
      phoneFit.style.width = Math.round(410 * pScale) + "px";
      phoneFit.style.height = Math.round(864 * pScale) + "px";
    }
  }
  function renderAll() { renderTabs(); renderItems(); renderDetail(); mount(); }
  document.addEventListener("click", function (event) {
    var t = event.target.closest ? event.target : null; if (!t) return;
    var ep = t.closest("[data-epage]");
    if (ep) { G.view = +ep.dataset.epage; mount(); return; }
    var tab = t.closest("[data-tab]"), it = t.closest("[data-i]"), vw = t.closest("[data-view]"), v = t.closest("[data-v]");
    if (tab) { if (tab.dataset.tab === G.tab) return; G.tab = tab.dataset.tab; G.item = 0; G.view = 0; G.v = 0; save(); renderAll(); }
    else if (it) { G.item = +it.dataset.i; G.view = 0; G.v = 0; save(); renderItems(); renderDetail(); mount(); document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (vw) { G.view = +vw.dataset.view; renderDetail(); mount(); }
    else if (v) { G.v = +v.dataset.v; renderDetail(); restyle(); }
  });
  document.getElementById("restart").addEventListener("click", mount);
  try { new ResizeObserver(fit).observe(document.querySelector(".wrap")); } catch (e) { window.addEventListener("resize", fit); }
  renderOut();
  document.getElementById("foot").textContent = "Bu sayfa /oto backlog thread'inde tutuluyor; Mert'in 11 Ekim isteğiyle (California saatiyle öğleden sonra 1:15) bütün bekleyen görsel kararlar buraya, ekran sekmelerine toplandı. \"Bugünkü main\" etiketli maddeler PAGES'in güncel yapımında (main c900fb42) çalışır; \"eski yapım\" maddeler ilk sayfalarının kopyasıdır, ilk bağlantıları yerinde duruyor ve silinmedi. Varyantların hiçbiri kodda değil; seçtiğin varyant ayrı bir işte uygulanır.";
  renderAll();
})();
</script>
