# Devri bekletilecek konular: ne zaman ve nasıl kapsama alınır

Tarih: 14 Ekim 2026 (California saati).

Kısa cevap: **16 thread'in hiçbiri "devretmek güvenli değil" demedi.** Her thread kendi işini push'ladı ya da proje dosyalarına yazdı; yarım kalan kod, yarım canlı veritabanı adımı ya da açık tren yok.

Ama beş konu, bir koşul gerçekleşmeden yeni hesapta başlatılırsa iki hesap birbirine çarpar ya da geri alınamaz bir şey olur. Bunlar aşağıda. Her biri için: neden bekliyor, eski hesapta nereye kadar güvenle sürer, yeni hesaba ne zaman ve nasıl alınır.

---

## 1. Bilgisayardaki tren thread'i (Remote Control)

**Neden bekliyor:** Mert'in bilgisayarında tek bir test makinesi (CI runner) ve tek bir veritabanı kilidi var. Eski hesaptaki tren thread'i ile yeni hesaptaki tren thread'i aynı anda çalışırsa iki tren aynı makineyi kullanmaya çalışır; biri yarıda kalır ya da main yanlış sırayla ilerler.

**Eski hesapta nereye kadar:** yerel yedeği bitirdi (15 dal, 11 commit'lenmemiş iş, 2 stash, 28 yedek ref; hiçbir dal değişmedi). Son adımı kaldı: hesap devri dalını yerel depoya almak (yalnız `git fetch`). Bundan sonra yeni iş almaz.

**Ne zaman alınır:** şu üçü doğru olduğunda:
1. eski tren thread'i son adımı (fetch) bitirdi ve boşta;
2. `node scripts/lock.mjs status` boş, koşan tren yok;
3. Mert eski hesapta proje sohbetine "raporu durdur" yazdı (adım 1, NASIL-DEVAM.md).

**Nasıl:** `NASIL-DEVAM.md` adım 6. Yeni oturum ilk iş `main-watch --since 9b871a97` koşar; çıkış 0 değilse yeni iş başlamaz.

**Açık kalan küçük karar:** bilgisayardaki Claude hafızasının (34 dosya) devir klasörüne kopyalanmasını izin denetimi engelledi. Dosyalar yerinde (`C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\`) ve aynı Windows kullanıcısı kullanılacağı için kaybolmaz. İstersen kendin kopyalarsın ya da yeni tren thread'ine izin verirsin.

## 2. Canlı veritabanı adımları

**Neden bekliyor:** canlı migration Supabase bağlantısıyla (connector) yapılır ve bağlantı Claude hesabına aittir. Yeni hesapta bağlanmadan canlıya hiçbir şey uygulanamaz; bağlanırsa da riskli değişiklik Mert'in kendi "evet"ini ister.

**Bugünkü durum:** canlıda bekleyen ya da yarım migration yok. Son canlı değişiklik (departman arşivinin job'ları da arşivlemesi) uygulandı ve doğrulandı.

**Ne zaman alınır:** yeni hesapta Supabase connector'ı bağlandığında. Bağlandığını tren thread'i ilk kontrolde söyler.

**Nasıl:** yeni projede Settings → Connectors → Supabase → Connect. Sonra her canlı adım CLAUDE.md §5 kontrol listesiyle, tren thread'inde.

## 3. Eski hesaptaki zamanlanmış görevler (bugün 17:05–17:10)

**Neden dikkat:** beş görev eski hesapta, eski sayfa linklerine yayın yapacak ve eski projenin `/mnt/project-files/PAGES/` dosyalarını güncelleyecek. Yeni hesabın dosyaları ve linkleri ayrı olduğu için çarpışma yok, ama yeni projede aynı işi ikinci kez yapmak gerekir.

**Ne yapılır:** dokunma (önerilen). Eski hesabın kullanımı yeterse eski linkler güncel kalır; yetmezse görevler sessizce çalışmaz. Yeni hesapta aynı işler raporlardaki adımlarla baştan yapılır (Üst çubuk 3a, Erişim yok 4.1, Jobs 3.2, Takas 3.2, Job ikonları 4).

**Ne zaman kapsama alınır:** yeni hesapta PAGES yeniden kurulunca (adım 7, sıra 3) bu görevlerin işi yeni hesapta yapılmış olur; eski görevleri kapatmak gerekmez.

## 4. Eski görsel kararlar sayfasındaki süresi dolmuş anahtarlar

**Ne:** eski bir "Today" sayfasının kopyasında 8 test oturumunun anahtarları var (süreleri 10 Ekim'de doldu). Kopya iki yerde: eski projenin dosyası `/mnt/project-files/pages/orijinal/today/index.html` ve eski hesaptaki /oto sayfasının bir eki.

**Bugün yapılan:** devre giden **bütün** kopyalarda (GitHub dalı ve bilgisayardaki tam yedek) anahtarlar "REDACTED" yapıldı. Aynı klasördeki yerel test sunucusu betiklerinde (`pages/orijinal/kaynak/`: gateway.mjs, keys.mjs, record.mjs, postgrest.conf) yerel test şifresi ve imza anahtarı da `[GIZLI-CIKARILDI]` yapıldı.

**Eski hesapta kalan:** yayındaki sayfa ve eski projenin dosyası. Temizlemek bir yayın gerektirir.

**Ne zaman ve nasıl:** Mert eski hesaptaki /oto thread'ine "temizle" yazarsa o thread kendi yayınından dosyayı temizlenmiş kopyayla değiştirir. Yazmazsa risk düşük: anahtarların süresi dolmuş, sayfa özel.

## 5. Meyhouse demo verisi (canlıda)

**Ne:** Takas thread'i Palo Alto için 19–25 Ekim haftasına test verisi koydu. "Testten sonra silelim mi" sorusu açık.

**Neden bekliyor:** canlıda veri silmek geri alınamaz. Kural: Mert'in tren thread'inde kendi yazdığı "evet" ve işi o thread yapar.

**Ne zaman alınır:** yeni tren thread'i kurulduktan (konu 1) ve Supabase bağlandıktan (konu 2) sonra, Mert "sil" derse. O zamana kadar veri canlıda kalır; zararı yok.

---

## Bu devrin kapsamı dışında bırakılan, ama kaybolmayanlar

| Ne | Nerede kalıyor | Neden dışarıda |
|---|---|---|
| Thread konuşma geçmişleri | eski hesapta | Taşınamaz; her thread'in özeti ve kararları kendi raporunda |
| 128 Artifact'ın canlı hâli | eski hesapta | Yeni hesap göremez; kaynakları ve gereken kopyaları devirde |
| `newfork-clean\artifacts\` (765 MB) ve canlı DB yedekleri | Mert'in diski | Büyük ve canlı veri içerebilir; GitHub'a gitmez, disk aynı |
| Eski PC hafızası (34 dosya) | Mert'in diski | Konu 1'deki küçük karar |
| "Devir testi" oturumları | eski hesapta | Kural gereği okunmadı, kopyalanmadı |
| `artifacts/note-mark-r3/.session.json` | Mert'in diski | Anahtar içerir, kopyalanmaz |
