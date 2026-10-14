# Devir: "Schedule: izinli kişiye başka lokasyonda Add shift" thread'i

Thread: https://claude.ai/code/project/chan_013zBzr8GJv9vVEM4zDoaKrV?thread=cmsg_013zBzr8GJv9vVEM4zDoaKrVJwkXvpk98NaLi5sbbTVruR
Rapor tarihi: 14 Ekim 2026, California saatiyle sabah 9:45 civarı.
Dal: `claude/time-off-mark-all-locations-cg3rn2` @ `3a6e6038` (GitHub'da; yalnız belge).

## Amaç
1. **Hata düzeltmesi (bitti).** Schedule'da (Management → Schedule, taslak düzenlerken) tam gün izinli bir kişinin izni, ekranda yalnız atandığı lokasyonda işaretleniyordu. Bu yüzden atanmadığı lokasyonun bölümünde o güne "Add shift" düğmesi çıkıyordu. Sunucu o vardiyayı zaten reddediyordu; sorun yalnız ekrandaydı.
2. **Tasarım (yarım).** Mert'in 11 Ekim isteği: kişinin atanmadığı lokasyondaki hücreler düzenleme modunda kapalı görünsün ve Add shift penceresi açılmasın. Hücre boş renginde kalsın ama hafif içe çökük ve soluk olsun; üzerine gelince kırmızı ve hareketli "+ Add shift" yansın. Bunun için 4 varyantlı (A, B, C, D) bir sayfa hazırlandı. Sonra istek ghost kartların görünümüne genişledi (D).

## Bitenler
- Kişinin izin işareti, kendi projeksiyonu olmayan her ızgara lokasyonuna yayılıyor (`spreadTimeOff`, `apps/web/src/schedule/hooks/useCellState.ts`). Main'de: `9e8d4a23` (düzeltme) ve `a8b55626` (gizli müsaitlik testi). Tren 14 Ekim'de geçti. Dal üzerindeki eski sha'lar `7b318d1c` ve `641f2117`, rebase sonrası main'deki aynı içerik.
- Testler: `ScheduleGrid.test.tsx` (atanmadığı lokasyonda tam gün izinde Add shift yok), `useCellState.test.ts` (aynı saat dilimi yayılır, farklı saat dilimi yayılmaz, "unavailable" işareti yayılmaz, hideAvailability açıkken izin yine yayılır). nf-guvenlik ONAY @641f2117.
- Bilinen sınır BACKLOG'a girdi: **BL-1022**, farklı saat dilimindeki lokasyona izin işareti yayılmıyor (web'de saat dilimi motoru gerekiyor).
- Varyant prototipi repoya kaydedildi: `docs/plan/devir-2026-10-14/atanmamis-lokasyon-prototip/` (README, patch, sayfa kabuğu). Commit `3a6e6038`, nf-guvenlik ONAY @3a6e6038.

## Yarım kalan iş
- **Kapalı hücre tasarımı:** Mert varyant seçmedi. Thread A'yı önerdi. Mert'in son yönlendirmeleri:
  - kırmızı yasak imleci olmasın (yapıldı);
  - ghost kart asıl vardiyanın renginde olsun ama soluk, cansız, içe çökük ve geri planda dursun; asıl kart canlı kalsın; ghost'taki yazılar asıl karttakiyle aynı renk ve okunaklılıkta olsun (D'ye uygulandı, 11 Ekim, California saatiyle sabah 4:15 civarı).
  - Son D hâli için Mert'in onayı gelmedi.
- **Kodlama işi açılmadı:** henüz uygulama kodunda değişiklik yok.
- **PAGES 3.0 Schedule:** düzeltme main'e girdikten sonra güncellenmesi gerekiyordu; koordinatöre bildirildi. Yapılıp yapılmadığını PAGES thread'inin devir raporundan kontrol et.

## Mert'ten beklenen
1. Varyant seçimi: A, B, C ya da D (yeniden kurulan sayfada bakarak).
2. D seçilirse: renkli ve soluk ghost bütün ghost kartlara mı uygulansın, yoksa yalnız atanmadığı lokasyon hücrelerine mi? Kişi iki lokasyona atanmışsa ghost kart kendi lokasyonunda gerçek karta çok benzeyebilir.
3. Bu hücrelerde sağ tık menüsü ve sürükle-bırak da kapansın mı? Prototipte açık.
4. Böyle bir hücrede izin günü varsa kırmızı "Time off" görünmeye devam etsin mi? Prototipte görünüyor.

## Dal ve push'lanmamış iş
- `claude/time-off-mark-all-locations-cg3rn2` @ `3a6e6038`: güncel main'in (`9b871a97`) üstünde tek belge commit'i, GitHub'da. Main'e girmesi şart değil. Prototip kaybolmasın diye var. İstenirse trenle main'e alınabilir; yalnız `docs/` değişiyor, CI bu dosyaları atlıyor.
- Push'lanmamış iş yok. Bulut thread'inin geçici klasöründeki derleme (`app-schedule.html`, ekran görüntüleri) kopya; hesap kapanınca kaybolur, kaynak repoda.
- **GÜVENLİ DEĞİL bölümü:** gerek yok. Taşınan her şey belge; canlı veritabanı, gizli bilgi ya da kod yok.

## İlgili dosyalar
- Kod (main'de): `apps/web/src/schedule/hooks/useCellState.ts` (`spreadTimeOff`), `apps/web/src/schedule/components/ScheduleRow.tsx` (`canAddShift`, çift tıklama), `apps/web/src/schedule/lib/scheduleAvailabilityMark.ts` (`mergeAvailabilityMarks`, `isFullDayTimeOff`).
- Testler: `apps/web/src/schedule/components/ScheduleGrid.test.tsx`, `apps/web/src/schedule/hooks/useCellState.test.ts`.
- Prototip (repo): `docs/plan/devir-2026-10-14/atanmamis-lokasyon-prototip/README.md` (yeniden kurma adımları dahil), `varyant-prototip.patch`, `sayfa-kabugu.html`.
- Proje dosyalarındaki kopyalar (yeni hesapta olmayacak): `/mnt/project-files/notes/atanmamis-lokasyon/varyant-prototip.patch`, `/mnt/project-files/pages/atanmamis-lokasyon-varyant/atanmamis-lokasyon-varyant.html`.
- Eski hesabın Artifact'ı (yeni hesaptan açılmaz): https://claude.ai/artifact/PeCwcUC922XVirLhgBYfBr. Artifact dizininde "Schedule" klasörüne kayıtlı.

## Yeni hesaba taşınacak bulgular
- Sunucu, kişinin atanmadığı lokasyona vardiyayı zaten reddediyor (`assess_weekly_shift_availability` içinde `location_assignment` engeli: "Not assigned to this location"). Kapalı hücre tasarımı bu yüzden yalnız ekranı sunucuyla aynı hizaya getirir; ürün kuralı değişmez.
- API, kişinin müsaitlik ve izin projeksiyonunu (`weekly_availability`) yalnız atandığı lokasyonlar için döndürüyor. Web bu yüzden izni öteki lokasyonlara kendisi yayıyor; yalnız aynı saat diliminde (BL-1022).
- Patch güncel main'e `git apply --3way` ile temiz uygulanıyor. Ama EKRAN-01'in yeni kart görünümü (`9b43375d`) sonrası ghost ve kart CSS'i yeniden gözle kontrol edilmeli.
- Patch'teki `GhostShiftCard` `--shift-color` satırı varyanttan bağımsız. Uygulayan, varyant yokken ghost kartın değişmediğini kontrol etsin; bugünkü ghost CSS'i bu değişkeni kullanmıyor.
- PAGES derlemesi bulutta mümkün: `PAGES/_kaynak` → `apps/web/.temp/pages`, `pnpm --filter @newfork/ui build`, sonra `PAGES_OUT=… node .temp/pages/tools/build-pages.mjs 3.0`. Düzenleme modu için senaryo adımları: "Draft selector: New Schedule" → "Edit live schedule".
- Playwright bulutta `executablePath: "/opt/pw-browsers/chromium"` ile çalışıyor.

## Yeni thread için brief taslağı
```
İŞ: Schedule'da kişinin atanmadığı lokasyon hücresi kapalı (tasarım → kod)
Önce: docs/plan/devir-2026-10-14/atanmamis-lokasyon-prototip/README.md'yi oku.
Varyant sayfasını yeni hesapta yeniden kur (README "Sayfayı yeniden kurmak").
Mert'e bugünkü hâl + A/B/C/D'yi göster; "hangisi" kartı yok, Mert yazınca devam.
Açık sorular (README sonunda) Mert'e.
Seçimden sonra kod: önce KARARLAR'a kural (§3.A.7), sonra TDD
(ScheduleGrid.test.tsx: atanmadığı lokasyon hücresinde Add shift kontrolü yok,
çift tıklama onCreate çağırmaz). Varyant bayrağı ve seçilmeyen varyantlar
gerçek koda girmez. Sınıf: normal; ghost görünümü değişirse bütün Schedule
ekranları etkilenir, 1440 ve 390 görüntüsü al.
Bitti ölçütü: web vitest, lint, typecheck yeşil; dal push; PAGES 3.0 güncel.
İlgili: BL-995, BL-1022, KARARLAR §1.1.
```
