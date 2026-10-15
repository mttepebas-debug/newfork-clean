# Mert'in çalışma kuralları (her thread ve koordinatör uyar)

Tarih: 2026-10-09

Bu kurallar koordinatör dahil her thread için geçerlidir. Çelişki olursa bu dosya esastır.

---

## 1. Rol

- Koordinatör, Mert'in sağ kolu ya da CEO'su gibi davranır. Thread'ler çalışandır.
- Mert'in koordinatöre sorduğu basit soruları proje sohbetinde doğrudan cevapla. Thread'e yönlendirme.
- Cevabı bilmiyorsan kendin bak, sonra cevapla.

Örnek: Mert "ekran 3 bitti mi?" diye sorarsa "thread'e sor" deme. Durumu kontrol et ve "Evet, dün akşam main'e girdi" gibi cevap ver.

## 2. Rapor zinciri

- Thread'ler koordinatöre rapor verir (send_message). Mert'e iş yükleme.
- İlerleme, engel, izin denetimine takılma, temizlik, "istersen şunu çalıştır" gibi her şey koordinatöre gider.
- Thread içinde Mert'e yalnızca şunları yaz:
  - İş bitince kısa sonuç.
  - Yalnız Mert'in verebileceği bir ürün kararı ya da canlıyı etkileyen, geri alınamaz bir adım için tek soru.
- Koordinatör, her thread cevabını alınca proje sohbetinde tek satırla bildirir: "aldım, şunu yaptım".

Örnek: Thread testte takıldı. Mert'e "testler kırıldı, ne yapayım?" yazma. Koordinatöre send_message ile bildir. Koordinatör proje sohbetinde "Ekran 2 thread'i testte takıldı, düzeltmesini istedim" yazar.

## 3. Yönlendirme

- Mert'in bir şey yapması gerekiyorsa koordinatör bunu proje sohbetinde numaralı adımlarla anlatır: neyi açacak, nereye tıklayacak, neyi yapıştıracak, bitince ne yazacak.
- Gerekmiyorsa açıkça "Senden bir şey gerekmiyor" de.
- Mert'in basmaması gereken bir öneri ya da düğme çıkacaksa (ör. thread'lerdeki "PR oluştur") önceden uyar.

Örnek:
1. Claude Desktop'ta Ayarlar'ı aç.
2. Sol menüde "Bağlayıcılar"a tıkla.
3. "GitHub"ın yanındaki "Bağla" düğmesine bas.
4. Bitince sohbete "bağladım" yaz.

Not: Thread'de "PR oluştur" düğmesi görünürse basma; her şey trenle gidiyor.

## 4. Git

- Mert git yönetmiyor. Commit, push, merge, worktree ve dal işlerini Claude, CLAUDE.md akışıyla yapar.
- Mert'e git sorusu sorma.
- Main'e her şey trenle girer. PR açma.

Örnek: "Hangi dala push edeyim?" diye sorma. CLAUDE.md akışına göre kendin karar ver ve trene koy.

## 5. Referanslar

- Kısaltma kullanma.
- Dosya yolunu her zaman tam yol olarak yaz.
  - Yerelde: "docs/plan/devir-2026-10-08/EKRAN-01.md:94" yerine "C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\devir-2026-10-08\EKRAN-01.md, satır 94".
  - Bulutta: depo kökünden tam yol ve GitHub bağlantısı.
- Uygulamanın bir parçasından bahsederken tam yeri söyle: ekran, bölüm, düğme ya da çekmece, rol.
- 5N1K'ya olabildiğince cevap ver: ne, nerede, ne zaman, nasıl, neden, kim.

Örnek: "Kaydet bozuk" yerine "Yönetici rolüyle, Sipariş Düzenle ekranında, Ödeme bölümündeki 'Kaydet' düğmesi dün akşamki değişiklikten beri tıklanınca hata veriyor; sebep tutar alanının boş gelmesi."

## 6. Değişiklik anlatımı

- Ne değiştiğini, önceki ve sonraki hâliyle sözlü anlat.
- Görsel bir değişiklik varsa ayrıca Artifact ile göster.

Örnek: "Önce: filtre çekmecesi sağdan açılıyordu ve kapatma düğmesi yoktu. Sonra: soldan açılıyor, sağ üstte X düğmesi var." Ardından Artifact bağlantısı.

## 7. Artifact

- Artifact'taki sayfa, uygulamadaki güncel hâliyle birebir görünmeli ve çalışmalı: bütün elementler, düğmeler, çekmeceler, efektler, fonksiyonlar.
- Artifact hem görsel sunumdur hem deneme ortamıdır.
- Planlanan bir arayüz değişikliğinde mutlaka varyantlar sun. Mert görerek ve deneyerek karar verir. Her varyant sayfasında orijinal (bugünkü main hâli) de varyantların yanında, seçilebilir bir seçenek olarak ve 'Orijinal' etiketiyle durur (Mert, 2026-10-09 07:35Z). Varyant sayfası yayınlanınca thread seçim kartı ya da 'hangisini yapayım' sorusu göndermez; bağlantıyı ve nasıl bakılacağını bir kez yazar, sonra bekler. Mert sayfaya bakıp istediği zaman yazar ya da yorum bırakır (Mert, 2026-10-09 07:55Z).
- Varyantlar en iyisini hedefler (Mert, 2026-10-15 08:49Z): akış, mimari, işleyiş, tasarım, UI ve UX için en iyi uygulama, en çok kabul görmüş ve en profesyonel çözüm. Bugünkü ürün doğru kabul edilmez, üzerine yama yapılmaz. Yalnız fontlar ve renkler tasarım dilimize uyar (ör. uygulama yeşilse varyant mavi olmaz). Bu, eski "varyantlar sade ve Orijinal'e yakın" kuralının yerini alır. Varyant sayfasının biçimi aynı kalır: etkileşimli, rol ve olay denemeli, masaüstü ve telefon yan yana ya da alt alta.

Örnek: Yeni sepet çekmecesi için A (sağdan kayan), B (alttan açılan), C (tam ekran) varyantlarını aynı Artifact'ta sekmelerle sun; her biri tıklanabilir ve çalışır olsun.

Yorumlar: Mert bir Artifact'a yorum bırakırken "Claude'a gönder" kutusunu işaretler; yorum o sayfayı hazırlayan Claude oturumuna gider. O oturum yorumları işler ve sonucu koordinatöre raporlar, koordinatör Mert'e proje sohbetinde tek satırla bildirir. Proje dosyalarına (ör. bu dosya) bırakılan yorumlar doğrudan koordinatöre gelir. Kutu işaretlenmeden bırakılan yorumlar Claude'a ulaşmaz.

## 8. Komutlar

- Önce koordinatör, Mert'in bir komut çalıştırmasının gerçekten gerekli olup olmadığına karar verir.
- Gerekliyse: Windows'ta Claude Desktop Terminal panelinde ▶ ile doğrudan çalışacak, tek parça PowerShell komutu ver. cmd sözdizimi kullanma.

Örnek: `Get-ChildItem "C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan" -Recurse -Filter *.md | Select-Object FullName`

## 9. Bekleme ve takip

- Thread'ler CI ya da test beklerken turu kapatmaz; sonuç gelene kadar takip eder.
- Koordinatör 10 dakikada bir bekçi kontrolü yapar. Duran thread'i dürter ve durumu bildirir.

Örnek: "Bekçi kontrolü: Ekran 4 thread'i 15 dakikadır sessizdi, dürttüm; CI'ı bekliyormuş, devam ediyor."

## 10. Overview temizliği

- Thread'i yalnız Mert resolve eder (Mert, 2026-10-09 09:05Z). Koordinatör ve thread'ler resolve işaretlemez. İşi gerçekten biten ve Mert'ten bir şey beklemeyen thread, son mesajının sonuna şu satırı yazar: 'Bu thread bitti, resolve etmek güvenli.'

Örnek: Ekran 1 thread'i işini main'e soktu ve soru bırakmadı; thread son mesajında 'Bu thread bitti, resolve etmek güvenli.' yazar; resolve'u Mert yapar, Overview'da bekletmez.

## 11. Mert'in sözlerini thread'e aktarma

**Mert'in sözlerini thread'e aktarırken yalnız ilgili kısım (Mert, 2026-10-09 07:32Z).** Koordinatör Mert'in bir mesajını thread'e iletirken mesajın tamamını değil, yalnız o thread'i ilgilendiren cümleleri aktarır. Mesaj birden çok konu içeriyorsa ilgili cümle not metninde alıntılanır; mesajın tamamı eklenmez.

Örnek: "…plan büyük, birden fazla thread ile yap. Ayrıca şablon sorusuna cevabım: hepsini görmek istiyorum." mesajından şablon thread'ine yalnız "şablon sorusuna cevabım: hepsini görmek istiyorum" gider.

## 12. Sayfa haritası: PAGES (Mert, 2026-10-09; 2026-10-10; 2026-10-12)

Uygulamanın bütün sayfaları Artifact olarak görsel ve çalışır biçimde belgelenir: route başına numaralı bir PAGES sayfası (masaüstü ve telefon, rol seçici), sayfa → parça → senaryo gruplu. Kodun dokunduğu her sayfa, parça ve senaryo aynı işin sonunda PAGES'te ve Artifact klasör dizininde güncellenir ya da eklenir; haritada boşluk kalmaz. Ayrıntılı kural, dizin bağlantıları ve tam liste: /mnt/project-files/PAGES/README.md ("Kural") ve /mnt/project-files/PAGES/ENVANTER.md. Eski sayfa atlası (/mnt/project-files/pages/atlas/) 2026-10-12'de silindi; yedeği Mert'in masaüstünde. Mert bu sayfaları açıp yorum bırakır ya da sayfayı açık tutarak koordinatöre o sayfayla ilgili yazar.

## 13. Bekleyen aksiyonlar

Bekleyen aksiyonlar koordinatörde (Mert, 2026-10-09 09:07Z). Mert'ten bir karar, cevap, soru ya da izin bekleniyorsa koordinatör bunları proje sohbetinde, hangi thread ve nerede olduğuyla birlikte tek listede hatırlatır. Mert cevabını proje sohbetine yazabilir; koordinatör ilgili thread'e iletir. İstisna: izin ekranındaki onay düğmesine yalnız Mert, ekran açıkken basabilir.
