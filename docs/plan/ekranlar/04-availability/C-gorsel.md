KARAR: DEĞİŞİKLİK İSTE @d311a2c5. Bu bir keşif turuydu, incelenecek bir dal yoktu. Ana dalın bugünkü hâlinde 3 erişilebilirlik bulgusu (WCAG 2.1 AA), 4 tutarsızlık ve hata hâlinde ham sunucu cümlesi buldum. Toplam 7 bulgu yeni ya da var olan bir maddeye ek; geri kalanı keşifteki E4 ve backlog maddelerini doğruluyor.

Hiçbir veri yazılmadı. Sunucuya giden okuma dışı her istek tarayıcıda bloklanacaktı; hiçbiri tetiklenmedi (blok listesi boş). Save, Publish ya da Approve'a basılmadı. Sunucuları ben başlatmadım, kapatmadım.

**Hesap notu:** Meyhouse'ta tek lokasyonlu tek müdür `mt.tepebas@gmail.com`. Bu senin kendi hesabın gibi görünüyor; kullanmadım. Tek lokasyonlu müdür olarak test dünyasındaki Ayse'yi (`e2e1791130198245.ayse…`, Kadikoy, 30 satır) kullandım. Owner için `owner@newfork.test` girdim; onun Meyhouse'unda listede yalnız 4 kişi var.

## Bulgular (önem sırasıyla)

| no | Ekran / yol | Rol + genişlik | Ne görünüyor | Ölçüt | Eşleşme | leave / do | Görüntü |
|---|---|---|---|---|---|---|---|
| 1 | Availability → arama kutusu ve Location listesi (klavyeyle gelince) | owner, müdür · 1440 | Tab'la arama kutusuna gelince yalnız %12 saydam yeşil halka çıkıyor (kontrast ~1,1:1); konum listesinde 1 px'lik iç çizgi var. Kutuya gelen kişi nerede olduğunu neredeyse göremiyor. Availability bu iki alanın kendi odak çizgisini bilerek sıfırlıyor (`apps/web/src/availability/weekly-team.css:177-183`, `outline: 0`). Announcements'ta da aynı zayıf halka var, yani sorun ortak. | WCAG 2.4.7, 1.4.11 | BL-600 ("odak zayıf"); `weekly-team.css`'teki sıfırlama ek kanıt | medium / moderate | `owner-1440-13-focus-search_app_availability.png` |
| 2 | Settings → Scheduling → Availability → Entry mode | owner · 1440, 390 | Seçili seçenek ("Time range") yalnız beyaz zeminle ayrılıyor: `#fff`, gri `#f7f9f8` zemin üstünde (~1,05:1), yazı kalınlığı aynı. Hangi modun seçili olduğu neredeyse görünmüyor. Aynı sayfadaki "Week starts on" ve "Time format" seçimi açık yeşil zemin ve yeşil yazıyla gösteriyor; tek sayfada iki ayrı seçim dili var. | WCAG 1.4.11; CLAUDE.md §9 tutarlılık | YENİ | medium / safe | `owner-1440-14-settings-entry-mode.png`, `owner-1440-16-settings-entry-focus.png` |
| 3 | Availability → liste yüklenemezse (API'den hata yanıtı taklit edildi) | müdür · 1440, 390 | Ekrana sunucunun ham cümlesi geliyor: "Internal server error". Mesaj yoksa okuma hatasında "Availability could not be updated" diyor, ama hiçbir şey güncellenmiyordu. Retry tarayıcının boyanmamış düğmesi (siyah çerçeve, 16 px). Telefonda ~26 px yüksek, 44 px dokunma hedefinin altında. Uygulamanın ortak hata kartı kullanılmıyor. | P21 (kısa, sistem dili yok); düğme dili; WCAG 2.5.5 | BL-798 + BL-621 (ham cümle); Retry'ın görünümü YENİ | low / safe | `mgr-1440-18-error.png`, `mgr-390-18-error.png` |
| 4 | Availability → satır → Employees çekmecesi → Availability | owner · 1440 | Ali'nin Salı "2:00 PM - 6:00 PM" ve Cuma "All day" işaretleri çekmecede kırmızı hap. Aynı veri listede amber (`#fff1e2` / `#8a4a06`), Schedule'da turuncu "!". Kurala göre amber müsaitlik, kırmızı izin. Ayşe çekmecedeki kırmızıyı izin sanabilir. Çalışanın My Availability formunda da gösterge noktası kırmızı. | KARARLAR Schedule hücre renkleri (amber = müsaitlik, kırmızı = TIME OFF); §9 renk rolü | YENİ | low / moderate (form My Availability ve onboarding'de de kullanılıyor) | `owner-1440-06-drawer.png` |
| 5 | Availability → Employee sütunu | müdür · 1440 | Uzun adlar kesiliyor: "Admint2cmi Per…", "Doc2z6zc-Deniz…". 76 px'lik hücrede üç satır yer varken ad tek satıra sıkıştırılıyor. "Christopher Montgomery" gibi gerçek bir ad da kesilir. | KARARLAR Izgara kuralları ("isim hücresi: yalnız tam ad"); Genel ortak dil ("ilk sütun satır kırabilir") | YENİ | low / safe | `mgr-1440-01-all.png` |
| 6 | Settings → Scheduling (aynı sayfa) | owner · 1440 | İki kaydetme düğmesi iki ayrı ölçüde: "Save rules" 42 px / 16 px / kalın 750, Availability'nin "Save"i 36 px / 14 px / 400. "Save rules" değişiklik yokken de açık. | §9 aynı işlev aynı ölçü | Açık kalması BL-677; ölçü farkı YENİ (BL-677'ye ek) | low / safe | `owner-1440-15-settings-entry-bottom.png` |
| 7 | Arama ve Location kenarı | tüm roller · 1440 | Kenar hâlâ `#aeb9b4` (zeminde ~1,9:1). Requests'te kabul edilen `#7f8c86` kenar bu sayfaya gelmemiş. BL-801'in listesinde Availability (ve Announcements) yok. | WCAG 1.4.11 | BL-801 (Availability eklenmeli) / BL-600 | medium / moderate | `owner-1440-01-all.png` |
| 8 | Çekmece → Employee availability saatleri | owner · 1440 | Liste "2p – 6p" (uzun tire), çekmece "2:00 PM - 6:00 PM" (kısa tire). Aynı aralık iki ayrı biçimde. Listenin kısa biçimi bilerek seçilmiş; tire farkı seçilmemiş. | §9 tutarlılık | YENİ | low / safe | `owner-1440-06-drawer.png` |
| 9 | Availability listesi | müdür · 1440 | Müdür ve admin de listede ve hep "Not submitted": "Admint2cmi Person" gibi; sayı "30 employees". | KK-178 K1 | E4-01 / BL-789 (doğrulandı) | — | `mgr-1440-01-all.png`, `mgr-1440-02-missing.png` |
| 10 | Availability → Submitted sekmesi | owner, müdür · 1440 | "1 employees" | KARARLAR (AV3) | E4-18 / BL-661 (doğrulandı) | — | `owner-1440-02-submitted.png` |
| 11 | Availability → tablonun altı | müdür · 1440 | Sayfalama yok; 30 satır tek sayfa. | KARARLAR Genel sayfalama | E4-05 / BL-787 (doğrulandı) | — | `mgr-1440-10-scrolled.png` |
| 12 | Availability (telefon) | müdür · 390 | Tablo yana kayıyor, sabit ad sütunu yok, kaydırma ipucu yok. Sayı "30 em" diye kesiliyor (sayı kutusu ekran kenarından 2 px taşıyor). | ortak dil / telefon | E4-07 / BL-599 (doğrulandı) | — | `mgr-390-01-all.png` |
| 13 | Çekmece → Availability sekmesi | owner, müdür · 1440, 390 | Not hâlâ "Manager reminders" adında; "Last edited by …" satırı yok. | KK-178 K2 | E4-16 / BL-799 (doğrulandı) | — | `owner-1440-07-manager-note.png`, `mgr-390-07-manager-note.png` |
| 14 | Çekmece (telefon) | müdür · 390 | Çekmecede kişinin adı ve durumu görünmüyor; kimin kaydında olduğu belli değil. | §9 | BL-783 (Availability'den açılınca da aynı) | — | `mgr-390-06-drawer.png` |
| 15 | Employee view → My Availability | müdür Ayse · 1440, 390 | Kilitli form: "Not submitted", soluk "Add hours", kapalı Save. Nedeni yazmıyor. | E4-04 / S1 | BL-796 (doğrulandı) | — | `mgr-1440-09-employee-view-avail.png`, `mgr-390-09-employee-view-avail.png` |
| 16 | Employee view → My Availability | owner · 1440 | Menüde My Availability seçili görünürken sayfa "You don't have access to Employee Hub… Ask an admin for access." diyor; owner'ın üstünde admin yok. | P21 | BL-422 (doğrulandı) | — | `owner-1440-09-employee-view-avail.png` |

## Öneriler (zevk, engel değil)
- Çekmecenin Manager note sekmesinde Save hiçbir değişiklik yokken açık, Discard kapalı. Settings panelinde ikisi de kapalı başlıyor; aynı form ailesinde tek davranış daha anlaşılır olur.
- Yükleniyor hâli düz metin ("Loading availability..."). 2,2 saniyede uygulama kabuğu henüz boş olduğu için ekranda yakalayamadım; liste sayfalarının ortak yükleniyor görünümü kurulduğunda buraya da gelmeli.
- Settings → Scheduling'deki "Saved separately from Schedule basics…" cümlesi geliştirici notu gibi okunuyor (P21). Bu Settings turunun konusu.

## Tutarlı olanlar
- Sayfa iskeleti ortak dille piksel piksel aynı: üst yazı y=62, başlık y=80 (38 px), açıklama y=133, sekmeler y=190, süzgeç y=240, tablo y=292. Sekme değişince ve boş hâlde hiçbiri kaymıyor. Telefonda başlık 28 px.
- Sütun başlıkları satırı (`#e6ece8`, 11 px, 600, `#4f5d57`), tablo çerçevesi (`#d7dcda`, köşe 7), Location kutusu 180 × 36, arama kutusunun satırın kalanını doldurması, sekme ölçüleri, sağdaki "N employees" sayısı KARARLAR'la aynı.
- Boş hâl metni ve görünümü kurala uyuyor: "No employees match this view" / "Try another status or location, or clear your search."
- Amber hücre yazısı `#8a4a06`, `#fff1e2` zeminde ≈6:1, geçiyor. Hücre 76 px, ortalı ad ve kısa saat biçimi kararla aynı.
- Sekme düğmeleri, sıralama düğmesi, ad ve gün hücrelerinde 2 px yeşil odak çizgisi görünüyor. Tablo alanı Tab'la odaklanabiliyor. Gün hücrelerinin ekran okuyucu adı tam ("Alex Kim Tuesday: 2p – 6p"). Tablo başlığı yapışkan.
- Erişim reddinde (`authz.*`) ortak "You don't have access to team availability" kartı çıkıyor, ham cümle çıkmıyor.
- Tarayıcı diyaloğu yok; ekranda "business" ya da kod adı görmedim.

## Kanıt
- **Ekranlar ve roller:**
  - Availability: All / Submitted / Not submitted, Location süzgeci, boş arama, klavye gezintisi. Owner ve müdür, 1440 ve 390.
  - Çekmece: Employee availability ve Manager reminders sekmeleri. Owner 1440; müdür 1440 ve 390.
  - Settings → Scheduling → Entry mode: owner, 1440 ve 390.
  - Employee view → My Availability: owner 1440; müdür 1440 ve 390.
  - Yükleniyor / hata / erişim-yok hâlleri, takım listesi isteği tarayıcıda taklit edilerek: müdür, 1440 ve 390.
  - Karşılaştırma için Announcements ve Employees.
- **Görüntüler:** `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-gorsel-qa\EKRAN-04\` (owner-1440-01…16, owner-390-15/16, mgr-1440-01…19, mgr-390-01…19).
- **Nasıl:** playwright-core 1.61.1, başsız Chrome. Girişler: owner için seed parolasıyla, Ayse için dünya parolasıyla giriş, sonra `/sign-in#access_token=…`. Yerel DB'de yalnız SELECT (hesap ve lokasyon seçimi).
- **Hafıza:** `.claude/agent-memory/nf-gorsel-qa/availability-qa-logins-and-traps.md` güncellendi: bu turun giriş yolları, takım listesi isteğinin adresi, hata taklidinin doğru biçimi.
