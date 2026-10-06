**KARAR: DEĞİŞİKLİK İSTE** (incelenen sürüm `origin/main` @ `d311a2c5`; bu keşif turunun görsel kısmı, inceleme sonucunda dal onayı yok)

Değişiklik istememin nedeni üç kural ihlali: Archive tek tıkla çalışıyor, ekran metninde sistem kelimesi olarak "organization" geçiyor ve ekranda ham sunucu cümlesi görünüyor. Bunlara ek olarak 6 yeni tutarsızlık buldum. Erişilebilirlik tarafında kontrast ve odak kuralı tutuyor. Hiçbir veri yazılmadı: Save, Publish, Archive ve Approve'a basılmadı. Bütün yazma istekleri tarayıcıda engellendi; script'in kayıtlı engel listesi her geçişte boş kaldı.

## Bulgular (önem sırasıyla)

Görüntülerin klasörü: `C:/Users/TheWe/Documents/Codex/newfork-clean/artifacts/nf-gorsel-qa/EKRAN-06/`

| No | Ekran / yol | Rol + genişlik | Ne görünüyor | Ölçüt | Eşleşme | leave / do | Görüntü |
|---|---|---|---|---|---|---|---|
| 1 | Settings → Documents → satır menüsü (⋯) → Archive | owner 1440, 390 | Archive kırmızı yazılı ama tek tıkla çalışıyor; iki tıklık onay adımı yok. Mert "Alcohol server permit"e yanlışlıkla basarsa belge anında arşive gider (`DocumentsSettingsPage.tsx:524-536`). | CLAUDE.md §9 (yıkıcı eylem iki tık kırmızı), KARARLAR 599 | E6-12 / BL-595 | medium / safe | `21-owner-1440-row-menu.png`, `21-owner-390-row-menu.png` |
| 2 | Settings → Documents → New document → Step 1 → "Time & review" | owner 1440, 390 | Onay kutusunun metni "Restrict **organization** access after the delivery period" (`DocumentLifecycleFields.tsx:462`). | §9 ve P21: ekrandaki sistem terimi workspace / team | **YENİ** | low / safe | `24-owner-1440-new-step1-empty.png` |
| 3 | Settings → Documents → ⋯ → Unpublish (Publish de aynı pencereyi kullanıyor) | owner 1440, 390 | Pencere biçimsiz. Tarayıcının varsayılan tanım listesi kullanılmış (Locations / Departments / Jobs 40 px içeride), listeler madde işaretli. Pencerede 6 ayrı başlık var. "Departments in this preview" bu belgeyle ilgisi olmayan 8 departmanı sayıyor. Asıl etki ("2 people pause") en altta; 1440'ta da 390'da da kaydırmadan görünmüyor. "Reason" alanı zorunlu ama işareti yok. (`DocumentPublicationDialog.tsx:111-205`) | Görsel tutarlılık (düzenleyiciyle aynı dil değil), P20 / P21 | **YENİ** (Reason kısmı BL-469) | medium / moderate | `22-owner-1440-unpublish-dialog.png`, `22-owner-390-unpublish-dialog.png` |
| 4 | Employees → Documents → onaylı (Completed) satır → çekmece | owner, admin 1440 | Deniz'in zaten onaylanmış kartında tam karar formu açık: Rejection reason, Correction period ve yeşil, basılabilir **Approve**. Onaylı belgeyi bir daha onaylamak anlamsız bir eylem. Koddaki koşul `["pending_review","accepted"]` (`DocumentReviewDrawer.tsx:384-388`). | Tutarlılık / hata | **YENİ** (E6-18 ve E6-06 ailesi) | low / safe | `31-owner-1440-drawer-completed.png` |
| 5 | Employees → Documents → çekmece → "Review decision" bölümü | owner, admin 1440, 390 | Rejection reason ve Correction period alanları öteki alanlardan 16 px içeride başlıyor ve 32 px daha dar (Keep seçimi x=816, 593 px geniş; ret gerekçesi x=832, 561 px geniş). "Review decision" başlığı da kaymış. Neden: fieldset'in tarayıcı varsayılan iç boşluğu (`DocumentReviewDrawer.tsx:654`). | Görsel tutarlılık (aynı pencerede aynı genişlik) | **YENİ** | low / safe | `31-owner-1440-drawer-review.png`, `37-owner-390-drawer-review.png` |
| 6 | Employees → Documents, yüklenirken ve hata anında | owner 1440 | "Loading documents…" ve hata yazısı tablonun içinde değil, boş tablo çerçevesinin **altında**, ekranın dibinde (y≈805) duruyor; tablo gövdesi boş. Settings → Documents'ta aynı yazı tablonun yerinde (`EmployeeDocumentsList.tsx:297-305`). | Tutarlılık, durum ekranları | **YENİ** | low / safe | `60-owner-1440-employees-loading.png`, `61-owner-1440-employees-error.png` |
| 7 | Her iki ekranın hata hâli | owner 1440 | Hata anında kullanıcıya ham sunucu cümlesi "Internal server error" gösteriliyor. Tekrar deneme düğmesi de yok. | G11, P21 | E6-08 / BL-828 | medium / safe | `61-owner-1440-settings-error.png` |
| 8 | Settings → Documents → Published sütunu | owner 1440 | Her satırda tarih kesik: "Oct 4, 2026, 9:10 …". Saat okunmuyor ve üzerine gelince tam metni gösteren ipucu (title) yok (`DocumentsSettingsPage.tsx:466-474`). DOC-TABLE'da "taşan üç nokta" kuralı var, ama sütunun tek bilgisi kayboluyor. | Okunabilirlik | **YENİ** | low / safe | `01-owner-1440-settings-documents.png` |
| 9 | Settings → Documents: liste ve düzenleyici Step 2 | owner 1440, 390 | Aynı biçimler iki yerde iki farklı yazılıyor: listede "JPEG, PDF, PNG, WebP", düzenleyicide "PDF, JPEG, PNG, WEBP" (`DocumentsSettingsPage.tsx:50` ile `DocumentSettingsEditor.tsx:394`). | Metin tutarlılığı | **YENİ** | low / safe | `20-owner-390-settings-list.png`, `26-owner-1440-new-step2.png` |
| 10 | Düzenleyici → Step 2 → Additional fields | owner 1440, 390 | "0 fields" yazısının yanında "1 / 1" sayfa okları duruyor (`DocumentLifecycleFields.tsx:589`). | Metin / mantık | **YENİ** | low / safe | `26-owner-1440-new-step2.png` |
| 11 | Çekmece: durum satırı, sürüm başlığı, owner kartı | owner 1440, 390 | Durum çip olmadan düz metin ("Needs review"); ekranda ham kodlar görünüyor: "Version 1 · pending review", "accepted", owner kartında "keep". | P21, DOC-TABLE çip | E6-14 / BL-830, BL-674 | medium / safe | `31-owner-1440-drawer-review.png`, `31-owner-1440-drawer-onfile.png` |
| 12 | Düzenleyici → Step 2 özeti | owner 1440 | "Manager Approval" ve "Not Tracked" büyük harfle başlıyor. | Metin dili | E6-27 (D15, BL-664 (3)) | low / safe | `26-owner-1440-new-step2.png` |
| 13 | İki ekranın sekmeleri ve tablo rolleri | owner 1440 | Sekmeler arasında ok tuşuyla geçilemiyor (iki ekranda da sınandı). Settings sekmeleri `role=tab`, Employees sekmeleri `aria-pressed` kullanıyor. Settings satırları tablo rolünde değil. Employees'te satır klavyeyle odaklanıyor (`tr tabindex=0`) ama ekran okuyucuya rolü ve adı söylenmiyor. | WCAG 2.1.1, 4.1.2 | E6-15 / BL-602, BL-593 | medium / safe | `33-owner-1440-row-focus.png` |
| 14 | Employees → Documents, telefon | owner 390 | Tablo 780 px; 296 px'lik kutuda yana kayıyor. Document ve Status sütunları ekranın dışında kalıyor, sekmeler "Exp…" diye kesiliyor. | KARARLAR (telefonda kart satırı), PHONE-MGR D1 | E6-13 / BL-599 (varyant gerekir, S22) | medium / moderate | `36-owner-390-emp-list.png` |
| 15 | Settings → Documents, telefon | owner 390 | Telefonda liste tek sütun başlıklı (sadece "DOCUMENT NAME") ve meta satırı tire ile birleşmiş; kararlaştırılan kart satırı değil. | KARARLAR 311 (telefonda kart satırı) | E6-13 / BL-599 (PHONE-MGR2) | medium / moderate | `20-owner-390-settings-list.png` |
| 16 | Boş liste çerçevesi | owner 1440 | Employees → Expired boşken çerçeve sayfanın dibine kadar uzuyor; Settings → Archived boşken y≈593'te bitiyor. | Tutarlılık | P3 E9 (varyant gerekir) | low / moderate | `34-owner-1440-expired-empty.png`, `28-owner-1440-archived-empty.png` |
| 17 | Düzenleyici → Step 2 → Esc | owner 1440 | Step 2'de Esc'e basınca düzenleyici sormadan kapanıyor ve doldurulan her şey gidiyor. | P26 | E6-23 / BL-833 (S9 cevabı bekleniyor) | low / safe | `27-owner-1440-after-esc-step2.png` |
| 18 | Müdür Ayşe: iki Documents adresi | manager 1440, 390 | İki adres de hiçbir şey demeden Workspace'e döndürüyor; menüde ve telefondaki More'da Documents yok. Bugünkü izin durumuyla beklenen sonuç bu. | — | E6-01 / BL-560 (S1 cevabı bekleniyor) | high / risky | `40-ayse-1440-settings.png`, `40-ayse-390-employees.png`, `41-ayse-390-more-menu.png` |

## Öneriler (zevk ya da küçük, engel değil)
- **Sayfa zeminleri farklı:** Settings sayfası `#f6f7f5`, Employees → Documents `#f4f6f4`. Sağ kenar boşlukları da farklı: Settings 62 px, Employees 48 px; DOC-TABLE'da kenar boşluğu 32 px.
- **Yükleniyor yazısı:** Settings'te "Loading document types..." (üç nokta), Employees'te "Loading documents…" (tek karakterlik üç nokta).
- **Çekmecenin sol alttaki "Next" düğmesi:** neyin "sonraki"si olduğu belli değil; "Next document" daha açık olur.
- **Çekmece açılışında odak:** başlığa değil "Optional file note" kutusuna düşüyor.
- **Telefonda "History" açılır satırı:** dokunma yüksekliği ~20 px.
- **Expired sekmesi:** 0 olunca sayısını gizliyor, öteki sekmeler sayı gösteriyor.
- **Ayşe'nin sessiz yönlendirmesi:** bir açıklama satırı verilebilir. Bu bütün uygulamanın davranışı, BL-176 ile ilgili.

## Tutarlı olanlar
- **Sayfa iskeleti** iki ekranda da DOC-TABLE'la piksel piksel aynı: üst yazı y=62, başlık 80, sekmeler 190, filtre 240, tablo 292. Sekme ve boş/dolu geçişlerinde hiçbir şey kaymıyor.
- **Ölçüler ve metinler kararla aynı:** boş hâl metinleri harfi harfine KARARLAR'daki gibi. "New document" yeşil ve 36 px. Filtre genişlikleri 200 ve 180, başlık satırı 40 px.
- **Kontrast AA'yı geçiyor:** en düşük değer seçili olmayan sekmede 4,67:1. Çipler 5,55–5,95, tablo hücresi 8,25.
- **Görünür odak:** sekme, sıralama düğmesi, satır, ⋯ menüsü ve Employees satırında 2 px yeşil çerçeve var; açılır listede iç halka.
- **Klavye:** satır menüsü Enter / Tab / Esc ile çalışıyor. Çekmece odağı içinde tutuyor, Esc ile kapanıyor ve odak açıldığı satıra dönüyor.
- **Düğme dili:** pencerelerde Cancel beyaz, ana aksiyon yeşil.
- **Diyalog ve ekran metni:** tarayıcı diyaloğu yok; ekran metninde "team" ya da kod adı yok (bulgu 2 hariç).
- **Telefon:** menü öğeleri 44 px, menü alt çubuğun altında kalmıyor.

## Kanıt
- **Roller:** owner Olcay ve admin Zeynep (1440 ve 390), müdür Ayşe (1440 ve 390, yalnız erişim-yok hâli). Test dünyası `e2e1791130198245`; bu dünyada taslak ya da arşivli belge türü yok. Bu yüzden Publish penceresini, aynı bileşeni kullanan Unpublish üzerinden gördüm.
- **Yöntem:** Playwright, kurulu Chrome ile. Script'ler `scratchpad/{lib,set,drawer,phone2,ayse,c2,err}.mjs` içinde. Yazma istekleri 5639 ve 55321 portlarında engellendi; yalnız Unpublish önizlemesine izin verildi, o da salt okuma yapıyor (`preview_document_publication_service` STABLE).
- **Ölçümler:** kontrast ve konumlar tarayıcının hesapladığı stillerden ölçüldü. Yükleniyor ve hata hâlleri iki listenin okumasını 6 sn geciktirip 500 döndürerek çekildi.
- **Sunucular:** 5638 ve 5639'a dokunmadım, kapatmadım.
- **Açılan skill'ler:** design-critique ve accessibility-review çerçeve olarak kullanıldı.
- **Hafıza:** bu ekranın giriş yolları ve tuzakları `.claude/agent-memory/nf-gorsel-qa/documents-qa-paths.md` dosyasına yazıldı, `MEMORY.md`'ye bir satır eklendi.
