KARAR: DEĞİŞİKLİK İSTE. Bu bir keşif turuydu; onaylanacak bir dal yok. Ekranda hem bilinen kusurlar hem birkaç yeni kural ihlali var. Hepsi EKRAN-05'in arayüz dilimi C1'e girmeli.

# EKRAN-05 Workspace — görsel QA raporu (C)

**Kapsam:** sol menü → Workspace. Kartlar (Today, Pending requests, Open shifts, Announcements, Todos, Notifications, Quick actions), Customize modu, Setup checklist ve Settings → General → Hide checklist.

**Ortam:** kod `ekran-c` @ `d311a2c5`, web 5638, API 5639. Hiçbir şey kaydedilmedi; scriptler GET dışındaki her isteği engelledi, engellenen istek listesi boş kaldı.

**Roller:** test dünyası `e2e1791130198245`'te owner Olcay, admin Zeynep, tek lokasyon müdürü Ayse; ayrıca küçük Meyhouse'ta `owner@newfork.test`. Her biri 1440 ve 390 genişlikte açıldı.

## Bulgular (önem sırasıyla)

| No | Ekran / yol | Rol + genişlik | Ne görünüyor | Ölçüt | Eşleşme | leave / do | Görüntü |
|---|---|---|---|---|---|---|---|
| 1 | Workspace → Setup checklist adımlarının alt yazısı ("Required visit", "Optional visit") | owner, admin · 1440 + 390 | 11 px gri yazının beyaz üstünde kontrastı 4.16:1, sınır 4.5:1. Renk ham hex `#708078` (`styles.css:13616`) | WCAG 1.4.3 kontrast; §9 token | **YENİ** | low / safe | `01-wowner-1440-top.png` |
| 2 | Workspace → Announcements ve Todos satırlarının alt yazısı ("general", "Due 3d ago", "1m ago") | hepsi · 1440 + 390 | 11 px, `#718078`, kontrast 4.15:1 (`styles.css:13770`) | WCAG 1.4.3 | **YENİ** | low / safe | `08-rich-1440-b.png` |
| 3 | Workspace → Todos → "Add a todo" kutusu klavyeyle odaklanınca | owner · 1440 | Odak çerçevesi %24 saydam, kenar rengi kontrastı 2.88:1. Uygulamanın geri kalanı `--theme-focus` (koyu yeşil, 2 px) kullanıyor (`styles.css:13729-13733` vs `:2876-2882`) | WCAG 1.4.11 / 2.4.7; tutarlılık | **YENİ** | low / safe | `04-focus-*.png` (ölçüm: tab sırası 11) |
| 4 | Workspace → Customize → Cancel | owner · 1440 + 390 | Cancel yeşil dolu, Save layout'un yanında ikisi neredeyse aynı (`rgb(23,105,84)` / `rgb(18,98,79)`). `secondary` sınıfının CSS'i yok | §9 buton dili (vazgeç beyaz, UI-09) | U41 (W6) | low / safe | `05-customize-1440-hidden.png`, `05-customize-390.png` |
| 5 | Customize → kartlardaki "Hide …" düğmesi | owner · 1440 | Göz simgesinde `aria-hidden` yok; yukarı/aşağı ok simgelerinde var | WCAG 4.1.2 / tutarlılık | BL-813 (doğrulandı) | low / safe | ölçüm çıktısı |
| 6 | Notifications kartı → "View all notifications" | owner · 1440 | Bağlantı üç satıra kırılıyor ("View / all / notifications") ve satırlardan 29 px sola kayık. Kök neden: `.workspace-feed > a` ızgarası (20 px sütun) bağlantıya da uygulanıyor (`styles.css:13737`) | tutarlılık / okunurluk | BL-666 (5), W45 | medium / safe | `08-rich-1440-b.png` |
| 7 | Todos ve Announcements satırları | owner · 1440 + 390 | 25 gün sonraya düşen iş "Due 1m ago" diyor. Belge işinde kişi ve belge adı yok. Kategori küçük harfle "general". Hiçbir yere gitmeyen el yazısı to-do'da hem → hem ✓ var | doğru veri / tutarlılık | BL-666 (1-4), W33, W44, W26, W43 | medium / safe | `08-rich-1440-b.png`, `08-rich-390-c.png` |
| 8 | Announcements kartı, 5 duyuru varken | owner · 1440 | "View all" bağlantısı yok; Notifications kartında var | tutarlılık | BL-810 | low / safe | `08-rich-1440-b.png` |
| 9 | Kart bağlantıları ("Review requests", "Open Schedule", Quick actions) | hepsi · 1440 | (a) Fare üstüne gelince hiçbir şey değişmiyor (alt çizgi yok, renk aynı). Notifications sayfasındaki başlık bağlantısı ise alt çiziliyor (`styles.css:13902`). (b) Aynı tür bağlantı üç biçimde: "Review requests" kart boyu uzuyor ve ok en sağda (306 px); "Open Schedule" kısa, ok yazıya bitişik (112 px); Quick actions simgeli ve kart boyu | W37 (öteki ekranlarla ölçüldü); §9 tutarlılık | (a) W37 · (b) **YENİ** | low / safe | `03-hover-review-requests.png`, `02-wowner-1440-scroll1.png` |
| 10 | Üst sıradaki üç sayı kartı | hepsi · 1440 + 390 | Büyük sayılar aynı hizada değil: Today y=540, Pending y=513, Open shifts y=516 (bağlantısı olmayan kart içeriği ortalıyor). Open shifts'in iç boşluğu 22 px, ötekiler 20 px (`styles.css:13674-13705`) | §9 aynı işlevde aynı ölçü | **YENİ** | low / safe | `02-wowner-1440-scroll1.png` |
| 11 | Workspace kartlarının CSS'i | — | Kart kenarı, ayırıcı çizgi, alt yazı, bağlantı ve hover renklerinin hepsi ham hex (`#d8dfdb`, `#e4e8e5`, `#e6ebe8`, `#1b6c55`, `#f4f8f6`, `#7da08f`… `styles.css:13560-13800`) | §9 ham hex yerine `--theme-*` | **YENİ** (BL-169 / 194 / 215 ailesi, Workspace için madde yok) | low / safe | — |
| 12 | Hata durumları | owner · 1440 + 390 | Bağlantı kopunca ekranda çıplak "Failed to fetch". Bozuk bir cevapta ham doğrulama JSON'u kenardan kenara basılıyor. Hata ekranında "Try again" ya da çıkış yolu yok | §9 / ham hata | BL-814 (doğrulandı); "Try again" yok → öneri | low / safe | `10-abort-1440.png`, `10-raw-zod-error-1440.png` (yapay bozuk mock'la üretildi), `10-error-1440.png` |
| 13 | Setup checklist | admin Zeynep · 1440 + 390 | Admin checklist'i ve "Billing"i görüyor; Settings → General'da "Hide checklist"e basabiliyor. Metin "for this workspace" diyor ama gizleme kişi başına | KARARLAR, katalog `workspace.setup` | BL-811 / BL-808, S3 | low / safe | `06-zeynep-1440-workspace.png`, `07-zeynep-1440-settings-general.png` |
| 14 | Settings → General | owner, admin · 1440 + 390 | Sistem kelimesi olarak "Organization identity…", "Organization name", "organization ID" kullanılıyor; menü grubu da "ORGANIZATION". Kural: kullanıcı metninde "workspace" denir | §9 / P21 kelime kuralı | **YENİ** (komşu ekran) | low / safe | `07-wowner-1440-settings-general.png` |
| 15 | Başlık | hepsi · 1440 + 390 | Üst yazı "TODAY'S WORK. ONE PLACE."; açıklama iki satır ve selamlamayı içine alıyor; telefonda dört satır | — | BL-815 / S5 (varyant bekliyor) | low / safe | `01-ayse-390-full.png` |

## Öneriler (zevk, engel değil)
- Boş durum yazıları ("No open todos", "You're all caught up") 16 px ve kart yazısından (13 px) büyük. Todo kutusunun yazısı da 16 px. Notifications sayfasının boş durumu 16/12 px; aynı ölçüye çekilebilir.
- Telefonda Today, Open shifts ve Notifications kartlarının sabit 210 px yüksekliği bol boş alan bırakıyor. Telefonda yükseklik içeriğe göre olabilir.
- Customize'daki ok ve göz düğmeleri telefonda 38×36 px. WCAG 2.1 AA'da sınır yok, ama 44 px parmakla daha rahat basılır.
- Checklist başlığı 15 px, kart başlıkları 14 px. Aynı ölçü daha düzenli görünür.
- Hata ekranına "Try again" düğmesi (BL-814'le birlikte).

## Tutarlı olanlar
- Klavye: başlık, checklist, kart bağlantıları ve Quick actions'ta odak halkası genel kuralla aynı (2 px `--theme-focus`). Sıra soldan sağa, yukarıdan aşağıya. Pasif Add düğmesi sekmede atlanıyor.
- Telefonda Schedule'a giden her şey gizli: Open shifts bağlantısı, Quick actions'taki "Open Schedule", checklist'teki "First schedule view". Bu KARARLAR'daki "Schedule telefonda tamamen kapalı" kararıyla uyumlu.
- Müdür Ayse checklist'i görmüyor; owner ve admin görüyor (admin'in görmesi S3'e bağlı).
- Diğer kontrastlar geçiyor: bağlantı yeşili 6.32:1, gri yazı (`--theme-muted`) 5.07:1, üst yazı 6.07:1.
- Ok simgeleri ve satır simgeleri `aria-hidden`. Başlık sırası düzgün: sayfada bir h1, kartlarda h2.
- Tarayıcı diyaloğu çıkmadı; Customize → Cancel soru sormadan kapanıyor.
- Yükleniyor durumu ("Loading Workspace...") Announcements ve Notifications sayfalarıyla aynı stilde.

## Kanıt
- **Ekran görüntüleri:** `C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/nf-gorsel-qa/EKRAN-05/`
  - `01-*`: üç kullanıcının ilk açılışı.
  - `02-*`: sayfanın aşağı kaydırılmış hâli.
  - `03-*`: bağlantının üzerine gelme.
  - `04-focus-*`: klavye odağı.
  - `05-customize-*`: Customize modu.
  - `06-*`, `07-*`: admin ve Settings → General.
  - `08-rich-*`: 5 duyuru, 3 to-do, 5 bildirimle sahte veri (yalnız tarayıcıda).
  - `09-loading-*`: yükleniyor.
  - `10-error-*`, `10-abort-*`: hata ve bağlantı kopması.
  - `10-raw-zod-error-1440.png`: kendi bozuk mock'umla oluştu; yalnız ham hatanın nasıl basıldığına kanıt.
- **Ölçüm:** kontrast oranları WCAG formülüyle hesaplandı. Düğme ve yazı ölçüleri tarayıcıda `getComputedStyle` ile 2026-10-06'da `d311a2c5` üzerinde alındı.
- **Scriptler** (scratchpad'de): `w1.mjs`–`w7.mjs`, ortak yardımcı `lib5.mjs`.

**Hafıza:** giriş yolları ve mock tuzakları `.claude/agent-memory/nf-gorsel-qa/workspace-dashboard-qa-paths.md` dosyasına yazıldı, `MEMORY.md`'ye eklendi. Write aracı kapalı olduğu için dosya Bash ile yazıldı.

Sunucular kapatılmadı. Ben sunucu başlatmadım; açtığım tarayıcılar her scriptin sonunda kapandı.
