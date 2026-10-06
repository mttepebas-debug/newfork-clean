**KARAR: DEĞİŞİKLİK İSTE** (incelenen sürüm `origin/main` @ `20332d46`; bu keşif turunun görsel kısmı, dal onayı değil)

## Özet
- **Bulgu sayısı:** 18. Önem dağılımı: orta 8, düşük 10. Bunların 3'ü YENİ, 12'si var olan bir BL'ye bağlı, 3'ü görev dosyasında yazılı (`tasks/EKRAN-07-ANNOUNCEMENTS.md` C1). Ayrıca 5 öneri var.
- **Değişiklik istememin nedeni**, kural ihlalleri:
  - Taslak penceresinde tek basılabilir aksiyon olan "Publish" beyaz (§9 buton dili).
  - Uzun yazılmış mesaj Esc ile sorulmadan kayboluyor (P26).
  - Hata anında ham sunucu cümlesi ekrana çıkıyor (P21).
  - Yüklenirken ve hata anında owner ekranı çalışan ekranına dönüşüyor (tutarsızlık).
  - Arama kutusunda klavye odağı neredeyse görünmüyor (WCAG 2.4.7).
- **Sağlam olanlar:** sayfa iskeleti, kontrast ve tablo ölçüleri kararla aynı.
- **Veri yazılmadı:** Publish, Save, Delete (ikinci tık), Archive ve Acknowledge'a basılmadı. GET dışındaki her istek tarayıcıda engellendi; engel listesi her koşuda boş kaldı.

Görüntülerin klasörü: `C:/Users/TheWe/Documents/Codex/newfork-wt/plan-e08/artifacts/nf-gorsel-qa/EKRAN-07/`

## Bulgular (önem sırasıyla)

| No | Ekran / yol | Rol + genişlik | Ne görünüyor (isimli örnek) | Ölçüt | Eşleşme | leave / do | Görüntü |
|---|---|---|---|---|---|---|---|
| 1 | Announcements, yüklenirken ve hata anında | owner 1440 | Owner Olcay sayfayı açar, liste gelene kadar ekran çalışan ekranına dönüyor. Açıklama "Updates your managers have shared with your team." oluyor, sekmeler yalnız "All · Published", "New announcement" yok. Liste gelince açıklama, sekmeler ve düğme değişiyor (`AnnouncementsPage.tsx:153-156, 170-176, 251`: veri yokken `can_manage` yanlış sayılıyor). | Tutarlılık, durum ekranları, KK-136 (üst kısım oynamaz) | **YENİ** | medium / safe | `12-owner-1440-loading.png`, `13-owner-1440-error.png` |
| 2 | Announcements → New announcement (ya da bir satır) → Esc / X | owner 1440 | Olcay mesaja 30 satırlık bir metin yazıp Esc'e basıyor. Pencere sormadan kapanıyor ve yazdığı her şey gidiyor. | P26 (uzun yazılmış işte "Discard unsaved changes?") | Görev dosyası C1 (A7) | medium / safe | `23-owner-1440-new-after-esc.png` |
| 3 | Announcements → taslak satır → pencere altı | owner 1440, 390 | "Friday staff tasting" taslağında sağ alttaki tek basılabilir aksiyon **Publish** beyaz. Yeşil "Save changes" değişiklik yokken soluk ve basılamaz. Değişiklik olunca bu kez Publish kapanıyor ve "Save your changes before publishing." yazıyor (`:832-868`). | §9 (aksiyon yeşil), A5 / A6 (tek yeşil düğme) | Görev dosyası C1 (A5 / A6) | medium / moderate | `26-owner-1440-edit-draft.png`, `27-owner-1440-edit-draft-changed.png`, `37-owner-390-edit-draft.png` |
| 4 | Announcements listesi, Status sütunu | owner 1440, employee 1440 | Süresi 30 Eylül'de dolan "September tip pool report" yeşil **Published** görünüyor; çalışan Ali'nin listesinde de duruyor. 5 Ekim'de yayınlanamayan "Fire drill on Monday" amber **Scheduled** ve geçmiş tarihli görünüyor. | K21, A9 / A10 | BL-864 (görsel olarak doğrulandı) | medium / safe | `01-owner-1440-list.png`, `40-ali-1440-list.png` |
| 5 | Announcements, telefon | owner, Ayşe, Ali 390 | Ayrıntılar: (1) Tek sütun başlığı "ANNOU…" diye kesik. (2) Sekme satırı yana kayıyor: "Publishe" yarım, "Archived" görünmüyor ve kaydırılabileceğine dair ipucu yok. (3) Durum çip değil düz metin ("Scheduled · Nov 20, 2026"). (4) Ali'de "Acknowledge" düğmesi başlık sütununu 160 px'e sıkıştırıyor; alerjen duyurusunun başlığı 6 satıra bölünüyor. (5) Ali'de başlığın altında boş 40 px'lik bant var. | KARARLAR (telefonda kart satırı: başlık, ilk satır, durum rozeti, tarih) | BL-599, BL-542, BL-877 (E7-26) | medium / moderate | `34-owner-390-list.png`, `35-owner-390-list-scrolled.png`, `38-owner-390-tabs-after-scroll.png`, `40-ali-390-list.png` |
| 6 | Announcements, hata hâli | owner 1440 | Liste okunamayınca "Internal server error" yazıyor; tekrar deneme düğmesi yok. | P21, G11 | BL-866 ailesi (BL-654) | medium / safe | `13-owner-1440-error.png` |
| 7 | Filtre satırı → arama kutusu | owner 1440 | Klavyeyle arama kutusuna gelince kenar gri kalıyor (`#aeb9b4`, odaksızla aynı). Odağı gösteren tek şey %12 saydam, 2 px'lik yeşil gölge; beyazda yaklaşık 1,15:1. Odak gözle seçilmiyor. Kutu ortak (`.toolbar-search`), bu yüzden komşu liste sayfaları da büyük olasılıkla aynı durumda; bunlara ayrıca bakmadım. | WCAG 2.4.7, 1.4.11 | **YENİ** | medium / safe | `55-owner-1440-search-focus.png` |
| 8 | Sekmeler (All / Draft / Scheduled / Published / Archived) | owner 1440 | Sekmeler `role=tab` ama ← → ile geçilmiyor; her sekme ayrı bir Tab durağı. | WCAG 2.1.1, ARIA sekme deseni | BL-602 | medium / moderate | `50-owner-1440-keyboard-focus.png` |
| 9 | Boş liste | owner 1440, Ali 1440 | Metin kararla aynı değil: ekranda "Create an announcement to share an update with your team.", kararda "Share an update with your team.". Boş hâlde "New announcement" düğmesi yok. 48 px'lik açık yeşil daire yok; simge düz gri. Zemin beyaz (karar `#f7f9f8`). Important Dates'in boş hâli de birebir aynı biçimde karardan ayrılıyor. | KARARLAR "Liste sayfalarının ortak dili" (boş hâl ve metinleri) | Görev dosyası C1 (boş hâl) | low / safe | `10-owner-1440-empty.png`, `44-ali-1440-empty.png` |
| 10 | Archived sekmesi → "Old uniform policy" → pencere | owner 1440 | Owner arşivlenmiş duyuruyu açınca sağ altta "Acknowledge" çıkıyor. Bu düğme 28 px, yanındaki "Close" 36 px. Arşivde Restore yok; satır menüsünde yalnız "View announcement" var. | Tutarlılık, K8 | BL-873; Restore kısmı BL-543 | low / safe | `05-owner-1440-tab-archived.png`, `28-owner-1440-view-archived.png` |
| 11 | Çalışanın listesi → "Acknowledge" | Ali 1440, 390 | Düğme 24 px yüksek, yazısı 13 px ve normal kalınlıkta, beyaz zemin üstünde soluk kenarlı. Telefonda dokunma alanı 24 px (öteki telefon öğeleri 44 px). BL-541'in "16 px yazıyor" ölçümü bugün tutmuyor: yazı 13 px. | Ölçü tutarlılığı, dokunma hedefi | BL-541 (değişmiş) | low / safe | `40-ali-1440-list.png`, `40-ali-390-list.png` |
| 12 | Çalışanın okuma penceresi | Ali 1440, 390 | Ali bir duyuruyu açınca yöneticinin kilitli formunu görüyor. Title, Message ve Publish at beyaz, düzenlenebilir gibi duruyor; Category gri. Aynı pencerede iki farklı "kilitli" görünümü var. | Tutarlılık, S3 | BL-876 | low / safe | `41-ali-1440-read-window.png` |
| 13 | New announcement → Locations seçicisi | Ayşe (tek lokasyon müdürü) 1440 | Kadıköy müdürü Ayşe'nin seçicisinde "All locations" kutusu işaretlenebilir duruyor. | K1 | BL-871 (görsel olarak doğrulandı) | low / safe | `32-ayse-1440-new-locations-picker.png` |
| 14 | Employee view → Home → "Team notices" | Ali 1440, 390; owner Employee view | Owner'ın Employee view'ında arşivlenmiş "Old uniform policy" kartta görünüyor. Kategori 9 px büyük harf ("GENERAL"). Kartın adı menüdeki adla farklı ("Team notices" / "Announcements"). Boş metin "No new notices. Enjoy a little quiet." | E7-16, anti-hedef "oyuncak görünüm" | BL-870 | low / safe | `46-owner-1440-employee-view-team-notices.png`, `43-ali-390-team-notices-card.png`, `45-ali-1440-team-notices-empty.png` |
| 15 | Announcements, telefon → taslak satırı | owner 390 | "Friday staff tasting" taslağı masaüstünde "Not published" yazıyor. Telefonda "Draft · Oct 5, 2026" yazıyor: oluşturulma tarihi yayın tarihi gibi görünüyor (`:360-361`, `publish_at ?? created_at`). | Metin tutarlılığı | **YENİ** | low / safe | `34-owner-390-list.png` |
| 16 | Audience sütunu | owner, Ayşe 1440 | Her satırda "All roles · Kadikoy · All departments · A…". Asıl bilgi lokasyon, ama "All …" kalıpları sütunu dolduruyor ve sonu kesiliyor. | Okunabilirlik | BL-678 (E7-23) | low / safe | `01-owner-1440-list.png` |
| 17 | Satır menüsü / pencere → Delete | owner 1440, 390 | İki tık kırmızı dil doğru ("Delete" → "Confirm delete"), ama eylem arşivliyor. Yayındaki duyuruda Unpublish yok. | K8, B1 | BL-543 | low / safe | `07-owner-1440-row-menu.png`, `25-owner-1440-edit-delete-armed.png`, `36-owner-390-row-menu.png` |
| 18 | Tablonun altı | bütün roller | Sayfalama (25 / 50 / 100) yok. Bu dünyadaki az satırla görünür bir sorun değil, ama karar bütün liste sayfalarında sayfalama istiyor. | KARARLAR sayfalama, KK-182 K6 | BL-868 / BL-787 | low / safe | `01-owner-1440-list.png` |

## Öneriler (zevk ya da küçük, engel değil)
- **Sekme sayıları:** yalnız Draft ve Scheduled sayı gösteriyor; Published ve Archived göstermiyor.
- **Çalışanın satır menüsü (⋯):** içinde tek seçenek var ("View announcement"); satırın kendisi de aynı pencereyi açıyor.
- **Bilinmeyen duyuru adresi:** "This announcement is no longer available." listenin altında ayrı bir kutuda duruyor (`29-owner-1440-unknown-id.png`). Liste yerinde ya da ileti olarak gösterilmesi daha açık olur.
- **Çalışanın sütunları:** sıra "Announcement / Published date / Published by / Status". Tarih sütunu 125 px, yazar sütunu 264 px. Kararda çalışan görünümü için sütun ölçüsü yazılı değil; yönetici sütunlarıyla hizalanabilir.
- **Penceredeki Delete:** 32 px yüksek, yanındaki düğmeler 36 px (masaüstü).

## Tutarlı olanlar
- **Sayfa iskeleti kararla piksel piksel aynı:** üst yazı y=62, başlık y=80 (44 yüksek), sekmeler y=190 (40), filtre y=240 (36), tablo y=292. All / Draft / Scheduled / Published / Archived geçişlerinde ve boş/dolu hâlde hiçbir şey kaymıyor. Çalışanda boş sekme bandı da bu yüzden bilerek tutulmuş.
- **Sütun oranları:** dört veri sütunu 384 / 249 / 153 / 173 px, yani tam 40 / 26 / 16 / 18. Başlık satırı 40 px, `#e6ece8`, 11 px. Hücre yazısı 13 px, `#46514d`.
- **Filtre satırı:** "New announcement" yeşil (`#176954`), 36 px, köşe 7, 0 × 14, 13 px / 600; LIST-YESIL inmiş. Lokasyon süzgeci 180 px, 36 px, kenar `#aeb9b4`. Arama kalan genişliği dolduruyor.
- **Durum çipleri** kararın renkleriyle aynı: yeşil `#e7f1ed` / `#176b4e`, amber `#fff7e2` / `#8a5a00`, gri `#f0f3f1` / `#50605a`, 12 px, 2 × 8.
- **Kontrast AA'yı geçiyor:** en düşük değer seçili olmayan sekmede 4,67:1. Önizleme satırı ve pencere yardımcı metinleri 5,12, çipler 5,55–5,94, hücre 8,25.
- **Klavye:** sekme, sıralama düğmesi, satır ve "New announcement"da 2 px yeşil odak çerçevesi var. Pencere açılınca odak Title'a düşüyor. 30 Tab'da odak pencereden çıkmadı. Esc pencereyi kapatıyor ve odak açıldığı satıra dönüyor. Pencere alanlarında odak, koyu kenar ve halka ile görünüyor.
- **Buton dili:** Delete kırmızı ve iki tıkla çalışıyor ("Confirm delete"), Cancel / Close beyaz. Tarayıcı diyaloğu yok.
- **Metin:** ekranda "workspace" / "team" kuralına aykırı kelime ya da kod adı yok (bulgu 6'daki ham hata hariç).
- **Telefon:** başlık 28 px ve taşmıyor; sayfa yana kaymıyor (390 / 390). Pencere altındaki düğmeler 44 px.

## Kanıt
- **Roller:**
  - Owner Olcay: 1440 ve 390.
  - Tek lokasyon müdürü Ayşe (yalnız Kadıköy; `can_target_workspace=false`): 1440 ve 390.
  - Çalışan Ali: 1440 ve 390, ayrıca Employee view → Home.
  - Owner'ın Employee view'ı: Home kartı.
  - Test dünyası `e2e1791130198245`. Bu dünyada tek duyuru var ("Inventory count kbl4y"). Taslak, zamanlanmış, süresi dolmuş, yayınlanamamış, arşivlenmiş ve uzun başlıklı satırlar, okuma isteğinin cevabına tarayıcıda eklendi (`page.route`). Veritabanına hiçbir şey yazılmadı.
- **Yöntem:** Playwright 1.63, kurulu Chrome, `plan-e08` worktree'sinin `node_modules`'ünden. Telefonda dokunma açık (`hasTouch`, `tap`). Script'ler oturumun scratchpad klasöründe: `lib.mjs`, `mock.mjs`, `m.mjs`, `r1`–`r7.mjs`. GET dışındaki her istek 5639 ve 55321 portlarında 500'le engellendi; engel listesi her koşuda `[]`.
- **Ölçümler:**
  - Konumlar, renkler ve kontrast, tarayıcının hesapladığı stillerden ve WCAG formülüyle ölçüldü.
  - Yükleniyor hâli: liste okuması 8 sn geciktirildi. Hata hâli: okuma 500 döndürdü.
  - Odak: gerçek Tab / Shift+Tab / ← → / Enter / Esc tuşlarıyla denendi.
- **Sunucular:** 5638 ve 5639'a dokunmadım, kapatmadım. Başlattığım tek süreç Playwright'ın tarayıcısıydı; her koşu sonunda kapandı.
- **Açılan skill'ler:** design-critique ve accessibility-review çerçeve olarak kullanıldı; run yalnız yöntem için okundu (uygulama zaten açıktı).
- **Hafıza:** görev gereği `.claude/agent-memory/**` dosyalarına yazılmadı. Bir sonraki tur için not edilmeye değer olan: duyuru okuma adresi `GET :5639/v1/workspaces/<id>/communications/announcements` ve dünyada tek duyuru olduğu için cevabın tarayıcıda zenginleştirilmesi gerektiği.
