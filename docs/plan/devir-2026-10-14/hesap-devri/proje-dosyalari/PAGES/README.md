# PAGES: uygulamanın güncel ekranları

Her ekran (uygulamadaki her adres) ayrı bir Artifact sayfasıdır, numaralıdır: 1 Auth, 2 Workspace, 3 Schedule, … 12 Account. Her sayfa main'deki gerçek uygulama kodunu örnek veriyle (Harbor & Vine) çalıştırır: masaüstü (1440) ve telefon (390) yan yana, aynı veriyle eşli. Üstte "Kim açıyor" (rol) ve "Örnek senaryo" düğmeleri var.

- Dizin: https://claude.ai/artifact/YSQYTSXbT8CdQLGR6ozWcy (bütün ekranlar, linkleriyle)
- Liste: `MAP.txt` (numara, ad, adres, link)
- Kaynak: `_kaynak/` (atlas motorunun kopyası + PAGES ekleri). Çalışan kopya bulut thread'inde `apps/web/.temp/pages` altına konur.
- Plan ve envanter: `/mnt/project-files/notes/pages-belgeleri/PLAN.md`

## Kural (proje talimatı #11; Mert, 2026-10-10 ve 2026-10-12)
Harita, uygulamada kodu olan her sayfayı, o sayfadaki her parçayı ve her senaryoyu eksiksiz gösterir; bugünkü ya da planlanmış görüntüyü değil, kodda var olan her şeyi. Mert her sayfanın testini ve arayüz geliştirmesini bu haritayla yapar. Gruplama: sayfa → parça → senaryo. Tam liste ve boşluklar: `ENVANTER.md`.

1. **Kodun dokunduğu her şey haritaya girer.** Bir iş bir sayfayı, bir parçayı (bölge, sekme, çekmece, pencere, menü, form, liste, kart, rozet, ortak bileşen) ya da bir durumu (dolu, boş, hata, yükleniyor, yetkisiz, rol farkı, onay adımı, sonuç) değiştirir ya da eklerse, aynı işin sonunda:
   - o sayfanın PAGES Artifact'ı yeniden derlenir ve aynı linke yayınlanır;
   - parça ya da durum haritada yoksa senaryosu eklenir (`_kaynak/tools/screens.py`) ve `ENVANTER.md`'deki satırı ✅ olur;
   - sayfa yoksa yeni numaralı sayfa açılır; PAGES dizinine (https://claude.ai/artifact/YSQYTSXbT8CdQLGR6ozWcy) ve Artifact klasör dizinine (https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471) eklenir;
   - ortak bir parça (kabuk, menü, ConfirmDialog, Toaster, ortak çekmece) değiştiyse onu gösteren bütün sayfalar yeniden derlenir.
2. **Boşluk kalmaz.** İş sırasında haritada olmayan bir sayfa, parça ya da senaryo görülürse aynı işte eklenir; eklenemiyorsa `ENVANTER.md`'ye ❌ satırı olarak yazılır.
3. **Kim yapar:** işi yapan thread, işin sonunda. Tren main'e indirdiğinde koordinatör yeni sha'yı PAGES thread'ine ya da kodu yazan thread'e iletir; o thread sayfaları o sha'dan yeniden kurar.

## Bir ekranı yenilemek
1. `_kaynak/`'ı güncel main'deki `apps/web/.temp/pages/`'e kopyala (`.temp` git'e girmez), `pnpm install`.
2. Yeni ekran ya da senaryo varsa `tools/screens.py`'yi düzenle, `python3 tools/screens.py` koş.
3. `PAGES_OUT=<geçici klasör> node .temp/pages/tools/build-pages.mjs [numara …]` (apps/web içinden). Numara verilmezse hepsi derlenir. Schedule ekranları (3.0–3.2) ayrı `app-schedule.html`'i kullanır, öbürleri `app.html`'i.
4. Kabuk sayfayı yayınla: Artifact aracı, `url` = `tools/pages.json`'daki link, `files: {"app.html": …}` (Schedule'da `app-schedule.html`).
5. Yeni sayfaysa `python3 tools/register.py <no> <url>`.
6. BANT KURALI: yeniden yayından önce `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <sayfa.html> <artifact-id>`.
7. `node .temp/pages/tools/index-pages.mjs <klasör>` ile dizini ve `MAP.txt`'yi yenile, dizini yeniden yayınla; dosyaları buraya kopyala, `_kaynak/`'ı eşitle.

## Sayfa metni
Mert'in kuralı (2026-10-11): sayfa metninde plan, karar ya da kayıt numarası tek başına yazılmaz. Önce ne olduğu sade sözle anlatılır; numara gerekiyorsa sonuna parantez içinde eklenir. Örnek: "Şablonla değiştirirken kaç vardiyanın silineceğini söyler (BL-694)".

## Bilinen sınırlar
- Veri tarayıcıda kalır; "Baştan başlat" iki görünümü de ilk hâline döndürür.
- Schedule telefonda kapalıdır (ürün kararı); telefon görünümü bunu gösterir.
- Giriş ekranları yalnız bugünkü hâliyle belgelenir; yeni giriş tasarımı Mert'in "başla"sını bekler.
