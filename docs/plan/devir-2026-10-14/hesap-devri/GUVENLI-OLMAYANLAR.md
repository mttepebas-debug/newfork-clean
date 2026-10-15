# Devri bekletilecek konular: ne zaman ve nasıl kapsama alınır

Tarih: 14 Ekim 2026 (California saati); 15 Ekim'de Projects'siz yeni hesaba göre güncellendi. Yeni hesapta Projects yok: "tren thread'i", "koordinatör" yerine ana oturum (`NASIL-DEVAM.md` bölüm 0).

Kısa cevap: **16 thread'in hiçbiri "devretmek güvenli değil" demedi.** Her thread kendi işini push'ladı ya da proje dosyalarına yazdı; yarım kalan kod, yarım canlı veritabanı adımı ya da açık tren yok.

Ama beş konu, bir koşul gerçekleşmeden yeni hesapta başlatılırsa iki hesap birbirine çarpar ya da geri alınamaz bir şey olur. Bunlar aşağıda. Her biri için: neden bekliyor, eski hesapta nereye kadar güvenle sürer, yeni hesaba ne zaman ve nasıl alınır.

---

## 1. Bilgisayardaki tren (eski hesapta Remote Control thread'i, yeni hesapta ana oturum)

**Neden bekliyor:** Mert'in bilgisayarında tek bir test makinesi (CI runner) ve tek bir veritabanı kilidi var. Eski hesaptaki tren thread'i ile yeni hesabın ana oturumu aynı anda tren koşarsa iki tren aynı makineyi kullanmaya çalışır; biri yarıda kalır ya da main yanlış sırayla ilerler.

**Eski hesapta nereye kadar:** yerel yedeği bitirdi (15 dal, 11 commit'lenmemiş iş, 2 stash, 28 yedek ref; hiçbir dal değişmedi). Son adımı kaldı: hesap devri dalını yerel depoya almak (yalnız `git fetch`). Bundan sonra yeni iş almaz.

**Ne zaman alınır:** şu üçü doğru olduğunda:
1. eski tren thread'i son adımı (fetch) bitirdi ve boşta;
2. `node scripts/lock.mjs status` boş, koşan tren yok;
3. Mert eski hesapta proje sohbetine "raporu durdur" yazdı (adım 1, NASIL-DEVAM.md).

**Nasıl:** `NASIL-DEVAM.md` adım 2–4 (ana oturumu aç, ilk mesaj). Ana oturum ilk iş `node scripts/main-watch.mjs --since 2f2f744c` ve `node scripts/lock.mjs status` koşar; çıkış 0 değilse ya da kilit doluysa tren koşmaz, Mert'e söyler.

**Açık kalan küçük karar:** bilgisayardaki Claude hafızasının (34 dosya) devir klasörüne kopyalanmasını izin denetimi engelledi. Dosyalar yerinde (`C:\Users\TheWe\.claude\projects\C--Users-TheWe-Documents-Codex-newfork-clean\memory\`) ve aynı Windows kullanıcısı kullanılacağı için kaybolmaz. İstersen kendin kopyalarsın ya da yeni hesabın ana oturumuna izin verirsin.

## 2. Canlı veritabanı adımları

**Neden bekliyor:** canlı migration Supabase bağlantısıyla (MCP) yapılır ve bağlantı Claude hesabına ya da Claude Code ayarına aittir. Yeni hesapta bağlanmadan canlıya hiçbir şey uygulanamaz; bağlanırsa da riskli değişiklik Mert'in kendi "evet"ini ister.

**Bugünkü durum:** canlıda bekleyen ya da yarım migration yok. Son canlı değişiklik (departman arşivinin job'ları da arşivlemesi) uygulandı ve doğrulandı.

**Ne zaman alınır:** yeni hesabın ana oturumunda Supabase MCP bağlandığında. Bağlı olup olmadığını ana oturum ilk kontrolde söyler (`NASIL-DEVAM.md` adım 4, madde 6).

**Nasıl:** bağlı değilse ana oturum bağlama adımlarını Mert'e numaralı yazar. Sonra her canlı adım CLAUDE.md §5 kontrol listesiyle, ana oturumda; riskli olan Mert'in ana oturumda kendi yazdığı "evet"le.

## 3. Eski hesaptaki zamanlanmış görevler (bugün 17:05–17:10)

**Neden dikkat:** beş görev eski hesapta, eski sayfa linklerine yayın yapacaktı. Üçü sayfa sayfa belgeleme (PAGES) sayfalarını güncelliyordu (Üst çubuk, Erişim yok, Jobs), ikisi görsel karar sayfalarını (Takas mockup'ı, Job çizimleri). Yeni hesabın dosyaları ve linkleri ayrı olduğu için çarpışma yok.

**Ne yapılır:** dokunma (önerilen). Eski hesabın kullanımı yeterse eski linkler güncel kalır; yetmezse görevler sessizce çalışmaz. PAGES 15 Ekim'de emekli oldu (Mert): yeni hesapta PAGES sayfaları kurulmaz, güncellenmez, yayınlanmaz. Takas mockup'ı ve Job çizim sayfası, o işler yeni hesapta açılınca kendi kaynak dosyalarından yeni linkle yayınlanır (Takas 3.2, Job ikonları 4).

**Ne zaman kapsama alınır:** gerekmez. Eski görevleri kapatmak da gerekmez.

## 4. Eski görsel kararlar sayfasındaki süresi dolmuş anahtarlar

**Ne:** eski bir "Today" sayfasının kopyasında 8 test oturumunun anahtarları var (süreleri 10 Ekim'de doldu). Kopya iki yerde: eski projenin dosyası `/mnt/project-files/pages/orijinal/today/index.html` (eski hesapta) ve eski hesaptaki /oto sayfasının bir eki. Bilgisayardaki PD kopyası temizlenmiş hâlidir.

**Bugün yapılan:** devre giden **bütün** kopyalarda (GitHub dalı ve bilgisayardaki tam yedek) anahtarlar "REDACTED" yapıldı. Aynı klasördeki yerel test sunucusu betiklerinde (`pages/orijinal/kaynak/`: gateway.mjs, keys.mjs, record.mjs, postgrest.conf) yerel test şifresi ve imza anahtarı da `[GIZLI-CIKARILDI]` yapıldı.

**Eski hesapta kalan:** yayındaki sayfa ve eski projenin dosyası. Temizlemek bir yayın gerektirir.

**Ne zaman ve nasıl:** Mert eski hesaptaki /oto thread'ine "temizle" yazarsa o thread kendi yayınından dosyayı temizlenmiş kopyayla değiştirir. Yazmazsa risk düşük: anahtarların süresi dolmuş, sayfa özel.

## 5. Meyhouse demo verisi (canlıda)

**Ne:** Takas thread'i Palo Alto için 19–25 Ekim haftasına test verisi koydu. "Testten sonra silelim mi" sorusu açık.

**Neden bekliyor:** canlıda veri silmek geri alınamaz. Kural: Mert'in ana oturumda kendi yazdığı "evet" ve işi ana oturum kendisi yapar (alt ajana verilmez).

**Ne zaman alınır:** eski tren boşa çıkıp (konu 1) Supabase bağlandıktan (konu 2) sonra, Mert "sil" derse. O zamana kadar veri canlıda kalır; zararı yok.

---

## Bu devrin kapsamı dışında bırakılan, ama kaybolmayanlar

| Ne | Nerede kalıyor | Neden dışarıda |
|---|---|---|
| Thread konuşma geçmişleri | eski hesapta | Taşınamaz; her thread'in özeti ve kararları kendi raporunda |
| 128 Artifact'ın canlı hâli | eski hesapta | Yeni hesap göremez; kaynakları ve gereken kopyaları devirde |
| `newfork-clean\artifacts\` (765 MB) ve canlı DB yedekleri | Mert'in diski | Büyük ve canlı veri içerebilir; GitHub'a gitmez, disk aynı |
| Eski PC hafızası (34 dosya) | Mert'in diski | Konu 1'deki küçük karar |
| Eski projenin talimat kutusu, hafızası, karar kartları | eski hesapta | Yeni hesapta Projects yok; talimat `CLAUDE.local.md`'ye (NASIL-DEVAM adım 3), hafızanın özü ana oturumun hafızasına (adım 4) |
| "Devir testi" oturumları | eski hesapta | Kural gereği okunmadı, kopyalanmadı |
| `artifacts/note-mark-r3/.session.json` | Mert'in diski | Anahtar içerir, kopyalanmaz |
