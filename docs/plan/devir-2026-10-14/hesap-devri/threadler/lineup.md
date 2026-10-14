# Lineup devir raporu (14 Ekim 2026, 09:50 California)

Yeni hesaptaki Claude bu dosyayı, sonra `PLAN.md`'yi okuyarak başlar. Kurallar repo `CLAUDE.md`'dedir. Mert'e Türkçe ve sade yazılır, saatler California saatiyle verilir.

## 1. Thread
- **Adı:** "Lineup devam". Eski project'te thread başlığı buydu.
- **Amacı:** Schedule'ın altındaki günlük Lineup sayfasını tasarlamak, sonra kodlamak. Bu thread 14 Ekim sabahı eski Lineup thread'inden devraldı (`DEVIR-2026-10-14.md`).
- **Sahip olduğu alan:**
  - Lineup ekranları ve telefon taslakları.
  - `apps/web/src/shell/LoadState.tsx`: yükleniyor/hata görünümü B.

## 2. Bitenler (main'de)
Bu thread kod yazmadı; bütün kod işi eski Lineup thread'inden kaldı ve main'de:
- Salt okunur Lineup sayfası `/app/schedule/lineup`, yalnız web (b8315a0f).
- Telefonda Lineup (32bbbc47).
- Telefonda yazı kutuları 16 px (ff275b71).
- Yükleniyor/hata görünümü B bütün uygulamada:
  - alan a (5d83f506) ve b (3b138c3b);
  - Schedule'daki son parça (e0c18aae);
  - Schedule için sonraki düzeltmeler başka thread'lerden geldi (LOAD-STATES-F, ör. 9288da3).

## 3. Yarım kalan iş: telefon Lineup tasarımı

### Nerede kaldı
Mert 14 Ekim 03:11 PM California'da (10:11Z) telefon taslağına yorum bıraktı:
- "Vardiya sekmeleri" (B) kalsın.
- Satır düzeninin hiçbiri hoşuna gitmedi; 3 yeni varyant istedi.
- İstediği bilgiler: Departman + Add staff · Job, Label, Section · İkon, isim, etiket.
- Sonra ekledi: telefon ekranının tamamı tasarlansın; kurallarını eğebiliriz; job ikonları baş harflerin yerine gelecek.

Varyantlar teslim edildi. Mert bugün 8:23–8:40 AM California arasında (15:23–15:40Z) üzerinde düzeltme yaptırdı. Son düzeltme uygulandı ve dosyaya kondu. Mert'in bir sonraki yorumu ya da seçimi bekleniyor.

### Dosya
`/mnt/project-files/pages/gorsel-kararlar/gelen/lineup-satir/index.html`. Tek dosya, tarayıcıda açılır. Solda **Tasarım**, **Görünüm** (Müdür/Çalışan) ve **An** listesi var (Add Staff, Publish, çalışan görünümü vb.).

### Tasarımlar
- **Original:** bugünkü telefon taslağı, karşılaştırma için.
- **1 · Sakin liste:** sütun başlığı yok; isim ve saat solda, Section sağda, etiket Section'ın altında rozet.
- **2 · Hizalı çizelge:** büyük konum başlığı; Label ve Section hizalı sütunlarda; gruplar kenardan kenara.
- **3 · İstasyon kartları:**
  - Departman kartları ve renkli Section rozeti.
  - Üstte saat saat kişi sayısını gösteren küçük bir çizelge var. Mert bunu istemedi; beğenmezse çıkar.
  - Çalışan görünümünde "Called off" kişiler gizli. Mert'e söylendi, cevap yok.
- **4 · Sakin liste, tam genişlik:** Mert'in isteğiyle 1'in kopyası; beyaz gruplar ekranın iki kenarına uzanıyor.

### Mert'in bugünkü düzeltmeleri (hepsi uygulandı)
1. Onaydan sonraki yazı "Acknowledged. Sarah can see it." idi. Artık yalnız "Acknowledged." yazıyor; dört tasarımda ve Original'de. Düğme yanındaki "Sarah'ya bildir" açıklamaları da silindi.
   - Açık soru: yayın öncesi bekleme yazılarında ("Sarah yayınlayınca…") isim duruyor. Mert'e kaldırılsın mı diye soruldu, cevap yok.
2. 1'in beyaz grupları tam genişlik oldu; 1 bozulmasın diye bu ayrı tasarım (4) olarak eklendi.
3. Kişi penceresinde Label artık açılır liste (None, Opener, Closer, Training, Lead); yalnız 1 ve 4'te.
   - Açık soru: 2 ve 3'e de geçsin mi? Cevap yok.
4. Açılır listelerin seçenekleri sola hizalandı (1 ve 4). Açılan liste ekran görüntüsünde görünmediği için Mert'in kendi tarayıcısında doğrulaması istendi; cevap yok.
5. Call off'ta ilk dokunuş artık pencereyi yenilemiyor; yalnız düğme "Tap again to call off" oluyor. Dört tasarımda da geçerli (ortak `core.js`), otomatik testle denendi.
   - Add Staff'taki "Move here" ve "Add anyway" hâlâ pencereyi yeniliyor. Mert sadece Call off'u istedi.
6. Publish penceresinde Publish'e basınca pencere kapanıyor ve Lineup salt okunur görünüyor; altta bildirim çıkıyor. Dört tasarımda otomatik testle denendi.
7. Yayından sonraki **Edit** düğmesi ilk beyaz grubun sağ üstüne taşındı. "Draft · not published" ve "12 on the floor · First in 3:00 PM" yazıları kaldırıldı. Notes düğmesi tek başına sağda duruyor. Bu ikisi yalnız 1 ve 4'te yapıldı.
   - **Geri istenebilir:** aynı satırdaki "Published 2:10 PM · 7 of 12 acknowledged" yazısı da kalktı. Müdür kaç kişinin okuduğunu bu ekranda artık görmüyor. Mert'e söylendi, cevap yok.

### Sonraki adım
Mert'in yorumunu bekle ve kaynakta uygula. `kaynak/` içinde ilgili dosyayı düzelt, `python3 build.py` çalıştır, `index.html`'i paylaşılan klasöre kopyala. Mert bir tasarım seçince:
1. Seçilen tasarımı telefon taslağına (Artifact HpPEj…) işle.
2. `PLAN.md` §4 "Telefon" bölümünü güncelle.
3. Kararı `KARARLAR.md`'ye yazılmak üzere hazırla.

### "Kodla" bekleyişi
Lineup kodu (düzenleme, call off, notlar, yayın) Mert "kodla" deyince başlar (`PLAN.md` §12, aşama 0). Bu iş yeni tablolar ve canlı migration ister, yani incelemeli bir iştir. İlk adım: 13–14 Ekim kararlarını `KARARLAR.md`'ye yazmak, sonra aşama 1 (veritabanı, ekleyen migration).

## 4. Mert'ten beklenenler
1. Telefon Lineup tasarımı: 1, 2, 3 ya da 4 (ya da karışım) ve yukarıdaki açık sorular.
2. Eski devirden açık seçimler (`DEVIR-2026-10-14.md` §3):
   - Add Staff penceresi: 1 Durum listesi (önerilen) ya da 2 Önce en uygunlar. Ayrıca "Already worked here"ın anlamı.
   - Çalışanın vardiya özeti.
   - "Read" sütunu kalsın mı.
   - `PLAN.md` §11 açık soruları.

   Satır düzeni sorusu artık yukarıdaki yeni tasarımlarla yanıtlanacak.
3. Job ikon paketi: Mert numara numara keep/sil verecek ("Restoran job ikon paketi" işi). Lineup'ta ikonlar baş harflerin yerine gelecek. Taslaktaki çizimler geçici.
4. "Kodla".

## 5. Dal ve push durumu
- Dal: `claude/project-thread-wz4mbh`.
  - Bu thread hiç commit yapmadı. Yerel dal 28aeb82b'de, değişiklik yok (`git status` temiz).
  - Dal GitHub'da da yok; push edilecek bir şey yok.
- `LoadState.tsx` sahipliği: bu thread'de üzerinde bekleyen değişiklik yok; dosya main'deki haliyle duruyor.
- Bütün tasarım işi kod değil, paylaşılan klasördeki dosyalar. Repo'ya girmesi gerekmiyor.

## 6. İlgili dosyalar
- Önceki devir: `/mnt/project-files/pages/gorsel-kararlar/gelen/lineup/DEVIR-2026-10-14.md`.
- Plan: `/mnt/project-files/pages/gorsel-kararlar/gelen/lineup/PLAN.md`. Kararlar §3, telefon §4, açık sorular §11, yapım sırası §12.
- Masaüstü taslakları: `/mnt/project-files/pages/gorsel-kararlar/gelen/lineup/` (`kaynak/` + `build.py`).
- Telefon taslağı (Original): `/mnt/project-files/pages/gorsel-kararlar/gelen/lineup-telefon/index.html`. Add Staff notu `ADD-STAFF-TASARIM.md` aynı yerde.
- Yeni telefon tasarımları:
  - Sayfa: `/mnt/project-files/pages/gorsel-kararlar/gelen/lineup-satir/index.html`.
  - Önizleme: `onizleme.png`, yalnız ilk 3 tasarım. Edit düğmesinin görüntüsü: `edit-dugmesi.png`.
  - Kaynak: `kaynak/`.
- Kaynağın tam yedeği:
  - `/mnt/project-files/devir/threadler/lineup-kaynak/lineup-satir/`:
    - `kaynak/` içinde örnek varyant `ornek/v-x.*` var.
    - `yarim/v-d.*`: yarım kalan zaman çizelgesi tasarımı, sayfaya girmiyor.
  - Test betikleri `test-betikleri/` (Call off ve Publish denemesi).
- Telefon klavyesi araştırması: `/mnt/project-files/notes/mobil-klavye/ARASTIRMA.md`.
- Job ikonları: `/mnt/project-files/pages/gorsel-kararlar/gelen/job-ikonlari/`.

### Kaynak nasıl çalışır
`kaynak/README.md` sözleşmeyi anlatır. Kısaca:
- `core.js`: veri, eylemler, ortak pencereler.
- Her tasarım iki dosyadır: `v-<id>.js` ve `v-<id>.css`. 4 numaranın id'si `e`'dir.
- `python3 build.py`: `v-x` hariç bütün `v-*.js` dosyalarından `../index.html`'i kurar. Original'i `lineup-telefon/index.html`'den alır. İkonlar job ikon paketinin `svg/insan/` dosyalarından gelir.
- `node shot.mjs --v e --html ../index.html --out <klasör> --m day,published`: ekran görüntüsü alır. Playwright gerekir.
- Dosyalar başka klasöre kopyalanırsa `build.py`'nin başındaki yolları düzelt.

## 7. Artifact'lar (eski hesapta; yeni hesap bunları göremez)
- Telefon taslağı: https://claude.ai/artifact/HpPEjjYzgm6WPxrmJejGwG. Kaynağı `lineup-telefon/index.html`. Mert'in yorumu cevaplandı ve kapatıldı.
- Masaüstü taslakları: https://claude.ai/artifact/T4Heypx662YmYWSnG36yxW. Kaynağı `lineup/` (`build.py`).
- PAGES 3.4 Lineup: https://claude.ai/artifact/AJqKmK2HZcmwV8tooCtusz.
- Yeni telefon tasarımları Artifact olarak yayınlanmadı; yalnız dosya.

Yeni hesapta link gerekirse kaynaktan yeniden yayınlanır. Mert iki hesabın sayfalarını birbirinden göremez.

## 8. Yeni hesaba taşınması gereken bulgular ve kurallar
- Mert UI konusunda titiz. Varyant sayfasında "hangisi?" sorusu olmaz. Görsel düzeltmeyi hemen, kısa cevapla yap. Hız istediğinde test turlarını kısalt, kaliteyi düşürme.
- Ekran yazısı İngilizce (ABD). Müdür adı gibi çalışana bir şey anlatmayan isimler yazıya girmez (Mert, 14 Ekim).
- Telefonda iki dokunuşlu yıkıcı düğme (Call off): ilk dokunuşta yalnız düğme değişir, pencere yenilenmez.
- Yayın sonrası pencere kapanır, sayfa salt okunur olur, bildirim tek satırdır.
- Telefonda yazı kutuları 16 px; açılır listelerde seçenekler sola hizalı.
- Lineup'taki değişiklikler yalnız lineup'ta kalır, Schedule değişmez. Yalnız lokasyonlar arası taşıma iki Schedule'ı değiştirir (`PLAN.md` §3).
- Job ikonları satırda ismin solunda durur. Yalnız o işi yapan kişi ya da en çok kullandığı alet çizilir; sahne çizilmez.
- Teknik tuzaklar:
  - Mockup'ta `.app`'e `lang="en"` verilmeli. Türkçe dil ayarında büyük "i" "İ" çıkıyor.
  - `tokens.css` yorumlar silinmeden kopyalanmalı.
- Artifact günlük sınırı 200 yayındır (yeniden yayın da sayılır); yalnız içerik gerçekten değişince yayınla.

## 9. GÜVENLİ DEĞİL
Yok. Push'lanmamış kod yok; bütün tasarım işi `/mnt/project-files` altında.

## 10. Yeni hesaptaki thread için brief taslağı
```
İŞ: LINEUP — Lineup ekranının telefon tasarımını Mert'le bitirmek, sonra "kodla" gelince kodlamak.
Önce oku: /mnt/project-files/devir/threadler/lineup.md, sonra /mnt/project-files/pages/gorsel-kararlar/gelen/lineup/PLAN.md.
Şu an: dört telefon tasarımı /mnt/project-files/pages/gorsel-kararlar/gelen/lineup-satir/index.html'de. Mert'in seçimini ve rapor §3'teki açık sorularını bekle. Düzeltmeyi kaynak/ içinde yap, build.py ile kur, index.html'i aynı yere koy, Mert'e tek satırla bildir.
"Kodla" gelirse: PLAN.md §12 aşama 0'dan başla (kararlar KARARLAR.md'ye, sonra veritabanı; incelemeli iş, nf-guvenlik ONAY, canlı migration kuralları CLAUDE.md §5).
Sahiplik: Lineup ekranları ve apps/web/src/shell/LoadState.tsx.
Dokunma: giriş ekranları (bekletmede), Takas ekranları, PAGES 10.2.
Dal: güncel origin/main'den yeni claude/... dalı; PR yok, main'e yalnız tren.
```
