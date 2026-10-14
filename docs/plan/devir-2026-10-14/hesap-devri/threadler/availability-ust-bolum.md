# Devir raporu: Availability üst bölüm / sabit liste başlıkları

Thread: "Availability üst bölüm" (proje sohbetinde Mert'in 2026-10-13 03:00Z mesajı).
Rapor tarihi: 2026-10-14. Durum: **iş bitti, hepsi main'de.**

## Amaç
- Mert'in ilk isteği (2026-10-13): Availability sayfasında (`/app/availability`) en üstten sütun başlıklarına kadar her şey yerinde kalsın; yalnız çalışan listesi aşağı yukarı kaysın. Masaüstü ve telefon.
- Genişletme (karar kartı "Hepsinde sabit"): aynı davranış bütün liste sayfalarında. Bunlar Employees, Employees → Documents, Requests, Announcements, Important Dates, Notifications ve Settings → Documents.
- Ek (Mert "evet tabiki"): telefonda Workspace, Availability, Notifications ve Requests da Employees gibi iki kenara 16 px boşlukla dayansın.

## Bitenler (hepsi main'de; parantezde önce dal sha'sı, sonra main sha'sı)
1. Availability'de üst kısım ve gün başlıkları sabit (937657e4 → main 075e234a).
2. Öteki liste sayfalarında da sabit; kural tek dosyada toplandı (e9b10791 → main 3c05e02f).
3. Telefonda dört sayfanın kenar boşluğu 16 px (9b5f3b6d → main 93569a41).
4. Settings → Documents'ta satırın "⋯" menüsü artık pencereye sabitlenerek açılıyor (5c75deb2 → main 2317a2f1).
   - Hata şuydu: menü kayan çerçevenin içinde kalıyor ve kesiliyordu. Tek satırlı listede yukarı açılan menü sabit araç çubuğunun altına giriyordu ve "Publish" tıklanamıyordu. Trenin e2e testi `e2e/flows/documents.spec.ts:49` bu yüzden düşmüştü.
   - Şimdi menü aşağı açılıyor; aşağıda yer yoksa yukarı açılıyor. Liste kayınca ya da pencere boyu değişince kapanıyor.
   - Tren 2026-10-13'te tam e2e ile yeşil geçti; main o gün 68a6eaef idi.

Sonradan başka bir thread Settings → Jobs, Locations, Shift catalog ve Shift labels'ı da aynı kurala ekledi (Mert, 2026-10-14). Bu thread'in önerdiği ek kapsam böylece kapandı.

## Yarım kalan iş
Yok.

## Mert'ten beklenen
Hiçbir şey. Thread'i resolve etmek güvenli.

## Dal ve push'lanmamış iş
- Dal: `claude/project-thread-yocl2j`, uçta 5c75deb2 var.
  - Dal origin'de; `git cherry -v origin/main` dört commit'in hepsini main'de eşdeğer gösteriyor.
  - Push'lanmamış commit ya da değişiklik yok.
  - Dal silinebilir.
- Bulut kapsayıcısındaki iki geçici worktree yalnız deneme kopyasıydı ve hiç push'lanmadı: `/home/claude/integ` (scratch/frozen-integ) ve `/home/claude/integ2` (scratch/frozen-integ2). Kapsayıcıyla birlikte gider; kaybolan bir iş yok.
- **GÜVENLİ DEĞİL bölümü gerekmiyor:** taşınacak yarım kod yok.

## İlgili dosyalar (repo)
- `apps/web/src/views/list-page-frozen.css`: sabit liste kuralı tek yerde. Yalnız `@media (min-height: 560px)` içinde geçerli; daha kısa pencerede bütün sayfa eskisi gibi kayar.
- `apps/web/src/views/list-page-frozen.test.ts`: kuralın testleri.
- `apps/web/src/views/CatalogPageHeader.tsx`: CSS dosyasını yükler.
- `apps/web/src/views/AnnouncementsPage.tsx`: Active ve Past tabloları tek kayan alanda tutan `list-frozen-body`.
- `apps/web/src/settings/CatalogRowMenu.tsx` ve `apps/web/src/settings/CatalogRowMenu.test.tsx`: pencereye sabitlenen satır menüsü.
- `apps/web/src/styles.css` (≤720 px kuralı) ve `apps/web/src/shell/phone-page-gutter.test.ts`: telefonda 16 px kenar boşluğu.
- `apps/web/src/communications/notification-shift-details.css`: Notifications'ı 12 px'e daraltan eski kural silindi.
- `docs/plan/KARARLAR.md`: "Liste sayfalarında üst kısım sabit" kaydı.

## Proje dosyaları ve sayfalar
- Test sayfası (bu hesapta): https://claude.ai/artifact/2TT6LzGoz92k86YKHfjWvA, sürüm 5. Dokuz ekran var: Workspace, Availability, Employees, Employees → Documents, Requests, Announcements, Important Dates, Notifications ve Settings → Documents.
  - Yeni hesap bu bağlantıyı göremez.
  - Kaynağı kaydedildi: `/mnt/project-files/pages/sabit-listeler/`. Giriş sayfası `index.html`, `app.html` ve ekran dosyaları orada. Gerekirse yeni hesap oradan yeniden yayınlar.
  - Sayfa 2026-10-13 dalından kuruldu, bugünkü main'den eski. Asıl güncel harita PAGES'tir.

## Yeni hesaba taşınacak bulgular
1. **KARARLAR'da eskimiş bir cümle var.** "Liste sayfalarında üst kısım sabit" kaydında hâlâ "Settings → Documents'ta son iki satırın "⋯" menüsü yukarı açılır." yazıyor.
   - Bu davranış 2317a2f1 ile değişti: menü aşağı açılır, aşağıda yer yoksa yukarı açılır.
   - Kayıtları yazan thread bu cümleyi düzeltmeli. Bu, eskimiş bilgi düzeltmesi; kural değişikliği değil.
2. **Kayan çerçeve içindeki her açılır menü kesilir.** Satır menüleri `CatalogRowMenu` ile pencereye sabitlenerek açılmalı. Yeni bir liste sayfasına `position: absolute` açılır menü eklemek aynı e2e hatasını geri getirir.
3. **Kural yükleme sırası.** Sayfaların kendi CSS'i daha sonra yüklendiği için kural `.list-page` sınıfını üç kez tekrarlıyor. Yeni bir liste sayfası kurala girecekse adı `list-page-frozen.css`'teki listeye eklenir ve testine yazılır.
4. **Kayan çerçeveye `position: relative` gerekiyor.** Yoksa içindeki `.sr-only` etiketleri sayfayı uzatıyor; Announcements'ta bu yaşandı.
5. **Bulutta e2e koşmuyor** (veritabanı yok). Bu işte en yakın kontrol PAGES düzeneğinde Playwright ile tıklamaydı: `/mnt/project-files/PAGES/_kaynak` kopyalanır, `build-pages.mjs` ile kurulur ve her menü açılıp düğmeleri gerçekten tıklanabilir mi diye denenir.

## Brief taslağı
Gerekmiyor; açık iş yok. Yalnız 1. bulgu için kayıt thread'ine tek satır yeter:
"KARARLAR 'Liste sayfalarında üst kısım sabit' kaydındaki 'son iki satırın menüsü yukarı açılır' cümlesini 'satırın ⋯ menüsü pencereye sabitlenir; aşağı açılır, yer yoksa yukarı' diye düzelt (2317a2f1)."
