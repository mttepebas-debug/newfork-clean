# Devir raporu · Vardiya kartı

Yazan: "Vardiya kartı" thread'inin Claude'u, 2026-10-14 ~16:50 UTC (09:50 AM Kaliforniya).
Thread: https://claude.ai (Project → thread "Vardiya kartı"), kök mesaj `cmsg_013zBzr8GJv9vVEM4zDoaKrVYDCaHRPBwN4oG2GS9gzxhB`.

## 1. Amaç
Schedule ızgarasındaki vardiya kartının görünümü ve davranışı. Mert "Vardiya kartı, hayalet vardiya ve sürükleme" diye başlattı (2026-10-12). Kapsamda şunlar var:
- kart işaretleri (LIVE, NEW, müsait değil "!", not ataşı, x2, kaydediliyor);
- tek satır yazı;
- sütun genişliğinin kendiliğinden ayarlanması;
- hayalet kart;
- sürükle-bırak;
- kapalı gün.

## 2. Bitenler (hepsi main'de)
Bugün (2026-10-14) Mert'in "Kodla" (09:38 UTC) dediği "Yeni" kart görünümü:
- **Yeni kart görünümü** (main `80c772bf`, cherry-pick `b31d99ba`):
  - düzenlerken yayındaki vardiyada LIVE görünür; yeni ve düzenlenmiş vardiyada NEW;
  - silinecek kartta işaret yok;
  - yayındaki vardiyanın "!"i kişinin adının yanına taşınır;
  - kaydederken çizgi yerine dönen simge;
  - ortalı tek satır yazı, uzun ad "…" ile biter;
  - x2 sol üstte;
  - sütun genişliği dört kademede kendiliğinden ayarlanır (side / tight / compact / clip);
  - kapalı gün izinli gün gibi görünür, üzerine gelince "Closed" yazar;
  - "Can't place a shift here" kalktı;
  - hayalet iğnesi 17 px;
  - işaretler ilk satırla aynı hizada.
- **Tek lokasyonlu sığdırılmış hafta düzeltmesi** (main `80c772bf`, cherry-pick `21f00a5d`): hafta, kademesinin seçildiği genişlikleri kullanır.
- **"Changed after publishing" korunuyor** (main `80c772bf`, cherry-pick `5d633c3b` + `82bba4ae`): "!" ada taşınınca ad penceresi o günün altında bu notu yazar (K18, M11). e2e testi de buna göre düzeltildi.
- **NEW saate binmiyor** (main `9b871a97`, cherry-pick `6d7654a5`): yayındaki karta not yazıp kaydedince NEW kendi satırını açıyor, satır büyüyor.
- Daha önce (2026-10-12/13) main'e girenler: sürükleme, filtre, Esc, silinen vardiya, hayalet I, kart kalkışı, izinli gün kenarı, x2, iğne. Dalın geçmişinde görünür; hepsi trenle indi.

## 3. Yarım kalan iş
Kod tarafında yarım iş yok.

Yalnız **turuncu nokta** bekliyor. Mert'in "5 · Nokta" seçimine göre "!" yerine 8 px turuncu nokta gelecek. Bu değişiklik:
- dalda kendi commit'i olarak hazır: `70f3004a`;
- nf-guvenlik ONAY'ı aldı;
- bugünkü veriyle tarayıcıda denendi: basma, klavye ve odak çalışıyor. Kontrast beyazda ~4:1, kartta 3,4–3,7:1.

Trene verilmedi, çünkü koordinatör Mert'e sordu.
- Sonraki adım: Mert "şimdi" derse yalnız `70f3004a` cherry-pick listesiyle trene gider. "Availability ile" derse o işle birlikte gider.
- `70f3004a` güncel main'e (`9b871a97`) çakışmasız uygulanmalı. Dal ile main arasındaki tek fark bu commit (4 dosya: `shiftCardRoom.ts`, `shiftCardRoom.test.ts`, `styles.css`, `ScheduleStickyLayoutStyles.test.ts`).

## 4. Mert'ten beklenen
- **Turuncu nokta yayına çıksın mı?** Thread'deki son mesajda soruldu.
  - Şimdi (Önerilen): bugünkü veriyle çalışıyor.
  - Availability ile birlikte.

## 5. Dal ve push durumu
- Dal: `claude/project-thread-nezlm0`. Son push: `6d7654a5`; yerel ile origin aynı.
- Commit'lenmemiş ya da push'lanmamış iş: **yok**. Çalışma ağacı temiz.
- Dal, main `80c772bf`'i birleştirmiş (`e891d608`). Main'den farkı yalnız tutulan nokta.
- **Dikkat:** dal doğrudan trene verilmez, yoksa nokta da gider. Her zaman cherry-pick listesiyle.

## 6. GÜVENLİ DEĞİL
Yok. Her şey push'lanmış ve inceleme onaylı. Nokta commit'i bilerek tutuluyor; bu bir güvenlik sorunu değil, Mert'in kararını bekliyor.

## 7. İlgili dosyalar
- İşaret taslakları (40 + 6 ataş) ve Mert'in seçimleri: `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/` (`README.md`, `index.html`, `kaynak/`, `yayin/`).
- Kodlanmış hâlin görüntüleri: `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/kodlandi/`. Görüntüler: 1440 ve 1920 okuma ve düzenleme, kapalı gün, kaydediliyor, nokta.
- Kart kataloğu (canlı ızgara + 21 kart hâli): `/mnt/project-files/pages/schedule-kart-katalogu/` (`README.md`, `index.html`, `app.html`, `source/`, `ekran/`).
- NEW hatasının kanıtı (Üst çubuk thread'i): `/mnt/project-files/notes/ust-cubuk/new-isareti-saate-degiyor.png`.
- Bu devir için kopyalananlar: `/mnt/project-files/devir/threadler/vardiya-karti-kaynak/`
  - `rk-harness/`: bulut kopyasındaki tarayıcı test sayfası (`apps/web/.temp/rk/`, gitignore'da, repoda yok). Derleme çıktısı `dist/` hariç.
  - `olcum-betikleri/`: Playwright ölçüm betikleri. Örnek: `mk-noteflow.mjs`, NEW ile yazı çakışmasını tarar.
  - `ekran/`: NEW düzeltmesinden sonraki görüntüler (1100–2200 px).
  - `hafiza-vardiya-karti-kodlama.md`: bu thread'in hafıza notu.

## 8. Artifact'lar (bu hesapta; yeni hesap göremez)
- Kart işaret taslakları: https://claude.ai/artifact/7xJNYsZbknmsvGPk5jdd7p. Kaynak: `/mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/yayin/index.html`. Betik ayrı gidiyor: `yayin/split-app.mjs`.
- Schedule kart kataloğu: https://claude.ai/artifact/S9fM4Yfc7SLhro3frLo9gL. Kaynak: `/mnt/project-files/pages/schedule-kart-katalogu/index.html` + `app.html`.
- PAGES 3.0 Schedule sayfası bu thread'in değil, Üst çubuk thread'inin.
- Yeni hesapta gerekirse bu kaynaklardan yeniden yayınlanır. Bu thread yeni Artifact yayınlamadı.

## 9. Yeni hesaba taşınacak bulgular ve kurallar
- **Tren yalnız cherry-pick listesiyle.** Dalın geçmişinde tutulan commit (nokta) var.
- **"!"in yeri:** düzenlerken yayındaki vardiyanın "!"i kartta değil adın yanında (Mert, 2026-10-12). Ad penceresi "Changed after publishing"i o günün altında yazar (K18, M11; KARARLAR'a koordinatör yazdı, main `80c772bf`).
- **e2e tuzağı:** `tests.availability` (`supabase/test-support/builder.sql:407`) kişinin bütün haftasını yazar. Yeni bir çağrı, önceki günün işaretini siler.
- **ResizeObserver** varsayılan olarak içerik kutusunu izler; yalnız padding'i büyüyen öğe yeniden ölçüm tetiklemez. NEW'in kendi satırı padding ile açıldığı için satır ölçümü `{ box: "border-box" }` izler (`useScheduleBadgeMeasurements.tsx`).
- **Bir işaret yer değiştirince** eski penceresinin bütün satırlarına bakılır: yeni yeri aynısını söylüyor mu?
- **Bekleyen backlog adayı (düşük):** iki koşul birlikte olursa ad "!"i görünmez ve "Changed after publishing" yalnız ekran okuyucuda kalır. Koşullar:
  - aynı hücrede biri yeni ve çakışan, öbürü yayındaki ve işareti yayından sonra değişmiş iki vardiya var;
  - o gün kişinin haftadaki tek müsait olmadığı gün.

  Koordinatöre bildirildi.
- **Test sayfası** (`rk-harness`): `apps/web/.temp/rk/` altına kopyalanıp `RK_REAL=1 RK_MARKS=1 ATLAS_SHA=<sha> npx vite build --config .temp/rk/vite.config.ts`, sonra `node .temp/rk/inline-app.mjs .temp/rk/dist` ile derlenir. `dist/` klasörü 5706 portunda sunulur. Düzenleme modunda Pazartesi'de hazır bir düzenlenmiş, bir silinmiş ve bir yeni kart gelir (`mock/schedule-service.ts` `withDemoEdits`).
- **Kart ölçüleri** `apps/web/src/schedule/lib/shiftCardRoom.ts` `SHIFT_CARD_MARK` içinde. Tarayıcıda ölçüldü; değişirse orası da güncellenir.

## 10. Yeni hesapta bu işi sürdürecek thread için brief taslağı
```
İŞ: EKRAN-01 (Vardiya kartı) — turuncu noktayı (5 · Nokta) Mert onaylarsa yayına al.
Bitti ölçütü: Mert'in cevabı alındı; "şimdi" ise 70f3004a güncel main'e cherry-pick, nf-guvenlik ONAY, tren yeşil; "Availability ile" ise o işin cherry-pick listesine eklendi.
Dokun: claude/project-thread-nezlm0 dalı (ya da güncel main'den yeni dal, 70f3004a cherry-pick) · Dokunma: main'e doğrudan push, auth ekranları.
Sınıf: normal (yalnız CSS + bir sabit + testleri).
İlgili kararlar: Mert 2026-10-13 3:41 PM Kaliforniya "ünlem için 5, live için 1, new için 7"; K18, M11.
Okunacak: /mnt/project-files/devir/threadler/vardiya-karti.md, /mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/README.md.
Not: dalı doğrudan trene verme; yalnız cherry-pick listesi.
```
