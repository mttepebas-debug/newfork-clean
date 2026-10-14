# CLAUDE.md'de neler değişti (Project düzenine geçiş)

Dal: `claude/project-thread-dk2dg9` @ `0394aa8` · Tam fark: [claude-md-project-gecis.diff](/mnt/project-files/notes/claude-md-project-gecis.diff) · GitHub: https://github.com/mttepebas-debug/newfork-clean/compare/main...claude/project-thread-dk2dg9

## Kurallar (CLAUDE.md)
- **§2 başlık:** "yalnız koordinatör konuşur" yerine "proje sohbetinde koordinatör, thread'de o thread'in Claude'u".
- **§2.1 dosya bağlantısı:** Windows yolu kuralı senin bilgisayarındaki dosyalar için kalıyor. Bulut thread'i repo yolu ya da proje dosyası bağlantısı veriyor.
- **§2.8 sorular:** `/durum` yerine birikmiş sorular `SORULAR.md`'de duruyor, sen durum isteyince ya da üç birikince soruluyor. Project'te soru karar kartıyla.
- **§2.10 komutlar:** Bulut thread'i komutu kendisi Linux'ta koşuyor. Senin bilgisayarında koşacak iş Remote Control thread'ine gidiyor.
- **§4 geri alınamaz iş:** "evet"in işi yapacak thread'e yazılıyor ve işi o thread yapıyor. Riskli canlı migration'ı da thread uyguluyor, ama güvenlik ONAY'ı ve koordinatörün "gönder"i şart.
- **§5 roller:** Koordinatör artık proje sohbetindeki Claude. İki thread türü var: bulut thread'i (kod, birim test, dal) ve Remote Control thread'i (yerel DB, kilit, e2e, tren). Eski koordinatör oturumu, `coord/kayit`, `/oto` ve `/durum` emekli.
- **§5 iş yolu:** Thread PR açmıyor ve birleştirmiyor, dalı trenle main'e gidiyor. Treni ve main alarmını Remote Control thread'i koşuyor. Aynı anda tek kod yazan thread (işçi sınırı 1 aynen).
- **§6 kayıtlar:** `DURUM.md` proje dosyalarına taşınıyor (`/mnt/project-files/DURUM.md`), koordinatör yazıyor. Kayıtları koordinatörün o iş için açtığı thread yazıyor. Senin bir thread'de verdiğin karar o thread'de KARARLAR'a giriyor. Günlük klasörüne yeni gün yazılmıyor, thread geçmişi günlük oluyor.
- **§7:** Koordinatörün klasör ve portları Remote Control thread'ine geçiyor. CI artık PR'da koşmuyor.

## Diğer dosyalar
- **KARARLAR.md:** yeni madde S-116 (bu karar, reddedilen iki seçenek ve nedenleriyle).
- **BACKLOG.md:** BL-991 (bulutta hep kırmızı çıkan kilit testi) ve BL-992 (emekli koordinatörün artık kancaları; `coord/kayit` main'e girdikten sonra silinecek).
- **Betikler:** Bulutta `lock.mjs` ve `train.mjs` "burada yerel veritabanı yok" deyip çıkış 3 ile duruyor ve repo içinde `C:` klasörü açmıyor. Bunu yeni test kanıtlıyor (önce kırmızıydı). Guard günlüğü bulutta geçici klasöre yazıyor.
- **CI:** `pull_request` tetiği kaldırıldı.
- **Silinen:** `/oto` ve `/durum` skill'leri.

## Planladığım ama yapmadığım
- **Guard'ın bulut thread'ini işçi sayması:** yapmadım. Thread'ler artık kayıt yazan taraf (senin bir thread'de verdiğin karar o thread'de KARARLAR'a giriyor); guard onları reddederse kimse kayıt yazamazdı. Bulutta tren zaten koşmuyor.

Kontroller: kökteki betik testleri 213 geçti, 1 kırmızı (BL-991; main'de de aynı, bulut makinesi 6 dakikadır açık olduğu için). eslint temiz.
