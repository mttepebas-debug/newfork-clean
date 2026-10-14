# Job ikon paketi

Restoran pozisyonları ve genel görevler için SVG ikonlar. Jobs çekmecesinde bir job'a atanacak; Lineup'ta kişinin yanında baş harfler yerine görünecek.

- Stil: 24×24 ızgara, 2 birim çizgi, yuvarlak uç ve köşe, dolgu yok, renk `currentColor` (uygulamadaki lucide-react ikonlarıyla aynı kural).
- Durum: `keep` (kalsın), `sil` (silinecek), `bekliyor` (Mert henüz karar vermedi). Durum `kaynak/status.json`'da tutulur.
- Galeri: `index.html`, yayında https://claude.ai/artifact/XxfpgGwRtUH2P5jJKup5qi (aynı bağlantıya yeni sürüm; yayından önce kopyaya `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <kopya> XxfpgGwRtUH2P5jJKup5qi`). Kaynak: `kaynak/icons.py`, yeniden üretmek için `python3 kaynak/build.py`.
- Sayılar: 52 ikon · keep 0 · sil 0 · bekliyor 52

| No | Dosya | İkon | Önerilen job | Kategori | Tur | Durum |
|---|---|---|---|---|---|---|
| 1 | `svg/001-server.svg` | Server | Server, waiter | Salon | 1 | bekliyor |
| 2 | `svg/002-busser.svg` | Bus tub | Busser | Salon | 1 | bekliyor |
| 3 | `svg/003-bartender.svg` | Shaker | Bartender | Bar | 1 | bekliyor |
| 4 | `svg/004-cashier.svg` | Register | Cashier | Salon | 1 | bekliyor |
| 5 | `svg/005-host.svg` | Host stand | Host | Salon | 1 | bekliyor |
| 6 | `svg/006-hostess.svg` | Menu | Hostess | Salon | 1 | bekliyor |
| 7 | `svg/007-gm.svg` | Briefcase | General manager (GM) | Yönetim | 1 | bekliyor |
| 8 | `svg/008-shift-lead.svg` | Clipboard | Shift lead | Yönetim | 1 | bekliyor |
| 9 | `svg/009-barback.svg` | Bottle crate | Barback | Bar | 1 | bekliyor |
| 10 | `svg/010-food-runner.svg` | Hot bowl | Food runner | Salon | 1 | bekliyor |
| 11 | `svg/011-expo.svg` | Ticket rail | Expo | Mutfak | 1 | bekliyor |
| 12 | `svg/012-delivery-driver.svg` | Delivery scooter | Delivery driver | Paket servis | 1 | bekliyor |
| 13 | `svg/013-chef.svg` | Chef hat | Chef, executive chef | Mutfak | 1 | bekliyor |
| 14 | `svg/014-sous-chef.svg` | Chef jacket | Sous chef | Mutfak | 1 | bekliyor |
| 15 | `svg/015-line-cook.svg` | Pan on flame | Line cook | Mutfak | 1 | bekliyor |
| 16 | `svg/016-prep-cook.svg` | Knife and board | Prep cook | Mutfak | 1 | bekliyor |
| 17 | `svg/017-dishwasher.svg` | Clean plate | Dishwasher | Mutfak | 1 | bekliyor |
| 18 | `svg/018-barista.svg` | Coffee cup | Barista | Bar | 1 | bekliyor |
| 19 | `svg/019-sommelier.svg` | Wine glass | Sommelier | Bar | 1 | bekliyor |
| 20 | `svg/020-pastry-chef.svg` | Cake slice | Pastry chef | Mutfak | 1 | bekliyor |
| 21 | `svg/021-grill-cook.svg` | Spatula | Grill cook | Mutfak | 1 | bekliyor |
| 22 | `svg/022-fry-cook.svg` | Fries | Fry cook | Mutfak | 1 | bekliyor |
| 23 | `svg/023-keyholder.svg` | Key | Keyholder, assistant manager | Yönetim | 1 | bekliyor |
| 24 | `svg/024-to-go.svg` | To-go bag | To-go, takeout | Paket servis | 1 | bekliyor |
| 25 | `svg/025-porter.svg` | Broom | Porter, janitor | Genel görevler | 1 | bekliyor |
| 26 | `svg/026-cleaning.svg` | Spray bottle | Cleaning duty | Genel görevler | 1 | bekliyor |
| 27 | `svg/027-server-notepad.svg` | Server taking an order | Server | Salon | 2 | bekliyor |
| 28 | `svg/028-server-mustache.svg` | Server, curled mustache and bow tie | Server, waiter | Salon | 2 | bekliyor |
| 29 | `svg/029-server-tray.svg` | Server carrying a covered plate | Server, food runner | Salon | 2 | bekliyor |
| 30 | `svg/030-bartender-shaking.svg` | Bartender shaking a cocktail | Bartender | Bar | 2 | bekliyor |
| 31 | `svg/031-gm-suit.svg` | Manager in suit and tie | General manager (GM) | Yönetim | 2 | bekliyor |
| 32 | `svg/032-host-stand.svg` | Host at the host stand | Host | Salon | 2 | bekliyor |
| 33 | `svg/033-hostess-menu.svg` | Hostess with a menu | Hostess | Salon | 2 | bekliyor |
| 34 | `svg/034-chef-person.svg` | Chef in a toque | Chef, executive chef | Mutfak | 2 | bekliyor |
| 35 | `svg/035-cook-tossing.svg` | Cook tossing a pan | Line cook | Mutfak | 2 | bekliyor |
| 36 | `svg/036-runner-two-plates.svg` | Runner with two plates | Food runner | Salon | 2 | bekliyor |
| 37 | `svg/037-busser-person.svg` | Busser carrying a bus tub | Busser | Salon | 2 | bekliyor |
| 38 | `svg/038-driver-cap-box.svg` | Driver with cap and box | Delivery driver | Paket servis | 2 | bekliyor |
| 39 | `svg/039-expo-bell.svg` | Expo with the order-up bell | Expo | Mutfak | 2 | bekliyor |
| 40 | `svg/040-sommelier-bottle.svg` | Sommelier presenting a bottle | Sommelier | Bar | 2 | bekliyor |
| 41 | `svg/041-barista-person.svg` | Barista with a cup | Barista | Bar | 2 | bekliyor |
| 42 | `svg/042-manager-headset.svg` | Manager with a headset | Floor manager, shift lead | Yönetim | 2 | bekliyor |
| 43 | `svg/043-trainer.svg` | Trainer at a board | Trainer | Yönetim | 2 | bekliyor |
| 44 | `svg/044-security.svg` | Security, doorman | Security, doorman | Genel görevler | 2 | bekliyor |
| 45 | `svg/045-order-pad.svg` | Order pad and pencil | Server tool | Araç | 2 | bekliyor |
| 46 | `svg/046-wine-key.svg` | Wine key (corkscrew) | Server, sommelier tool | Araç | 2 | bekliyor |
| 47 | `svg/047-cocktail-glass.svg` | Cocktail glass | Bartender, mixologist | Bar | 2 | bekliyor |
| 48 | `svg/048-tongs.svg` | Tongs | Line cook, grill tool | Araç | 2 | bekliyor |
| 49 | `svg/049-ladle.svg` | Ladle | Cook, soup station | Araç | 2 | bekliyor |
| 50 | `svg/050-pizza-slice.svg` | Pizza slice | Pizza cook | Mutfak | 2 | bekliyor |
| 51 | `svg/051-thermometer.svg` | Food thermometer | Food safety duty | Genel görevler | 2 | bekliyor |
| 52 | `svg/052-walkie-talkie.svg` | Walkie-talkie | Manager, host tool | Araç | 2 | bekliyor |

## İnsan çizimleri (Mert'in örneklerine göre, renkli stil)

Yüzsüz insan, net saç ve kıyafet, önde rolün aleti. 48×48 ızgara, 1.6 çizgi. Mert 2026-10-14 08:04Z (California 01:04) renkli stili seçti (düz renk + koyu çizgi); tur 3 çizimlerinin tek renk `cizgi` dosyaları da duruyor. Mert aynı stilde 100 yeni çizim istedi (08:05Z). Tur 5'ten (serinin 2. turu) itibaren çizimler `kaynak/kit.py` kalıbıyla: dirsekli kol, gerçek el, belirgin kravat, gölge (Mert 08:24Z daha iyi işçilik istedi); 60 host, 72 sommelier ve 74 pizzacı bu kalıpla yeniden çizildi. Tur 9 (Mert 09:04Z): çizimler Lineup'ta ismin solunda duracak, o yüzden sadece işi yapan kişi ya da en çok kullandığı alet; sahne ve genel nesneler (kapalı tabelası, el yıkama, soğuk oda kapısı…) çıkarıldı, dosyaları `svg/insan/cikarilan/`, yerlerine aynı numaralarla yenileri geldi; 159–173 yeni.

| No | Dosya | Çizim | Önerilen job | Tur | Durum |
|---|---|---|---|---|---|
| 53 | `svg/insan/053-server-tray-ill-renkli.svg` | Server carrying a tray | Server, food runner | 3 | bekliyor |
| 54 | `svg/insan/054-server-mustache-ill-renkli.svg` | Server with curled mustache | Server, waiter | 3 | bekliyor |
| 55 | `svg/insan/055-server-order-ill-renkli.svg` | Server taking an order | Server | 3 | bekliyor |
| 56 | `svg/insan/056-bartender-shaking-ill-renkli.svg` | Bartender shaking a cocktail | Bartender | 3 | bekliyor |
| 57 | `svg/insan/057-gm-suit-ill-renkli.svg` | General manager in a suit | General manager (GM) | 3 | bekliyor |
| 58 | `svg/insan/058-chef-pot-ill-renkli.svg` | Chef with a steaming pot | Chef, cook | 3 | bekliyor |
| 59 | `svg/insan/059-busser-tub-ill-renkli.svg` | Busser carrying a bus tub | Busser | 4 | bekliyor |
| 60 | `svg/insan/060-host-stand-ill-renkli.svg` | Host at the host stand | Host | 4 | bekliyor |
| 61 | `svg/insan/061-hostess-menus-ill-renkli.svg` | Hostess holding menus | Hostess | 4 | bekliyor |
| 62 | `svg/insan/062-barback-crate-ill-renkli.svg` | Barback carrying a crate | Barback | 4 | bekliyor |
| 63 | `svg/insan/063-expo-ticket-ill-renkli.svg` | Expo calling an order | Expo | 4 | bekliyor |
| 64 | `svg/insan/064-driver-box-ill-renkli.svg` | Delivery driver with a box | Delivery driver | 4 | bekliyor |
| 65 | `svg/insan/065-sous-chef-ill-renkli.svg` | Sous chef, arms crossed | Sous chef | 4 | bekliyor |
| 66 | `svg/insan/066-line-cook-flame-ill-renkli.svg` | Line cook with a flaming pan | Line cook | 4 | bekliyor |
| 67 | `svg/insan/067-prep-cook-ill-renkli.svg` | Prep cook at the cutting board | Prep cook | 4 | bekliyor |
| 68 | `svg/insan/068-dishwasher-ill-renkli.svg` | Dishwasher scrubbing a plate | Dishwasher | 4 | bekliyor |
| 69 | `svg/insan/069-runner-plates-ill-renkli.svg` | Runner with two plates | Food runner | 4 | bekliyor |
| 70 | `svg/insan/070-cashier-pos-ill-renkli.svg` | Cashier at the register | Cashier | 4 | bekliyor |
| 71 | `svg/insan/071-barista-ill-renkli.svg` | Barista at the espresso machine | Barista | 4 | bekliyor |
| 72 | `svg/insan/072-sommelier-pour-ill-renkli.svg` | Sommelier pouring wine | Sommelier | 4 | bekliyor |
| 73 | `svg/insan/073-pastry-chef-ill-renkli.svg` | Pastry chef with a cake | Pastry chef | 4 | bekliyor |
| 74 | `svg/insan/074-pizza-toss-ill-renkli.svg` | Pizza cook tossing dough | Pizza cook | 4 | bekliyor |
| 75 | `svg/insan/075-grill-cook-ill-renkli.svg` | Grill cook flipping a burger | Grill cook | 4 | bekliyor |
| 76 | `svg/insan/076-shift-lead-ill-renkli.svg` | Shift lead with a clipboard | Shift lead | 4 | bekliyor |
| 77 | `svg/insan/077-porter-mop-ill-renkli.svg` | Porter mopping, wet floor sign | Porter | 4 | bekliyor |
| 78 | `svg/insan/078-bartender-tap-ill-renkli.svg` | Bartender pouring a beer | Bartender | 4 | bekliyor |
| 79 | `svg/insan/079-cocktail-server-ill-renkli.svg` | Cocktail server with a drink tray | Cocktail server, server | 5 | bekliyor |
| 80 | `svg/insan/080-manager-tablet-ill-renkli.svg` | Manager with the schedule on a tablet | Manager, assistant manager | 5 | bekliyor |
| 81 | `svg/insan/081-salad-prep-ill-renkli.svg` | Salad prep tossing a salad | Salad prep, prep cook | 5 | bekliyor |
| 82 | `svg/insan/082-receiver-ill-renkli.svg` | Receiver checking a delivery | Receiver | 5 | bekliyor |
| 83 | `svg/insan/083-martini-glass-obj-renkli.svg` | Martini glass with an olive | Bartender, mixologist | 5 | bekliyor |
| 84 | `svg/insan/084-baker-bread-ill-renkli.svg` | Baker with a basket of bread | Baker | 5 | bekliyor |
| 85 | `svg/insan/085-sushi-chef-ill-renkli.svg` | Sushi chef with nigiri | Sushi chef | 5 | bekliyor |
| 86 | `svg/insan/086-supervisor-ill-renkli.svg` | Supervisor with headset and radio | Supervisor, floor manager | 5 | bekliyor |
| 87 | `svg/insan/087-stocker-shelf-ill-renkli.svg` | Stocker filling a shelf | Stocker, prep | 5 | bekliyor |
| 88 | `svg/insan/088-shaker-obj-renkli.svg` | Cocktail shaker | Bartender, mixologist | 5 | bekliyor |
| 89 | `svg/insan/089-glass-polisher-ill-renkli.svg` | Polishing a wine glass | Polisher, busser, barback | 5 | bekliyor |
| 90 | `svg/insan/090-mixologist-ill-renkli.svg` | Mixologist garnishing a cocktail | Mixologist, bartender | 5 | bekliyor |
| 91 | `svg/insan/091-butcher-ill-renkli.svg` | Butcher with a cleaver | Butcher | 5 | bekliyor |
| 92 | `svg/insan/092-valet-key-ill-renkli.svg` | Valet with a car key | Valet | 5 | bekliyor |
| 93 | `svg/insan/093-old-fashioned-obj-renkli.svg` | Old fashioned with a big ice cube | Bartender, mixologist | 5 | bekliyor |
| 94 | `svg/insan/094-security-rope-ill-renkli.svg` | Security at the velvet rope | Security, doorman | 5 | bekliyor |
| 95 | `svg/insan/095-togo-bag-ill-renkli.svg` | To-go order handed over | To-go specialist, cashier | 5 | bekliyor |
| 96 | `svg/insan/096-banquet-server-ill-renkli.svg` | Banquet server at the buffet | Banquet server, catering | 5 | bekliyor |
| 97 | `svg/insan/097-owner-open-ill-renkli.svg` | Owner turning the sign to Open | Owner, general manager | 5 | bekliyor |
| 98 | `svg/insan/098-waiter-silhouette-obj-renkli.svg` | Classic waiter silhouette, handlebar mustache | Server, waiter | 5 | bekliyor |
| 99 | `svg/insan/099-cloche-obj-renkli.svg` | Cloche on a platter | Server, room service | 6 | bekliyor |
| 100 | `svg/insan/100-order-pad-obj-renkli.svg` | Order pad and pencil | Server | 6 | bekliyor |
| 101 | `svg/insan/101-wine-corkscrew-obj-renkli.svg` | Wine bottle and corkscrew | Sommelier | 6 | bekliyor |
| 102 | `svg/insan/102-bus-tub-obj-renkli.svg` | Bus tub with dirty dishes | Busser, dishwasher | 6 | bekliyor |
| 103 | `svg/insan/103-menu-obj-renkli.svg` | Restaurant menu | Host, hostess, server | 6 | bekliyor |
| 104 | `svg/insan/104-guest-pager-obj-renkli.svg` | Guest pager buzzing | Host, hostess | 6 | bekliyor |
| 105 | `svg/insan/105-chef-knife-board-obj-renkli.svg` | Chef's knife on a cutting board | Chef, prep cook, line cook | 6 | bekliyor |
| 106 | `svg/insan/106-toque-obj-renkli.svg` | Chef's hat (toque) | Chef, sous chef | 6 | bekliyor |
| 107 | `svg/insan/107-pan-flame-obj-renkli.svg` | Pan tossed over the flame | Line cook, cook | 6 | bekliyor |
| 108 | `svg/insan/108-grill-spatula-obj-renkli.svg` | Spatula and burger on the grill | Grill cook | 6 | bekliyor |
| 109 | `svg/insan/109-ticket-rail-obj-renkli.svg` | Order tickets on the rail | Expo, line cook | 6 | bekliyor |
| 110 | `svg/insan/110-service-bell-obj-renkli.svg` | Service bell, order up | Expo, food runner | 6 | bekliyor |
| 111 | `svg/insan/111-whisk-bowl-obj-renkli.svg` | Whisk and mixing bowl | Pastry chef, baker | 6 | bekliyor |
| 112 | `svg/insan/112-latte-art-obj-renkli.svg` | Latte with heart art | Barista | 6 | bekliyor |
| 113 | `svg/insan/113-beer-taps-obj-renkli.svg` | Beer taps pouring a pint | Bartender, barback | 6 | bekliyor |
| 114 | `svg/insan/114-ice-bucket-obj-renkli.svg` | Ice bucket and scoop | Barback, bartender | 6 | bekliyor |
| 115 | `svg/insan/115-dish-sprayer-obj-renkli.svg` | Pre-rinse sprayer on a plate | Dishwasher | 6 | bekliyor |
| 116 | `svg/insan/116-delivery-bag-obj-renkli.svg` | Insulated delivery bag | Delivery driver | 6 | bekliyor |
| 117 | `svg/insan/117-card-terminal-obj-renkli.svg` | Card terminal, tap to pay | Cashier, server | 6 | bekliyor |
| 118 | `svg/insan/118-schedule-board-obj-renkli.svg` | The week's schedule | Manager, general manager, shift lead | 6 | bekliyor |
| 119 | `svg/insan/119-range-obj-renkli.svg` | Range with pots on the burners | Line cook, cook | 7 | bekliyor |
| 120 | `svg/insan/120-fryer-obj-renkli.svg` | Deep fryer with a basket of fries | Fry cook, line cook | 7 | bekliyor |
| 121 | `svg/insan/121-pizza-oven-obj-renkli.svg` | Wood-fired pizza oven | Pizza cook | 7 | bekliyor |
| 122 | `svg/insan/122-espresso-machine-obj-renkli.svg` | Espresso machine pulling a shot | Barista | 7 | bekliyor |
| 123 | `svg/insan/123-dish-rack-obj-renkli.svg` | Rack of clean plates | Dishwasher | 7 | bekliyor |
| 124 | `svg/insan/124-server-pitcher-ill-renkli.svg` | Server pouring water | Server | 9 | bekliyor |
| 125 | `svg/insan/125-fry-cook-ill-renkli.svg` | Fry cook lifting the fry basket | Fry cook, line cook | 7 | bekliyor |
| 126 | `svg/insan/126-server-check-ill-renkli.svg` | Server presenting the check | Server | 9 | bekliyor |
| 127 | `svg/insan/127-diner-coffee-ill-renkli.svg` | Diner server with a coffee pot | Server, diner | 9 | bekliyor |
| 128 | `svg/insan/128-kitchen-manager-ill-renkli.svg` | Kitchen manager with the checklist | Kitchen manager, chef | 7 | bekliyor |
| 129 | `svg/insan/129-busser-wipe-ill-renkli.svg` | Busser wiping a table | Busser | 9 | bekliyor |
| 130 | `svg/insan/130-stand-mixer-obj-renkli.svg` | Stand mixer | Pastry chef, baker | 7 | bekliyor |
| 131 | `svg/insan/131-drive-thru-ill-renkli.svg` | Drive-thru window, drink handed out | Drive-thru, cashier | 7 | bekliyor |
| 132 | `svg/insan/132-bar-tools-obj-renkli.svg` | Jigger, bar spoon and strainer | Bartender, mixologist | 7 | bekliyor |
| 133 | `svg/insan/133-barback-keg-ill-renkli.svg` | Barback carrying a keg | Barback | 9 | bekliyor |
| 134 | `svg/insan/134-trainer-ill-renkli.svg` | Trainer with the training binder | Trainer, shift lead | 7 | bekliyor |
| 135 | `svg/insan/135-chef-tasting-ill-renkli.svg` | Chef tasting with a spoon | Chef, sous chef | 9 | bekliyor |
| 136 | `svg/insan/136-ice-cream-ill-renkli.svg` | Ice cream scooper with a cone | Ice cream, dessert | 7 | bekliyor |
| 137 | `svg/insan/137-mop-bucket-obj-renkli.svg` | Mop bucket and wet floor sign | Porter, dishwasher | 7 | bekliyor |
| 138 | `svg/insan/138-bar-manager-ill-renkli.svg` | Bar manager checking the stock | Bar manager | 7 | bekliyor |
| 139 | `svg/insan/139-server-corkscrew-ill-renkli.svg` | Server opening a bottle of wine | Server, sommelier | 9 | bekliyor |
| 140 | `svg/insan/140-expo-pass-ill-renkli.svg` | Expo wiping a plate at the pass | Expo | 9 | bekliyor |
| 141 | `svg/insan/141-host-phone-ill-renkli.svg` | Host taking a reservation call | Host, hostess | 9 | bekliyor |
| 142 | `svg/insan/142-pastry-piping-ill-renkli.svg` | Pastry chef piping a cake | Pastry chef | 9 | bekliyor |
| 143 | `svg/insan/143-baker-peel-ill-renkli.svg` | Baker with the bread peel | Baker | 9 | bekliyor |
| 144 | `svg/insan/144-driver-map-ill-renkli.svg` | Delivery driver with helmet and map | Delivery driver | 9 | bekliyor |
| 145 | `svg/insan/145-server-pos-ill-renkli.svg` | Server ringing in an order | Server, cashier | 9 | bekliyor |
| 146 | `svg/insan/146-sommelier-present-ill-renkli.svg` | Sommelier presenting the bottle | Sommelier | 9 | bekliyor |
| 147 | `svg/insan/147-cash-drawer-obj-renkli.svg` | Cash drawer count | Cashier, manager | 8 | bekliyor |
| 148 | `svg/insan/148-prep-label-ill-renkli.svg` | Prep cook labelling containers | Prep cook | 9 | bekliyor |
| 149 | `svg/insan/149-catering-canape-ill-renkli.svg` | Catering server with canapés | Catering, banquet server | 9 | bekliyor |
| 150 | `svg/insan/150-shift-lead-keys-ill-renkli.svg` | Shift lead with the store keys | Shift lead, manager | 9 | bekliyor |
| 151 | `svg/insan/151-dishwasher-gloves-ill-renkli.svg` | Dishwasher in rubber gloves | Dishwasher | 9 | bekliyor |
| 152 | `svg/insan/152-barista-steam-ill-renkli.svg` | Barista steaming milk | Barista | 9 | bekliyor |
| 153 | `svg/insan/153-drinks-tray-obj-renkli.svg` | Tray of drinks | Server, cocktail server | 9 | bekliyor |
| 154 | `svg/insan/154-piping-bag-obj-renkli.svg` | Piping bag on a cupcake | Pastry chef, baker | 9 | bekliyor |
| 155 | `svg/insan/155-hand-truck-obj-renkli.svg` | Hand truck with boxes | Receiver, stocker | 9 | bekliyor |
| 156 | `svg/insan/156-manager-badge-obj-renkli.svg` | Manager name badge | Manager, general manager | 9 | bekliyor |
| 157 | `svg/insan/157-pizza-peel-obj-renkli.svg` | Pizza on the peel | Pizza cook | 9 | bekliyor |
| 158 | `svg/insan/158-salad-tongs-obj-renkli.svg` | Salad bowl and tongs | Salad prep, prep cook | 9 | bekliyor |
| 159 | `svg/insan/159-bartender-muddle-ill-renkli.svg` | Bartender muddling a mojito | Bartender, mixologist | 9 | bekliyor |
| 160 | `svg/insan/160-bartender-pour-ill-renkli.svg` | Bartender free-pouring | Bartender | 9 | bekliyor |
| 161 | `svg/insan/161-barista-latte-ill-renkli.svg` | Barista pouring latte art | Barista | 9 | bekliyor |
| 162 | `svg/insan/162-sommelier-swirl-ill-renkli.svg` | Sommelier swirling a glass | Sommelier | 9 | bekliyor |
| 163 | `svg/insan/163-sushi-roll-ill-renkli.svg` | Sushi chef with a board of maki | Sushi chef | 9 | bekliyor |
| 164 | `svg/insan/164-pizza-sauce-ill-renkli.svg` | Pizza cook spreading the sauce | Pizza cook | 9 | bekliyor |
| 165 | `svg/insan/165-wok-toss-ill-renkli.svg` | Line cook tossing a wok | Line cook, cook | 9 | bekliyor |
| 166 | `svg/insan/166-grill-tongs-ill-renkli.svg` | Grill cook with tongs and a steak | Grill cook | 9 | bekliyor |
| 167 | `svg/insan/167-cook-squeeze-ill-renkli.svg` | Cook plating with a squeeze bottle | Line cook, chef | 9 | bekliyor |
| 168 | `svg/insan/168-busser-plates-ill-renkli.svg` | Busser with a stack of plates | Busser, dishwasher | 9 | bekliyor |
| 169 | `svg/insan/169-barback-ice-ill-renkli.svg` | Barback hauling ice | Barback | 9 | bekliyor |
| 170 | `svg/insan/170-porter-trash-ill-renkli.svg` | Porter with a trash bag | Porter, dishwasher | 9 | bekliyor |
| 171 | `svg/insan/171-rolling-pin-obj-renkli.svg` | Rolling pin on dough | Baker, pastry chef | 9 | bekliyor |
| 172 | `svg/insan/172-tamper-obj-renkli.svg` | Portafilter and tamper | Barista | 9 | bekliyor |
| 173 | `svg/insan/173-pizza-cutter-obj-renkli.svg` | Pizza cutter | Pizza cook | 9 | bekliyor |
