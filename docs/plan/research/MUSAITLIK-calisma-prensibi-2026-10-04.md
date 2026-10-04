# Müsaitlik çalışma prensibi — kilitlendi (Mert, 2026-10-04)

Kaynak: koordinatör `local_10a5177a…`'ın penceresi, 2026-10-04 ~10:00–11:00Z. Mert kendi modelini yazdı, koordinatör bugünkü prensiple karşılaştırdı, iki çoktan seçmeli tur yapıldı, son onay "Doğru, kilitle ve tasarımı başlat (Önerilen)". KARARLAR'a taşınacak (kayıt oturumu). Ölçüm: üç okuma ajanı, main `475c63ca`.

| # | Kural | Not |
|---|---|---|
| M1 | Haftalık tek tablo; tarih / hafta seçici yok; işaret, çalışan değiştirene kadar her hafta o gün ve saatte "unavailable" | BL-536 (haftaya özel müsaitlik) kapanır, Mert reddetti |
| M2 | Onboarding adımı, My availability ve Employees çekmecesi → Availability aynı kayıt | Bugünkü gibi |
| M3 | Shift type modunda bir günün bütün tipleri işaretlenince "All day" kendiliğinden açılır | Mert'in ek mesajı |
| M4 | Mod değişince haftalar vardiya tiplerinin default in/out saatleriyle çevrilir; çevirinin testi ve sağlaması yapılır; bütün çalışanlara "Check your availability" bildirimi | Bugün yalnız haftası çevrilene gidiyor; çeviri gece yarısı sonrası ve tipler arası boşlukta kayıplı |
| M5 | Keep/cancel penceresi her yerden kalkar (mod değişikliği + çalışanın kendi kaydı); bekleyen istek açık kalır, çalışan isterse Shift Hub'dan geri çeker | Ters çevrildi: FB-6.4 S2 (2026-10-03) ve bugünkü kayıt penceresi |
| M6 | Unavailable kişi, lokasyon + iş uyuyor ve onaylı izni yoksa cover / pickup listesinde çıkar; kabulde çalışana "unavailable görünüyorsun, emin misin?" sorulur; yöneticinin onay ekranında "unavailable ama kendi rızasıyla istedi" yazar; yönetici onaylar ya da reddeder | ILKELER P24 ile uyumlu |
| M7 | Unavailable işareti vardiyayı open'a düşürmez, kişiyi yayınlanmış vardiyasından muaf tutmaz | Bugünkü gibi |
| M8 | **AYNI GÜN DEĞİŞTİ (~13:45Z, Mert: "availibility hiçbir zaman hard block olmasın. settingsten kaldıralım. her zaman için warn olsun. hiç bir zaman da conflict oluşturmasın"):** ayar yok, Hard block yok; her yazmada Warn kutusu, müsaitlik asla conflict üretmez. Güncel hâli KARARLAR'da. — Eski metin: Conflict handling'de müsaitlik satırı: Warn (varsayılan) / Hard block. Warn: her yazmada mevcut "Scheduling rule" kutusu (Cancel / Place shift). Hard block: o hücreye yönetici ve otomatik doldurma yazamaz; takasta çalışanın rızası geçerli | Kısmen ters çevrildi: 2026-09-26 "tercih, engel değil, ayarı yok" |
| M9 | Preflight müsaitlik bölümü: unavailable olup vardiya yazılmış herkes son gözden geçirme için listelenir; onay istenmez | Ters çevrildi: bugünkü zorunlu onay kutusu |
| M10 | Schedule düzenleme modunda aç/kapa anahtarı yalnız turuncu taramayı gizler (onaylı izin kırmızısı kalır); Warn kutusu ve preflight sürer | Anahtar kişiye özel ve hatırlanır (koordinatör kararı) |
| M11 | Yayından sonra işaretlenen müsaitlik kartta C3 tasarımıyla "Changed after publishing"; taslakta ya da yayından önce girildiyse yazmaz; unpublish → republish yazıyı değiştirmez; ölçü vardiyanın ilk yayını; yalnız müsaitlik sayılır, onaylı izin sayılmaz | "İlk yayın" koordinatör kararı; bugünkü kod izni de sayıyor (hata) |
| M12 | Yönetici notu yalnız hatırlatma: Warn / Block / otomatik doldurma / preflight'a girmez, Takvim'de sürekli görünmez; notun gün + saatine çakışan vardiya yazılırken küçük onay kutusu notu gösterir ve onay ister (ayardan bağımsız, asla engel değil) | Ters çevrildi: 2026-10-01 "not metni Schedule balonunda görünür" |
| M13 | Müsaitliği yalnız employee rolü girer | Bugünkü gibi |

## Mevcut, karara bağlanmış tasarımlar (yeniden yapılmaz)
- Hücre görünümü: turuncu t0 + 1px çerçeve, onaylı izin kırmızı (KARARLAR 2026-10-01, G14); prototip https://claude.ai/artifact/YVEK49zkyYR1wJiSTU5EMa.
- "!" balonu ve "Changed after publishing": C3 üçüncü tur A "Tinted header" (2026-10-03), https://claude.ai/artifact/MMWTxhyiy7tTmJ5oUhgHGB.
- Warn / Hard block kutusu: mevcut `ScheduleConflictSheet` ("Scheduling rule", Cancel / Place shift; block'ta kırmızı ton).
- Conflict handling satırı: C2-A açılır liste kalıbı.

## Tasarlanacaklar (Artifact, Mert seçer)
1. Schedule müsaitlik aç/kapa anahtarı.
2. Yönetici notu onay kutusu.
3. Preflight müsaitlik bölümü (onaysız liste).
4. Çalışanın kabul ekranı "emin misin?" — 5 varyant.
5. Yöneticinin onay ekranı "kendi rızasıyla" — 5 varyant.

## Sonra
Tasarım seçiminden sonra tek uygulama işi "AVAIL-002 müsaitlik kapanışı" (R3: ayar + takas + yetki). İçine: M3–M12, iki yazma yolunun yetki çekirdeğine taşınması (CLAUDE.md §9), kaydedilmemiş değişikliğin sorulmadan kaybolması, `#availability` bağlantısı, geçmiş kaydındaki yanlış aktör.
