# Schedule kartı: yayın işaretleri ve kart düzeni (Mert seçti, 2026-10-12)

- İlk istek: Mert, 2026-10-12 04:45 (Kaliforniya), thread "Vardiya kartı, hayalet vardiya ve sürükleme": düzenlenen kartta "Edited", yayındakinde "Live" işareti.
- Karar: Mert, 2026-10-12 07:03–07:13 (Kaliforniya), https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL sayfasına bıraktığı 9 yorumla. İlk turdaki Live 1–3 ve Edited 1–3 varyantlarının yerine geçti (görüntüleri `ekran/eski-varyantlar/`).
- Sayfa: `index.html` (kabuk) + `app.html` (gerçek Schedule kodu, main `e0763dd5`, örnek veri); ikisi aynı klasörde. Sağ alttaki "Test page" → "Shift card look": Original (bugünkü main) ve Yeni (yorumlardan sonra). "All shift cards" sekmesinde her kart Original ve Yeni yan yana.
- Görüntüler: `ekran/original.png` (bugünkü, düzenleme modu), `ekran/yeni-izgara.png` (Yeni, düzenleme modu), `ekran/yeni-ornekler.png` (katalogda değişen kartlar, Original | Yeni).

## Mert'in yorumları ve Yeni hâlde ne oldu
1. "Live sağ üste taşınsın" → düzenlemede yayındaki kartın sağ üstünde yeşil LIVE (NEW'in biçiminde).
2. "Edited yerine New yazılsın" → yayında olup düzenlenen kart yeni kart gibi: sağ altta NEW; soldaki şerit ve kalem yok.
3. "Sağ en üstteki icon silinsin" → kaldırılacak (silinmiş) kartın sağ üstündeki bulut simgesi yok; kart soluk gri ve üstü çizili kalır. (Yorum sayfadaki sıraya göre bu karta okundu.)
4. "Live işareti varken turuncu ünlem rowun başındaki employee isim cellinde belirsin" → yayındaki (LIVE) kartta "!" kartta değil, satırın başında çalışanın adının yanında. Yayında olmayan kartta "!" yerinde kalır.
5. "Stack olan shiftlerde text center olmuyor … ikonlar asla texte değmesin, ona göre badge genişlesin; new, live, ünlem vs için geçerli" → her kartta yazı kartın iki kenarına göre ortalı; iki yanda köşedeki en geniş işaret kadar ve 4 px boşluk; sütun genişliği bunu hesaba katıyor. Tarayıcıda ölçüldü: 154 kartın hiçbirinde işaret yazıya değmiyor, hepsi 2 px içinde ortalı.
6. Ghost: "location iconu çok küçük … icon asla texte değmesin" → iğne 12 px'ten 15 px'e; yazı ortalı ve iğneyle arada boşluk.
7. "Saving şeritleri yerine sağ en üstte badge'in içine dönen bir loading" → altta "Saving" şeridi yok; sağ üstte dönen yükleniyor işareti, uzarsa sarı.
8. "Kapalı günde Time off'un designının aynısı, sadece üzerine gelince Closed yazısı" → kapalı gün hücresi izinli hücreyle aynı düz kırmızımsı; CLOSED yalnız üzerine gelince.
9. "Can't place a shift here yazısını kaldır" → izinli hücreye vardiya sürüklenince yazı çıkmıyor; kırmızı çerçeve kalıyor.

## Mert'in 2026-10-12 10:04 (Kaliforniya) mesajı ve Yeni hâlde ne oldu (sürüm 4)
10. "Unassigned shift row'daki stack xN shift badge'in soluna taşınsın" → "x2" kartın sol üstünde; yazı yine iki kenara göre ortalı, "x2" yazıya değmiyor.
11. "Shift badge içerisindeki meta data asla 2. satır kullanmasın, her bilgi kendi satırında" → ad, etiket ve saat her biri tek satır; sütun en uzun satır kadar genişliyor.
12. (09:56 Kaliforniya mesajı) "Sol menü açıkken tek bir lokasyonun 7 günü sığsın, kolonların genişliği otomatik ayarlansın" → sütunlar ekrana göre kendiliğinden ayarlanıyor; sığmadığı yerde sırayla: işaretler yazının üstüne ve altına iner → ad 1 piksel küçülür → en son uzun ad "…" ile biter (saat hiç kesilmez). 1440'ta menü açıkken hiçbir yazı kesilmeden sığıyor. Görüntüler: `ekran/yeni-menu-acik-okuma.png`, `ekran/yeni-menu-acik-duzenleme.png`.
13. Filtreler (gerçek kodda, sayfada da çalışıyor): alttaki kaydırma çubuğu filtreleri bozmaz; Esc ve boş yere tıklama filtreleri tek tek, en son ekleneni önce kaldırır.

14. (10:58 Kaliforniya mesajı, gerçek kodda) Canlı düzenlemede silinen vardiya çakışma yaratmaz; aynı hücreye saatleri çakışan ya da aynı türden vardiya yazılınca silinen kart onun arkasında kalır. Görüntüler: `ekran/silinen-once.png`, `ekran/silinen-sonra.png`.

## Bilinmesi gereken
- Değişen kararlar: KARARLAR satır 502 ("Schedule rozetinde yayın işareti: varyant 6, yayınlanmışta işaret yok, yayınlanmamışta NEW", Mert 2026-10-09). Satır ~446 ghost kararı bu işte değişmiyor (ghost rengi ayrı madde: `gelen/ghost-kendi-rengi/`).
- Kart düzenlemede biraz genişler (iki yana boşluk), bu yüzden düzenleme modunda sütunlar okuma modundan biraz geniş.
- 10–12. maddeler ve 1–9. maddeler gerçek uygulamaya geçmedi; yalnız bu sayfada (13. madde gerçek kodda). Kodlanınca ızgara kabuğu da değişir: `apps/web/src/schedule/components/ScheduleGridShell.tsx` (sayfada `source/overrides/ScheduleGridShell.tsx`).
- Gerçek uygulamaya geçmedi; yalnız bu sayfada. Kodlanınca değişecek yerler: `apps/web/src/schedule/components/ShiftCard.tsx`, `ScheduleRow.tsx` (adın yanındaki "!"), `hooks/useScheduleBadgeMeasurements.tsx` (sütun genişliği), `styles.css` (kapalı gün, sürükleme yazısı, kaydetme), `schedule-shift-save.css`. Sayfadaki karşılıkları `/mnt/project-files/pages/schedule-kart-katalogu/source/overrides/` ve `vk/`.
