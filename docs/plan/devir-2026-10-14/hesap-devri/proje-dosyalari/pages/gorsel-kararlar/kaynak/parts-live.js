  // Rules that every availability variant leaves red: they are errors, not availability.
  var KEEP_RED = ".weekly-settings-missing{color:#ba3446!important;background:#fff2f3!important}.weekly-preferences-footer .weekly-preferences-error{color:#ba3446!important}.weekly-time-range > input[aria-invalid=\"true\"]{border-color:#ba3446!important}";
  var AV = ".employee-weekly-workspace,.weekly-unavailable,.weekly-preferences-panel";
  var AMBER = "#d9730d", AMBER_TEXT = "#8a4a06";
  var amberMarks = ".weekly-unavailable-legend i.red{background:" + AMBER + "}.marked .weekly-day-name{border-color:" + AMBER + "}.weekly-all-day input:checked{background:" + AMBER + ";border-color:" + AMBER + "}.weekly-end-day input{accent-color:" + AMBER + "}";
  var TAG = ".weekly-preference-tag,.weekly-unavailable .weekly-shift-option.selected";

  var DOT = ".schedule-location-status-dot";
  var chip = DOT + "{width:auto;height:22px;margin:0 8px 0 0;padding:0 9px 0 7px;display:inline-flex;align-items:center;gap:6px;vertical-align:middle;border-radius:999px;transform:none!important;background:color-mix(in srgb,var(--schedule-location-status-color) 12%,#fff)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--schedule-location-status-color) 50%,#fff)!important}" +
    DOT + "::before{content:\"\";width:9px;height:9px;border-radius:50%;background:var(--schedule-location-status-color)}" +
    DOT + "[data-status=\"published\"]::after{content:\"Live\"}" + DOT + "[data-status=\"unpublished\"]::after{content:\"Not published\"}" + DOT + "[data-deadline=\"true\"]::after{content:\"Not published · week starts soon\"}" +
    DOT + "::after{font:700 12px/1 Inter,system-ui,sans-serif;letter-spacing:0;color:color-mix(in srgb,var(--schedule-location-status-color) 55%,#17221e);white-space:nowrap}";
  var check = DOT + "[data-status=\"published\"]{display:inline-grid;place-items:center;width:16px;height:16px;background:var(--schedule-location-status-color)!important}" +
    DOT + "[data-status=\"published\"]::after{content:\"\";position:absolute;left:4px;top:4.5px;width:7px;height:3.5px;border-left:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(-45deg)}";
  var shapes = check +
    DOT + "[data-status=\"unpublished\"]{width:16px;height:16px;background:#fff!important;box-shadow:inset 0 0 0 2.5px #8c9691,0 0 0 2px #fff!important}" +
    DOT + "[data-deadline=\"true\"]{display:inline-grid;place-items:center;background:#dc2626!important;box-shadow:0 0 0 2px #fff,0 2px 5px rgba(220,38,38,.38)!important}" +
    DOT + "[data-deadline=\"true\"]::after{content:\"!\";position:absolute;inset:0;text-align:center;color:#fff;font:800 11px/16px Inter,system-ui,sans-serif}";
  var chipUnpub = chip.split(DOT).join(DOT + "[data-status=\"unpublished\"]");

  var ROW = ".schedule-draft-menu-row[data-draft-row]:not(:has(button))";

  var BACK = ".schedule-logo-dialog-layer .schedule-dialog-backdrop";

  var CTRL = ".scheduling-form .setting-control select,.scheduling-form .setting-control input:not([type=checkbox]):not([type=radio]),.conflict-setting-controls select";
  // The minutes boxes already use small type; only their height follows.
  var MIN = ".conflict-minimum-field input";

  var DISC = ".notification-disclosure:hover";

  var ITEMS = [
    {
      bl: "BL-1029 · BL-843", title: "Müsaitlik işaretleri: kırmızı mı, amber mı?", where: "Employees çekmecesi · My Availability",
      facts: [
        ["Ne", "Bir çalışanın \"bu saatlerde çalışamam\" işaretleri (müsaitlik) bugün kırmızı: gün çizgisi, saat hapı, \"All day\" anahtarı, açıklamadaki nokta, bütün gün işaretli satırın pembe zemini."],
        ["Nerede", "Employees → çalışana tıkla → çekmecede Availability bölümü (müdür ve owner görür); çalışanın kendi ekranı My Availability → Availability sekmesi. Aynı bileşen onboarding'de de var."],
        ["Kim", "Owner, admin, manager (çekmece); çalışan (My Availability)."],
        ["Neden soruluyor", "Kuralımız \"amber müsaitlik, kırmızı izin\" (KARARLAR, Schedule hücre renkleri). Aynı veri Availability listesinde amber, Schedule'da turuncu \"!\". Çekmecede kırmızı görünce müdür bunu izin sanabilir. Örnek: Priya Patel Pazartesi 12:00 AM - 2:00 PM çalışamıyor; çekmecede kırmızı hap görünüyor."],
        ["Değişmeyen", "Hata satırları kırmızı kalır (\"kaydedilemedi\", geçersiz saat kutusu): onlar müsaitlik değil, hata."]
      ],
      views: [
        { id: "drawer", label: "Employees çekmecesi · Priya Patel", file: "app.html", s: "4.0", sc: "drawer", role: "owner", go: "/app/employees?employeeId=00000603-0000-4000-8000-000000000603&section=availability" },
        { id: "mine", label: "My Availability · Maria Lopez", file: "app.html", s: "7.3", sc: "week", role: "employee", steps: [{ click: "input[aria-label=\"Friday all day unavailable\"]" }, { click: "text=Add hours on Tuesday" }] }
      ],
      note: "My Availability penceresi açılınca Maria'nın Salı'sına 9:00 AM - 5:00 PM ve Cuma'sına \"All day\" kendiliğinden işaretlenir (kaydedilmez), işaretler görünsün diye. Sen de anahtarlarla oynayabilirsin.",
      mine: "Önerim A: Availability listesi ve Schedule ile birebir aynı amber; üç ekran aynı dili konuşur. Dayanak: KARARLAR Schedule hücre renkleri (amber müsaitlik, kırmızı izin).",
      variants: [
        { k: "Original", d: "Bugünkü hâl: kırmızı hap, kırmızı gün çizgisi, kırmızı anahtar, pembe satır.", css: "" },
        { k: "A", rec: true, d: "Liste amberi: hap Availability listesindeki gibi açık turuncu zemin ve kahverengi yazı; gün çizgisi, anahtar ve nokta turuncu.", css: AV + "{--wp-red:" + AMBER_TEXT + ";--wp-red-bg:#fff1e2}" + amberMarks + TAG + "{border-color:color-mix(in srgb," + AMBER + " 40%,#fff)}" + KEEP_RED },
        { k: "B", d: "Beyaz hap, turuncu çerçeve: zemin boyanmaz; hap beyaz, turuncu kenarlı. Bütün gün işaretli satırda yalnız soldan kalın turuncu şerit.", css: AV + "{--wp-red:" + AMBER_TEXT + ";--wp-red-bg:#fff}" + amberMarks + TAG + "{background:#fff!important;border:1.5px solid " + AMBER + "!important;color:" + AMBER_TEXT + "!important}.weekly-unavailable-day.whole-day{background:#fff!important;box-shadow:inset 3px 0 0 " + AMBER + "}" + KEEP_RED },
        { k: "C", d: "Sade hap, turuncu nokta: hap gri ve sakin, başında küçük turuncu nokta; bütün gün işaretli satır açık sarı.", css: AV + "{--wp-red:" + AMBER_TEXT + ";--wp-red-bg:#fff7e2}" + amberMarks + TAG + "{background:#f0f3f1!important;color:#24382f!important;border:1px solid #dce3df!important;display:inline-flex;align-items:center;gap:6px}.weekly-preference-tag::before{content:\"\";width:7px;height:7px;border-radius:50%;background:" + AMBER + ";flex:none}" + KEEP_RED }
      ]
    },
    {
      bl: "BL-1026 · BL-713", title: "Yayın durumu yalnız renkle söyleniyor", where: "Schedule · lokasyon başlığı",
      facts: [
        ["Ne", "Schedule ızgarasında her lokasyon adının solunda küçük bir nokta var: yeşil = yayında, gri = yayında değil, kırmızı = yayın günü yaklaştı ve hâlâ yayında değil. Fark yalnız renk."],
        ["Nerede", "Schedule → ızgaranın üstündeki lokasyon başlığı (\"Harbor & Vine Downtown\" gibi)."],
        ["Kim", "Owner, admin, manager. Telefonda Schedule kapalı, sağdaki pencere o yüzden kapalı ekranı gösterir."],
        ["Neden soruluyor", "Renk körü bir müdür haftanın yayında olup olmadığını ayırt edemez (erişilebilirlik kuralı). Ekran okuyucu kısmı kapandı (nokta artık adını söylüyor); gözle görülen kısım senin seçimin."],
        ["Pencerede", "Üç ekran var: bu hafta (iki lokasyon da yayında), sonraki hafta (Downtown'u bu sayfa için yayından kaldırdım, yalnız demo verisinde) ve iki hafta sonrası (hiçbiri yayında değil). Hafta 2 günden az sonra başlıyorsa yayında olmayan lokasyonun noktası kırmızı, yoksa gri; Uptown'ı görmek için ızgarayı sağa kaydır."]
      ],
      views: [
        { id: "this", label: "Bu hafta · yayında", file: "app-schedule.html", s: "3.0", sc: "owner", role: "owner", seed: "schedule" },
        { id: "next", label: "Sonraki hafta · Downtown yayında değil", file: "app-schedule.html", s: "3.0", sc: "owner", role: "owner", seed: "schedule", steps: [{ click: "text=Next week" }] },
        { id: "later", label: "İki hafta sonrası · yayında değil", file: "app-schedule.html", s: "3.0", sc: "owner", role: "owner", seed: "schedule", steps: [{ click: "text=Next week" }, { wait: 700 }, { click: "text=Next week" }] }
      ],
      note: "Noktanın üstüne gelince bugünkü yazı (\"Published - Live\" gibi) ipucu olarak çıkar; A ve C o yazıyı doğrudan başlığa koyar.",
      mine: "Önerim C: her şey yolundayken başlık sakin kalır (yeşil noktada tik), sorun olduğunda yazı çıkar. A daha açık ama her lokasyonda sürekli bir etiket ekler.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: yalnız renkli nokta.", css: "" },
        { k: "A", d: "Nokta + yazı: noktanın yanında kısa durum yazısı (\"Live\", \"Not published\", \"Not published · week starts soon\"), rengine uygun hafif bir etiket içinde.", css: chip },
        { k: "B", d: "Şekil: yayında = yeşil daire içinde tik; yayında değil = içi boş gri halka; yayın günü yaklaştı = kırmızı daire içinde \"!\". Yazı yok.", css: shapes },
        { k: "C", rec: true, d: "Karma: yayında olan lokasyon tikli yeşil nokta; yayında olmayan ya da uyarılı lokasyon yazılı etiket.", css: check + chipUnpub }
      ]
    },
    {
      bl: "BL-664 (5)", title: "Logo penceresinin arka planı saydam", where: "Settings → General → Manage logo",
      facts: [
        ["Ne", "Logo penceresi açılınca arkadaki sayfa hiç kararmıyor. Öteki Schedule pencereleri arkayı karartıyor."],
        ["Nerede", "Settings → General → Schedule logo satırı → Manage logo. Aynı pencere Schedule'da ızgaranın sol üst köşesindeki logoya tıklayınca da açılır."],
        ["Kim", "Owner, admin."],
        ["Neden soruluyor", "Pencerenin nerede bittiği, arkadaki sayfanın tıklanıp tıklanamayacağı belli olmuyor. Kodda bilerek saydam yapılmış (styles.css, satır 10668); neden yazılmamış."]
      ],
      views: [{ id: "general", label: "Settings · General", file: "app.html", s: "10.0", sc: "owner", role: "owner", steps: [{ click: "text=Manage logo" }] }],
      mine: "Önerim A: öteki Schedule pencereleriyle aynı karartma; uygulamada tek pencere dili.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: arka plan saydam, sayfa olduğu gibi görünür.", css: "" },
        { k: "A", rec: true, d: "Standart karartma: öteki Schedule pencereleriyle aynı koyu yeşilimsi perde (%48).", css: BACK + "{background:rgb(18 27 23 / 48%)!important}" },
        { k: "B", d: "Hafif karartma: Schedule'ın sessiz pencerelerindeki daha açık perde (%28).", css: BACK + "{background:rgb(15 23 42 / 28%)!important}" },
        { k: "C", d: "Beyaz buğu: sayfa beyaz bir perdeyle soluklaşır ve hafif bulanıklaşır, kararmaz.", css: BACK + "{background:rgb(255 255 255 / 58%)!important;-webkit-backdrop-filter:blur(3px)!important;backdrop-filter:blur(3px)!important}" }
      ]
    },
    {
      bl: "BL-664 (6)", title: "Schedule rules ve Conflict handling'de büyük denetimler", where: "Settings → Schedule rules · Conflict handling",
      facts: [
        ["Ne", "Bu iki sayfadaki açılır listeler ve sayı kutuları 16 px yazıyla, 40 px yükseklikte. Öteki Settings sayfalarında (örnek Notifications) aynı tür denetim 12-14 px yazı, 34-38 px yükseklik."],
        ["Nerede", "Settings → Schedule rules → Schedule basics kartı (Publish by listesi, Time off decision window kutusu); Settings → Conflict handling (her kuralın Warn / Require confirmation listesi)."],
        ["Kim", "Owner, admin."],
        ["Neden soruluyor", "Sayfanın kök yazı boyu 16 px; bu iki sayfa onu devralıyor. Ortak bir ölçü olduğu için hangisinin doğru olduğunu sen seçersin."]
      ],
      views: [
        { id: "rules", label: "Schedule rules", file: "app.html", s: "10.4", sc: "owner", role: "owner" },
        { id: "conflicts", label: "Conflict handling", file: "app.html", s: "10.5", sc: "owner", role: "owner" }
      ],
      mine: "Önerim A: Settings → Notifications'taki denetimlerle aynı ölçü; yeşil Save düğmesi her Settings sayfasında aynı kaldığı için ona dokunmuyorum.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: 16 px yazı, 40 px yükseklik.", css: "" },
        { k: "A", rec: true, d: "14 px yazı, 38 px yükseklik: Settings → Notifications'taki kutular gibi.", css: CTRL + "{font-size:14px!important;height:38px!important;min-height:38px!important}" + MIN + "{height:38px!important;min-height:38px!important}.scheduling-form .setting-unit{font-size:14px!important}" },
        { k: "B", d: "13 px yazı, 34 px yükseklik: Settings → Jobs'taki arama kutusu gibi, daha sıkı.", css: CTRL + "{font-size:13px!important;height:34px!important;min-height:34px!important}" + MIN + "{height:34px!important;min-height:34px!important}.scheduling-form .setting-unit{font-size:13px!important}" },
        { k: "C", d: "A + kartın içindeki Save düğmesi de küçülür (14 px, 38 px).", css: CTRL + "{font-size:14px!important;height:38px!important;min-height:38px!important}" + MIN + "{height:38px!important;min-height:38px!important}.scheduling-form .setting-unit{font-size:14px!important}.scheduling-form .nf-button,.conflict-settings .nf-button,[class*=conflict-] .nf-button{font-size:14px!important;min-height:38px!important;height:38px!important;padding:0 14px!important}" }
      ]
    },
    {
      bl: "BL-850", title: "Workspace kartlarında ham renkler", where: "Workspace (ana sayfa)",
      facts: [
        ["Ne", "Workspace sayfasındaki kartların (Setup checklist, Today, Pending requests, Announcements, Todos) kenar, ayırıcı, üstüne gelme ve bağlantı renkleri temanın renk listesinden değil, elle yazılmış 12 ayrı renk kodundan geliyor."],
        ["Nerede", "Sol menü → Workspace. Kod: apps/web/src/styles.css, satır 13639-13878."],
        ["Kim", "Owner, admin, manager."],
        ["Neden soruluyor", "Kuralımız her rengin temadan gelmesini istiyor. Temaya geçince renkler çok az değişir; A neredeyse aynı görünür. Kartları biraz daha belirgin ya da liste sayfalarına benzer yapmak da mümkün: B ve C."]
      ],
      views: [{ id: "ws", label: "Workspace · Owner", file: "app.html", s: "2.0", sc: "owner", role: "owner" }],
      note: "Farkı görmek için bir kartın satırının üstüne gel (checklist maddeleri, duyurular) ve kart kenarlarına bak.",
      mine: "Önerim A: amaç kodu temaya bağlamak; görünüm değişmez, sonra temada yapılan her değişiklik bu kartlara da yansır.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: elle yazılmış renkler.", css: "" },
        { k: "A", rec: true, d: "Temanın en yakın renkleri: kenar, ayırıcı, üstüne gelme zemini ve bağlantı yeşili temadan; göz neredeyse farkı görmez.", css: ".owner-setup-checklist{border-color:var(--theme-border)!important}.owner-setup-checklist>header,.workspace-widget>header{border-bottom-color:var(--theme-border-subtle)!important}.owner-setup-checklist-item{border-right-color:var(--theme-border-subtle)!important;border-bottom-color:var(--theme-border-subtle)!important}.owner-setup-checklist-item:hover,.workspace-feed>a:hover{background:var(--theme-surface-soft)!important}.owner-setup-checklist-status{border-color:var(--theme-border-strong)!important}.owner-setup-checklist-status[data-done=\"true\"]{background:var(--theme-selected)!important}.workspace-widget{border-color:var(--theme-border)!important}.workspace-todo-form input{color:var(--theme-text)!important}.workspace-feed>div{border-bottom-color:var(--theme-border-subtle)!important}.widget-link{color:var(--theme-accent)!important}" },
        { k: "B", d: "Liste sayfası çerçevesi: kartlar Employees listesinin çerçeve rengiyle, kart başlıkları açık gri zeminde; üstüne gelince açık yeşil.", css: ".owner-setup-checklist,.workspace-widget{border-color:var(--theme-list-frame)!important}.owner-setup-checklist>header,.workspace-widget>header{background:var(--theme-surface-soft)!important;border-bottom-color:var(--theme-list-head-border)!important}.owner-setup-checklist-item{border-right-color:var(--theme-list-col-line)!important;border-bottom-color:var(--theme-list-col-line)!important}.workspace-feed>div{border-bottom-color:var(--theme-list-col-line)!important}.owner-setup-checklist-item:hover,.workspace-feed>a:hover{background:var(--theme-selected)!important}.owner-setup-checklist-status{border-color:var(--theme-border-strong)!important}.owner-setup-checklist-status[data-done=\"true\"]{background:var(--theme-selected)!important}.widget-link{color:var(--theme-accent)!important}.workspace-todo-form input{color:var(--theme-text)!important}" },
        { k: "C", d: "Belirgin kartlar: kart kenarları koyu gri, ayırıcılar normal gri, üstüne gelince belirgin gri zemin, bağlantılar koyu yeşil.", css: ".owner-setup-checklist,.workspace-widget{border-color:var(--theme-border-strong)!important}.owner-setup-checklist>header,.workspace-widget>header{border-bottom-color:var(--theme-border)!important}.owner-setup-checklist-item{border-right-color:var(--theme-border)!important;border-bottom-color:var(--theme-border)!important}.workspace-feed>div{border-bottom-color:var(--theme-border)!important}.owner-setup-checklist-item:hover,.workspace-feed>a:hover{background:var(--theme-surface-muted)!important}.owner-setup-checklist-status{border-color:var(--theme-border-strong)!important}.owner-setup-checklist-status[data-done=\"true\"]{background:var(--theme-selected)!important}.widget-link{color:var(--theme-accent-strong)!important}.workspace-todo-form input{color:var(--theme-text)!important}" }
      ]
    },
    {
      bl: "BL-258", title: "Bildirim satırını açan düğmede üstüne gelince fark yok", where: "Account → Notifications",
      facts: [
        ["Ne", "Her bildirim grubunun sağındaki aşağı ok düğmesinin (grubu açar) üstüne fareyle gelince zemini çok az değişiyor; açık grubun gri zemininde fark neredeyse hiç görünmüyor (1,06:1)."],
        ["Nerede", "Sol menü altı → Account → Notifications → \"Schedule\", \"Requests\" gibi satırların en sağındaki ok."],
        ["Kim", "Herkes (owner, manager, çalışan)."],
        ["Neden soruluyor", "Önerilen tema rengi (açık yeşil) de aynı zeminde yalnız 1,09:1; daha koyu zemin ya da kenar, ikon rengi gibi başka bir işaret gerekiyor. Telefonda üstüne gelme yok; fark yalnız masaüstünde."]
      ],
      views: [{ id: "expand", label: "Account · Notifications", file: "app.html", s: "11.3", sc: "expand", role: "owner" }],
      note: "Pencerede \"Schedule\" grubu açık gelir. Masaüstü penceresinde okların üstüne fareyle gel.",
      mine: "Önerim B: zemin belirgin koyulaşır ve ince bir kenar çıkar; yeşil seçili hâlle karışmaz.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: zemin çok az grileşir.", css: "" },
        { k: "A", d: "Açık yeşil zemin, ok yeşil.", css: DISC + "{background:var(--theme-accent-soft)!important;color:var(--theme-accent)!important}" },
        { k: "B", rec: true, d: "Koyu gri zemin ve ince kenar, ok koyu.", css: DISC + "{background:#e3e9e6!important;box-shadow:inset 0 0 0 1px var(--theme-border-strong)!important;color:var(--theme-text)!important}" },
        { k: "C", d: "Zemin değişmez; yeşil çerçeve ve yeşil ok.", css: DISC + "{background:transparent!important;box-shadow:inset 0 0 0 1.5px var(--theme-accent)!important;color:var(--theme-accent)!important}" }
      ]
    },
    {
      bl: "BL-723 (2)", title: "Geçmiş haftada kayıtlı taslak satırı açıklamasız", where: "Schedule → New Schedule menüsü",
      facts: [
        ["Ne", "Geçmiş bir haftada New Schedule menüsünü açınca kayıtlı taslak satırı görünüyor ama düğmesi yok ve neden düzenlenemediği yazmıyor. Şimdiki ve gelecek haftalarda aynı satırda kalem ve çöp kutusu düğmeleri var."],
        ["Nerede", "Schedule → geçmiş bir hafta → sağ üstteki New Schedule menüsü → Saved drafts listesi."],
        ["Kim", "Owner, admin, manager."],
        ["Neden soruluyor", "Satıra tıklayınca taslak görüntülenir ama düzenlenemez; kişi bunu ancak deneyince öğreniyor."],
        ["Pencerede", "Geçen haftaya \"Last week plan\" adlı bir taslak ekledim (yalnız demo verisinde); pencere geçen haftayı ve menüyü açık getirir."]
      ],
      views: [{ id: "past", label: "Schedule · geçen hafta", file: "app-schedule.html", s: "3.0", sc: "owner", role: "owner", seed: "schedule", steps: [{ click: "text=Previous week" }, { wait: 900 }, { click: "text=Draft selector" }] }],
      note: "Menü kapanırsa \"New Schedule\" düğmesine yeniden bas. Karşılaştırmak için iki kez Next week'e gidip aynı menüde \"Next week plan\" satırına bak.",
      mine: "Önerim A: satırın ne olduğunu ve neden düzenlenemediğini aynı yerde söyler; yeni düğme eklemez.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: yalnız ad ve \"Revision 2 • tarih\".", css: "" },
        { k: "A", rec: true, d: "\"Read-only\" etiketi ve altında tek satır: \"Past week: you can view it, not edit it.\"", css: ROW + " .schedule-draft-menu-title-line::after{content:\"Read-only\";margin-left:8px;padding:1px 7px;border-radius:999px;background:var(--theme-surface-muted);color:var(--theme-muted-strong);border:1px solid var(--theme-border);font:700 11px/1.4 Inter,system-ui,sans-serif}" + ROW + " > div::after{content:\"Past week: you can view it, not edit it.\";display:block;margin-top:3px;font-size:11.5px;color:var(--theme-muted)}" },
        { k: "B", d: "Sağda bir \"View\" düğmesi ve tarih satırının sonunda \"• Read-only\".", css: ROW + "{display:flex!important;align-items:center;gap:10px}" + ROW + "::after{content:\"View\";margin-left:auto;padding:4px 10px;border:1px solid var(--theme-border-strong);border-radius:6px;background:#fff;font:700 12px/1.3 Inter,system-ui,sans-serif;color:var(--theme-text)}" + ROW + ":hover::after{background:var(--theme-surface-muted)}" + ROW + " small::after{content:\" • Read-only\"}" },
        { k: "C", d: "Solgun satır: satırın yazısı soluklaşır, sağında gri \"Read-only\" yazısı durur; düğme gibi görünmez.", css: ROW + "{display:flex!important;align-items:center;gap:10px}" + ROW + " strong," + ROW + " small{color:var(--theme-muted)!important}" + ROW + "::after{content:\"Read-only\";margin-left:auto;font:600 11.5px/1.3 Inter,system-ui,sans-serif;color:var(--theme-muted-strong)}" }
      ]
    },
    {
      bl: "BL-723 (3)", title: "Mini takvimde satır başı noktaların anlamı yazmıyor", where: "Schedule → takvim düğmesi",
      facts: [
        ["Ne", "Schedule'ın üstündeki takvim düğmesi küçük bir ay takvimi açar. Her haftanın solunda küçük bir nokta var: tıklayınca o haftaya gider; turuncu nokta ekrandaki hafta. Bunu söyleyen bir şey yok."],
        ["Nerede", "Schedule → sol üstteki tarih aralığının yanındaki takvim simgesi."],
        ["Kim", "Owner, admin, manager."],
        ["Neden soruluyor", "Noktanın düğme olduğu ve ne yaptığı anlaşılmıyor. Günün kendisine tıklamak da o haftaya gidiyor; noktalar o yüzden fazlalık da sayılabilir (C)."]
      ],
      views: [{ id: "cal", label: "Schedule · takvim açık", file: "app-schedule.html", s: "3.0", sc: "owner", role: "owner", steps: [{ click: "text=Open schedule calendar" }] }],
      note: "Takvim kapanırsa tarih aralığının solundaki takvim simgesine yeniden bas.",
      mine: "Önerim B: ok işareti \"o haftaya git\" demeyi yazısız söyler; satır vurgusu hangi haftaya gidileceğini gösterir.",
      variants: [
        { k: "Original", d: "Bugünkü hâl: küçük siyah noktalar, ekrandaki hafta turuncu.", css: "" },
        { k: "A", d: "Açıklama satırı: takvimin altında \"Dot: go to that week · Orange: the week on screen\".", css: ".mini-calendar::after{content:\"Dot: go to that week · Orange: the week on screen\";display:block;margin-top:8px;font-size:11px;font-weight:600;color:var(--theme-muted);text-align:center}" },
        { k: "B", rec: true, d: "Nokta yerine ok (›), sütunun başında \"Wk\"; okun üstüne gelince o haftanın günleri vurgulanır.", css: ".week-jump span{display:none!important}.week-jump::after{content:\"›\";font:700 16px/1 Inter,system-ui,sans-serif;color:#5f6b66}.week-jump.active::after{color:#b36a20}.calendar-grid>span[aria-hidden]:first-child{display:grid;place-items:center}.calendar-grid>span[aria-hidden]:first-child::after{content:\"Wk\";font-size:9px;font-weight:700;color:var(--theme-muted)}.calendar-row:has(.week-jump:hover) .calendar-day{background:#edf3f0}" },
        { k: "C", d: "Noktalar gizli; yalnız üstüne gelinen haftada ve ekrandaki haftada görünür, satır vurgulanır.", css: ".week-jump span{opacity:0}.calendar-row:hover .week-jump span,.week-jump.active span{opacity:1}.calendar-row:hover .calendar-day{background:#edf3f0}" }
      ]
    }
  ];
