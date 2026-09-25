# Koordinatör mirası (2026-09-24/25)

Takımlardan önce bu depoyu tek bir "Koordinatör" oturumu yönetti. Kullanıcının o dönemde koyduğu
ya da onayladığı kurallar aşağıda. `CLAUDE.md` ile birlikte geçerlidir; çelişirse `CLAUDE.md`
kazanır, kullanıcının yeni yazılı talimatı ikisinden de önce gelir. Kullanıcının genel kuralları
(`~/.claude/CLAUDE.md`: iş alma, raporlama, backlog işaretleri, bulguların backlog'a gitmesi) her
oturuma zaten yüklenir; burada yalnız bu projede öğrenilenler var. Asıl uygulayıcı Strateji
lead'idir; diğer lead'ler görev verirken ve raporlarken aynı kurallara uyar.

## 1. Kullanıcıyla konuşmak
- Kullanıcı kod yazmaz. Her teknik ad ilk geçtiği mesajda üç şeyle gelir: uygulamadaki yeri
  (ekran adı ve yolu), bir kişi için ne değiştirdiği, somut bir örnek. Backlog numarası tek başına
  yazılmaz; "BL-112" yerine "CI'ı hızlandırmak (BL-112)". Kullanıcı numarayı iki kez sordu.
- Soru tek tıkla cevaplanabilir: seçenekler adlı, önerilen ilk sırada ve "(Önerilen)" etiketli,
  her seçeneğin altında ne olacağı. Sorular toplanır, tek turda sorulur.
- Tekrarlayan bir maliyet ilk mesajda DOLAR olarak, kaynağıyla verilir; dakika, adet gibi ara
  birimler yanında durabilir. (CI maliyeti önce dakika olarak söylendi; kullanıcı doları sormak
  zorunda kaldı ve karar dolar görülünce verildi.)
- Bitmiş işin raporu: nerede duruyor / ne yapıldı (etki olarak) / açık kalan ve nedeni / ekranda
  ne değişti (ekran adıyla; "hiçbir şey" de geçerli) / sırada ne var ve neden.
- Kendi hatanı saklama; aynı mesajda açıkça "benim hatam" de ve ne yaptığını yaz.

## 2. Görev vermek
- Yeni bir iş göndermeden önce kullanıcıya tek mesajda: ne yapılacak, kapsam içi/dışı, ne zaman
  bitmiş sayılır, hangi model ve effort (gerekçesiyle). Onay gelmeden gönderilmez. Kullanıcının
  zaten onayladığı bir planın sıradaki adımı (ör. FOUNDATION-B aşamaları) sorulmadan yürür.
- Model ve effort seçimi işe göre yapılır ve iş değişince yeniden ayarlanır:
  - mekanik, sınırlı (tek ayar, ölçüm, taşıma): Sonnet, orta ya da düşük effort;
  - bilinen kalıpta sıradan geliştirme: orta sınıf, orta effort;
  - yetki, veri kuralı, ortak kapı (CI, main), belirsiz iş: Opus, yüksek effort;
  - max yalnız gerçekten derin ve pahalı hatalı işlerde. İş küçülünce modeli geri düşür.
- Her görev ve plan mesajında bir "Skills" bölümü bulunur: adım → skill adı (Skill aracındaki
  adıyla) → neden. Kısa tut, yalnız işin nasıl yapılacağını değiştirenler. Bu projede işe yarayanlar:
  - `supabase:supabase`, `supabase:supabase-postgres-best-practices`: RLS, fonksiyon, performans;
  - `superpowers:test-driven-development`: kural değişikliği önce testle;
  - `superpowers:systematic-debugging`: kırmızı test, beklenmeyen davranış;
  - `security-review`, `superpowers:verification-before-completion`: main'e almadan önce;
  - `design:design-critique`, `design:ux-copy`: ekran turu, metinler;
  - `run` ve dahili tarayıcı: değişikliği gerçek uygulamada ekran görüntüsüyle göstermek.
- Skill listesi oturuma göre değişir (kurulu eklentiler farklı olabilir). Görevdeki bir skill alıcının
  listesinde yoksa alıcı onu atlar, yerine aynı işi gören bir yol kullanır ve raporda belirtir.
- Görev mesajının iskeleti: amaç; kapsam (içi / dışı, farkları işaretli); kullanıcının onayladığı
  eylemlerin açık listesi (indirme adı ve boyutu, kalıcı kurulumlar); görevi verenin önceden ölçtüğü
  ortam bilgisi (tarih ve commit ile); sıra; bitiş kriterleri; tuzaklar; rapor biçimi ve adresi.
- Rapor gelince sonradan incelenir: iddia edilen CI koşusu ve commit bağımsız olarak kontrol edilir,
  riskli yüzeyde (yetki, ortak veritabanını koruyan betikler) değişikliğin kendisi okunur.

## 3. Onaylar ve güvenlik
- Aktarılan onay geçmez. Geri alınamaz silme, hosted veri silme, `supabase db reset`, dosya
  indirme, kalıcı kurulum (runner kaydı, zamanlanmış görev) için kullanıcı "evet"i işi yapan
  oturumun kendi penceresine yazar. Lead yalnız ne zaman ve hangi pencereye yazacağını söyler.
- Yetki kodunda "bilgi eksikse izin ver" (fail-open) varsayılanı görülünce bekletilmez; o iş içinde
  kapatılır, pratikte hiç eksik gelmediği iddia ediliyorsa testle kanıtlanıp yine kapatılır.
- Kullanıcı kararları: Supabase "Leaked password protection" açılmaz (ücretli plan; advisors'taki
  uyarı bilinen ve muaf). GitHub Actions harcama limiti $0; GitHub'ın makinesinde iş koşmaz, bu
  bir hata değildir. Realtime "Allow public access" kapalı; her canlı kanal private (REUSE DATA-07).
  Dahil olmayan bir Supabase oturumu (eklenti MCP) yeniden giriş isteyebilir; ikinci bağlayıcı çalışır.

## 4. CI ve ortak kaynaklar
- CI kullanıcının bilgisayarında, üç self-hosted runner'da (REUSE OPS-01). Bir runner, onu
  yalıtan değişiklik main'e girmeden `newfork-local` havuzuna eklenmez; etiket değişikliği tek
  adımda, main'e alma ile birlikte yapılır. 2026-09-24'te erken eklenen iki runner iki main
  koşusunu bozdu (iki iş aynı test yığınını paylaştı, biri ötekinin veritabanını kapattı).
- Ubuntu tek başına `wsl --terminate` / `--shutdown` ile yeniden başlatılmaz: Docker Desktop'ın
  bağlantısı kopar, ortak yerel veritabanı düşer. Çözüm Docker Desktop'ı yeniden başlatmaktır.
- main'e her kod gönderiminden sonra main CI izlenir. Kod gönderimi o sırada koşan main CI'ı iptal
  eder (docs gönderimi tetiklemez): koşusunu iptal ettiğin takıma haber ver ya da bitmesini bekle.
- Kırmızı main'i kimseye yüklemeden önce ayır: yalnız düşen işleri yeniden koştur, işlerin hangi
  runner'da ve hangi sırayla koştuğuna bak. Altyapıdan gelen kırmızı koda düzeltme yazdırmaz.
- Ortak yerel veritabanı `seed.sql` değişikliklerini görmez; seed'e dayanan bir kırılma yalnız
  CI'da çıkar.

## 5. Kayıtlar
- Yeni bir BL numarası almadan önce `git fetch` ve `origin/main`'deki en yüksek numaraya bak;
  aynı gün iki kez iki takım aynı numarayı kullandı.
- Kapanan backlog maddesine "Kapandı <tarih> (`<commit>`)" ve ölçülen sonuç yazılır, `DONE.md`'ye
  etki cümlesiyle bir satır eklenir. Tekrar gerekecek bilgi (çalıştırma kılavuzu, ortak yardımcı)
  REUSE'ya satır olarak girer (ör. OPS-01, DATA-06).

## 6. Oturumların yaşam döngüsü
- İşi biten oturum doğrulanır: çalışma kopyası temiz, dalı main'de ve silinmiş, stash yok, arkada
  koşan iş yok, bildiği her şey kayıtta. Öyleyse kullanıcıya "arşivlenebilir" denir.
- Arşiv, telefon bağlantısı (Remote Control) açıkken reddedilir; bağlantıyı kapatmak için her
  seferinde kullanıcıya sorulur ("yalnız bu sefer" kararı).
- Uzun yollar yüzünden `git worktree remove` yarım kalırsa klasör PowerShell ile
  `Remove-Item -LiteralPath '\\?\C:\...' -Recurse -Force` silinir, ardından `git worktree prune`.
