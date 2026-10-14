# Kodu yazılmış ama main'de olmayan işler (2026-10-09, main `cedf5982`)

Ölçüm: 246 uzak dalın bütün commit'leri bugünkü main'le içerik olarak karşılaştırıldı (yalnız commit adına değil, koda bakıldı). Bu sabahki denetimden sonra çok şey main'e girdi: Requests tek tablo ve takas penceresi, Employees listesi, Locations A, Jobs V1, Settings'te iki tık Archive, duyurularda iki tık Archive ve "Acknowledge again", Conflict handling adları, Schedule ızgara seçimlerin. Bunlar artık bu listede yok.

## Main'e alınabilecekler (önem sırasıyla)

| Sıra | Ne | Nerede (ekranda) | Durum | Ne bekliyor |
|---|---|---|---|---|
| 1 | **BL-969**: ad, adres ve telefonun ABD kuralı veritabanında; telefon maskesi ve iki numara kontrolü | Kurulum, Account → Profile, Employees çekmecesi | Hazır, güvenlik onayı var; telefon kuralların üstüne ekleniyor | Kendi thread'inde ("BL-969 önce ve sonra listesi"). Senin canlı onayın. Burada tekrar edilmiyor. |
| 2 | **DB-4**: Schedule yayın kuralları | Schedule → New Schedule menüsü; yayın ve vardiya kaydı | Dalda (`task/ekran-01-db4`), main'e temiz taşınır | ✅ Done · main 7183b306, canlıda (2026-10-09 23:59Z) |
| 3 | Geçmiş önemli gün salt okunur; duyuruda "Couldn't publish" durumu | Important Dates → geçmiş bir tarih; Announcements listesi | Eski dalda (`task/fb-6.7-ui`), elle taşınır | ⏭ Atlandı (Mert 23:57Z) · yama `gecmis-gun-ve-duyuru-durumu.patch` |
| 4 | **BL-435**: Schedule'ın başka ekranlara "yenilen" sinyali yeni yoldan | Görünmez (öteki müdürün açık Schedule'ı) | Dalda, küçük | ✅ Done · main 53499576, CI yeşil |
| 5 | **BL-257**: Requests durum etiketinin renkleri tema renginden | Schedule → Requests listesi, Shift Hub | Dalda, çok küçük | ✅ Done · main 0a26eb30, CI yeşil |
| 6 | Tanıtım sitesi (landing), 4 farklı sürüm | Adresin kökü (bugün doğrudan girişe gider) | Dallarda; fiyatlar uydurma, şirket bilgileri boş | ✅ Done · GitHub'da yedek (`backup/tanitim-sitesi/*`, Mert 2026-10-10 06:42Z); main'e ve canlıya alınmaz |

## Main'e alınmaması gerekenler (sonra sil ya da arşivle konuşacağız)

| Ne | Neden |
|---|---|
| `task/ekran-01-38` (#38, izinli günde alınan vardiya iş günü gibi görünür) | 2026-10-09 kuralına ters (onaylı izinle çakışan vardiya alınamaz) |
| `task/acil-40001` | Main aynı işi daha güvenli yoldan yaptı; getirmek 24 fonksiyonu eski hâline döndürür |
| `keep/fb62-8-save-pattern` | Düzelttiği alan ("Manages without working there") 2026-09-30'da kaldırıldı |
| `no-access-variants` | Seçtiğin "card" hâli main'de; öteki varyantlar bilerek atıldı |
| `task/fb-6.7-ui`'nin kalan parçaları (kapalı günün vardiya listesi, duyuru alt şeridi, C3 balonu) | Sonraki kararlarınla ters ya da main'de başka yoldan var |
| `task/bl-990-w2`, `bl210`, `task/ekran-01-templates`, `backup/ekran-01-40001-*` | Main'de ya da main başka yoldan yaptı |
| `task/bl-987`, `task/otomasyon-4` | Eski yerel koordinatör araçları; Projects'e geçişle eskidi |
| `backup/uncommitted/*` (bilgisayarındaki 14 klasörün yedeği) | Ürün kodu yok: eski ajan notları, satır sonu farkları |
| Tasarım denemeleri (`archive/var-ekran-12`, `ghost-color-mockups`, `schedule-dialog-mockups`, `avail-design`) | Yalnız geliştirici modunda görünen varyantlar; tasarım kaynağı olarak arşivde kalmalı |

## İkinci aşamaya (tasarlanmış ama kodlanmamış)
- Important Dates "History" sekmesi: sunucu tarafı main'de, ekranı yok. Kararına göre çekmece A'nın parçası (KARARLAR "Details · Shifts · History"); çekmece A ile birlikte yapılır. Eski daldaki liste kodu kaynak olarak kullanılır.
- Bulgu (çıkarım, çalıştırılarak doğrulanmadı): bugün yayınlanmış vardiyası olan bir güne "kapalı gün" kaydetmek ekrandan muhtemelen yapılamıyor. Veritabanı vardiyaların gözden geçirilmesini istiyor, ekran bunu sormuyor. Çözümü çekmece A'nın "Shifts" sekmesi.
- `bl217`: bir veritabanı testi hâlâ gerçek demo workspace'i kullanıyor; test yeniden yazılmalı (BL-217 açık).

---

## Madde 2 ayrıntısı: DB-4 (Schedule yayın kuralları)

**Ne:** Schedule'da yayınla ilgili dört sunucu düzeltmesi. Bir tanesi görünür:
1. **"Published by Unknown"** (BL-371): Schedule → sağ üstteki "New Schedule" menüsünü açınca yayındaki programın altında bugün "Published by Unknown • tarih" yazıyor. Yayınlayanın adı veritabanından hiç gelmiyor (`20260929110000_the_publication_names_its_source_draft.sql:36`, ekran `apps/web/src/schedule/lib/draftMenuLabels.ts:24`). Gelirse "Published by Mert Tepebas • tarih" yazar; adı boş olan kişi için "Team member". Görsel: `db4-published-by.png`.
2. **Yayınlanmış vardiya izinle yeniden denetlenir** (BL-174): bugün daha önce yayınlanmış bir vardiya değişince sunucu onaylı izin ve okunamayan saat kontrolünü atlıyor. Yayın önizlemesi "olmaz" diyor ama kayıt geçiyor. Gelirse kayıt da reddedilir.
3. **Geçilemez bulgu yayını durdurur** (BL-510): yayın sırasında "geçilemez" işaretli bir uyarı, tarayıcı "kabul ettim" bilgisi gönderse bile sunucuda yayını durdurur. Bugün sunucu bu bilgiye güveniyor.
4. **Önemli günler okumada kapsamlanır** (BL-701): Schedule'daki önemli günler kişinin ulaşabildiği lokasyonlara göre veritabanında süzülür. Bugün süzme API'de. Ekranda fark yok.

**Kim:** Schedule'ı yayınlayan müdür ve owner. 1. madde herkesin gördüğü menüde.
**Nerede:** Schedule → "New Schedule" menüsü; yayın; vardiya kaydı.
**Ne zaman:** onay verirsen bir sonraki trenle main'e, sonra canlı veritabanına.
**Neden:** "Unknown" yanlış bilgi. İkinci ve üçüncü madde, ekranın "olmaz" dediğini sunucunun da uygulaması (tek yetki merkezi kuralı). Karar defterinde S-117: "DB-4 trenle girer".
**Nasıl:** iki commit bugünkü main'e taşınır. Veritabanı dosyasına (migration) yeni numara verilir; sonradan main'e giren hiçbir değişiklik bu dört fonksiyona dokunmamış, yani eski hâle dönüş yok. Sonra güvenlik incelemesi, bilgisayarındaki Claude'da veritabanı testleri ve tren. Canlı adım "riskli" sınıfta (fonksiyon gövdesi değişiyor): güvenlik onayı ve koordinatörün "gönder"iyle, önce yedek.

**Bilmen gereken:** 2. madde onaylı izni ancak workspace ayarında "approved time off" engelleyici seçiliyse reddeder. Senin 2026-10-09 kuralın (onaylı izin her zaman engeller) sunucunun her yerine BL-995 ile girecek; DB-4 o yönde bir adım ama BL-995'in yerini tutmaz.

---

## Madde 6 ayrıntısı: tanıtım sitesi (landing), 4 sürüm

**Ne:** Newfork'u tanıtan, herkese açık ilk sayfa (giriş yapmamış ziyaretçi). Bugün adresin kökü doğrudan giriş ekranına ya da uygulamaya gider (`apps/web/src/App.tsx`, `*` → `/app`).
**Kim yaptı, ne zaman:** 2026-10-06 akşamı (20:50–22:12 UTC) claude.ai web'den açılmış dört paralel oturum. Hiçbiri için seçim ya da onay kaydı yok. BL-034 "site olacak mı, kapsamı ne" kararı açık (`docs/plan/BACKLOG.md:26`). 18 ekranlık planda (`docs/plan/EKRAN-PLANI.md`) tanıtım sitesi yok.

| Sürüm | Dal | Ne var | Sorun |
|---|---|---|---|
| 1 | `claude/newfork-clean-landing-90slod` | Tek sayfa, hareketli giriş, fiyat "early access'te ücretsiz" | Örnek veride Kadıköy, Beşiktaş, Ayşe (ABD ürünü değil gibi); dal kendi rotasını "onaylanana kadar" geri almış |
| 2 | `claude/newfork-clean-landing-czjfh7` | Uzun tek sayfa, Cookie policy sayfası, iletişim formu; fiyat "lokasyon başına $39, tek lokasyon ücretsiz" | Fiyat uydurma; dalda yanlışlıkla Windows yolu olan bir dosya var |
| 3 | `claude/newfork-clean-landing-vkaq02` | En tam ve en cilalı: hareketli giriş, özellik kutuları, telefon gösterisi, "Newfork'lu/Newfork'suz Salı", fiyat "$32 / $64, 14 gün deneme" | Fiyat uydurma; "What restaurant teams say" bölümünde müşteri yorumu yer tutucu (`[CUSTOMER NAME]`); şirket adı, telefon, satış e-postası köşeli yer tutucu |
| 4 | `claude/newfork-marketing-site-dp9w5k` | Ayrı paket (`apps/marketing`), çok sayfalı site iskeleti | Yarım: sayfalar boş, ana sayfa yalnız bileşen galerisi |

Görseller `landing/` klasöründe: `surumN-<dal>-masa.png` (masaüstü ilk ekran), `-tel.png` (telefon), `-tam.png` (sayfanın tamamı).

**Bilmen gereken:** Stripe canlı hesabı sitede şartlar ve iade politikası ister (KARARLAR "Ödeme (Stripe) MVP'dedir"); yasal sayfalar 17. ekran, Stripe 18. Ürün adı "Newfork" yer tutucu (2026-10-04). Fiyat değişikliği senin kararın (KARARLAR "Stripe hesabı").


## Alınmayacaklar: tek tek kararlar (2026-10-10)
- 1. `task/ekran-01-38` (#38): Mert sonra cevaplayacak.
- 2. `task/acil-40001`: ✅ silindi (Mert 12:07Z); yedeği `refs/nf-backup/task-acil-40001/20261007T2345Z`.
- 3. `keep/fb62-8-save-pattern`: ✅ silindi, yedeksiz (Mert 12:07Z).
- 4. `no-access-variants`: silinecek (Mert 12:00Z); son toplu silmede. Görüntüler `alinmayacaklar/4-*.png`.
- 5. `task/fb-6.7-ui`: Mert 13:11Z "yedeksiz sil". Son silme listesine yazıldı. Kapalı gün penceresini Mert kendi tasarımından (Pt7K2NVLwFx6TPS9ZuXNKX) yapacak.
- 6. Main'de zaten olan 8 dal: bl-990-w2 testi soruldu (13:11Z). Main'de kendi kanıt testi var (e2e/flows/harness-closes-pages.spec.ts); dalda fazladan tek kontrol: hiçbir test dosyası çıplak Playwright'tan almasın. Bugün 29/29 uyuyor. Mert 13:26Z "1": 3. kontrol main'deki dosyaya eklendi (claude/project-thread-jcgonw@ec010b2a, trene hazır); 8 dal son silme listesinde.
- 7. task/bl-987 + task/otomasyon-4: Mert 13:40Z "1 yedeksiz sil". Son silme listesinde.
- 8. backup/uncommitted/* (14 dal): Mert 13:49Z "hepsini yedeksiz sil, ajan notlarını koru". Notlar /mnt/project-files/notes/eski-ajan-notlari/ altında (73 not); değerlileri klasör CLAUDE.md dosyalarına taşınıyor. 14 dal son silme listesinde.
- 6 (ek). İkiz koruma testi Mert'in 2026-10-10 08:10 (California) "1" cevabıyla geri alındı: claude/project-thread-jcgonw@1700a07b, trene hazır. Aynı koruma eslint.config.mjs:39-55'te.
- 9. Tasarım denemeleri (5 dal): Mert'e soruldu. Önerilen: kararı verilmiş 4 dalı sil (ghost-color-mockups, schedule-dialog-mockups, archive/avail-design, task/avail-design), archive/var-ekran-12 SORULAR Soru-20/21 bitene kadar kalsın. Cevap bekleniyor.
