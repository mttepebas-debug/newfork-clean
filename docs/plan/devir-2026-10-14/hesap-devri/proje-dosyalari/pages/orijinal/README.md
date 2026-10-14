# Orijinal: bugünkü uygulama (main) sayfalara nasıl eklendi

Ne: Diğer hesaptan taşınan varyant sayfalarının üstünde "Orijinal · bugünkü uygulama" ve "Varyantlar" düğmeleri var. Orijinal, main'in gerçek web kodunu (apps/web) çalıştırır; ekranlar, sekmeler, çekmeceler ve pencereler gerçek koddur. Kaydetme kapalıdır ("Saving is off" uyarısı çıkar), hiçbir şey değişmez.

Hangi main: 9a9793e2 (2026-10-09, vardiya penceresinde saat yazma ve Undo dahil).

Veri: Schedule test sayfasıyla aynı demo dünya (Harbor & Vine; Downtown ve Uptown, New York saati; Maria Lopez, Daniel Kim, Noah Garcia, Ethan Brooks…). Bu dünya bulut thread'inde yerel bir veritabanına (bütün migration'lar) ve gerçek API'ye kuruldu; her kişi gerçek giriş ekranından girip ekranları gezdi; API ve veritabanı cevapları kaydedildi. Sayfadaki kopya bu kayıtları geri oynatır, saat kayıt anında durur.

Kim bakıyor: Mert Tepebas (Owner), Laura Bennett (Admin), Hannah Lee (Manager, Downtown), Maria Lopez (Employee), Ben Carter (onboarding'de), Chloe Adams (davet edildi), Jordan Hayes (kurulumu bitmemiş owner), Alex Morgan (workspace'i yok), giriş yapılmamış.

Dosyalar
- today/index.html: derlenmiş Orijinal kopyası (tek dosya). Her sayfanın yayınında aynı yolda (today/index.html) durur.
- tuval/: Pre-business tuvaline eklenen 17 ekran görüntüsü (1440x900).
- onceki/: Orijinal eklenmeden önceki sayfa kaynakları ve tuvalin dizin dosyası (yedek).
- kaynak/: derleme ve kayıt araçları (replay kodu, kayıt planı, demo dünya SQL'i, sayfaya ekleme betiği, sayfa ayarları cfg/*.json).

Yenilemek (main değişince): demo dünyayı kur → kaydet (kaynak/record.mjs kaynak/plan.mjs) → apps/web içinde `.temp/orijinal` kopyasını derle → kaynak/inject.py ile sayfalara ekle → aynı bağlantılara yeniden yayımla. Kayıtta olmayan bir istek gelirse ekran boş liste ya da "Saving is off" gösterir.

Pre-business & Settings bir Design tuvalidir; tuval iframe kabul etmez. Orada Orijinal, aynı kopyadan alınmış ekran görüntüsü çizimleri olarak eklendi.
