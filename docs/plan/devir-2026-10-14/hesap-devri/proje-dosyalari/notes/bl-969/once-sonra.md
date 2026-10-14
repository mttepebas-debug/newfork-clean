# BL-969: önce / sonra listesi

**Ne:** Ad, adres ve telefon için ABD kuralı (Türkçe harf yok; telefon yalnız +1 ve 10 hane) bugün yalnız ekranlarda var. BL-969 bu kuralı veritabanına da koyar, eski kayıtları bir kez düzeltir ve hesaptaki eski ikinci telefon kolonunu siler.

**Karşılaştırma:** dal `task/bl-969-kurtarma` @ `d6d73a6a` ile bugünkü main `cedf5982` (repo: https://github.com/mttepebas-debug/newfork-clean). Görev dosyası dalda: `docs/plan/tasks/BL-969.md`.

**Canlı veriye etkisi tek cümleyle:** canlıda yalnız 3 telefon kaydının yazılış biçimi değişir ("4155550100" → "+14155550100" gibi, numaranın kendisi aynı); silinen numara 0, değişen ad ya da adres 0.
Kaynak: bilgisayarındaki Claude'un bu sabah 05:28'de (Pacific) canlıda yaptığı salt okuma ölçümü. Uygulamadan hemen önce aynı ölçüm yeniden yapılır; sayı farklıysa durulur ve sana yazılır.

---

## 1. Veritabanı, birinci değişiklik: kural veritabanına girer

Dosya: `supabase/migrations/20261008111900_form_rules_hold_in_the_data.sql` (canlıya uygulanınca adı canlı kayıt sırasına göre yeniden verilir).

| # | Ne | Nerede (ekranda) | Önce | Sonra | Canlıdaki mevcut veri |
|---|---|---|---|---|---|
| 1 | Adlarda ve adreslerde ş, ğ, ı, İ yasağı (21 alan) | Settings → General (workspace adı) · Settings → Locations (ad, sokak, şehir, eyalet) · Settings → Jobs (departman ve iş adı) · Employees (ad, ikinci ad, soyad, tercih edilen ad) · çalışan kurulumu ve Account → Profile (yasal ad, tercih edilen ad, adres, acil kişi adı ve yakınlığı) · Account → Profile → Preferred name isteği | Ekran reddediyor, veritabanı kabul ediyor (doğrudan API çağrısı ya da kuraldan önceki kayıt girebilir) | Veritabanı da reddeder | Canlıda böyle kayıt 0. Hiçbir ad ya da adres değişmez |
| 2 | Eski kayıtlarda harf düzeltmesi | Aynı alanlar, silinmiş Locations / Jobs / Departments satırları dahil | — | Bulunursa bir kez ş→s, ğ→g, ı→i, İ→I | 0 satır |
| 3 | Çalışan telefonu ve acil kişi telefonu kuralı | Çalışan kurulumu → Profile adımı (Phone, Emergency phone) · Account → Profile → Emergency contact · Employees → kişi çekmecesi | Veritabanı 7–30 karakter herhangi bir metni kabul ediyor (yabancı numara dahil) | Yalnız "+1" ve 10 hane, ilk hane 2–9 | 3 değer +1'li biçime çevrilir, numara aynı kalır |
| 4 | Hesap telefonu kuralı | Account → Profile → Phone number | Veritabanı her ülkenin numarasını kabul ediyor ("+44…" dahil) | Yalnız ABD numarası | 0 değişiklik |
| 5 | Hesap telefonu tek kolona iner | Account → Profile → Phone number | Hesapta iki kolon var: eski "phone" ve yeni "phone_e164". Ekran ikisine de yazıyor, yenisi boşsa eskisini okuyor | Eski kolondaki ABD numarası yenisine taşınır. Yabancı numara silinir (kişi Account → Profile'da yeniden girer). Eski kolon, ikinci değişikliğe kadar yenisiyle aynı tutulur | Silinecek numara 0 ("account number cleared" = 0) |
| 6 | Hesap numarasını kaydeden veritabanı fonksiyonu | Çalışan kurulumunda "hesabımdaki numara" yolu | "+" ile başlayan her numarayı kabul ediyor; başında 0 olanı kırpıp +1 ekliyor | Ekranla aynı okuma; ABD numarası değilse reddeder | Fonksiyon değişir, veri değişmez |
| 7 | Güvenlik kilidi: "dur" kontrolü | — | — | Şu üç durumda migration hiçbir şeyi değiştirmeden sayıyla durur: (a) zorunlu telefonda ABD dışı numara, (b) hesap numarası değişince canlı bir çalışan kaydının farklı numarası silinecek ya da değişecek, (c) harf düzeltmesinden sonra iki ad aynı oluyor ("Aşçı" ve "Asci" gibi) | Üçü de 0 |

Değişmeyenler: telefon kaydeden iki servis (çalışan kurulumu, kendi acil kişisi) yeniden yazılmaz; ACIL-40001'in düzeltmesi (eski sekmeden kayıt) korunur. Yetki, RLS, grant değişmez; yeni servis yok.

## 2. Veritabanı, ikinci değişiklik: eski telefon kolonu silinir

Dosya: `supabase/migrations/20261008112000_the_account_keeps_one_phone.sql`.

| # | Ne | Nerede | Önce | Sonra | Canlıdaki mevcut veri |
|---|---|---|---|---|---|
| 8 | Hesaptaki eski "phone" kolonu silinir | Account → Profile → Phone number (görünüş değişmez) | İki kolon | Tek kolon ("phone_e164") | Silmeden hemen önce her hesapta iki kolon aynı mı diye bakar; tek hesap farklıysa hiçbir şeyi silmeden durur. Silmeden önce kolonun tamamı yedeklenir |

Bu adım ancak yeni web canlı sitede yayına çıktıktan sonra yapılır (eski web eski kolonu okuyor).

## 3. Ekranda görünen farklar (bugünkü main'e göre)

Hepsi aynı telefon alanında; bu alan 5 yerde kullanılıyor: Account → Profile (Phone number, Contact phone) · Çalışan kurulumu → Profile adımı (Phone, Emergency phone) · Employees → kişi çekmecesi → Emergency contact · Settings → Locations → lokasyon çekmecesi → Phone · Owner kurulumu → Locations adımı → Phone. Roller: owner, müdür, çalışan (kendi bilgisi).

| # | Ne yapınca | Önce (bugün) | Sonra |
|---|---|---|---|
| 9 | İngiltere numarasını tuş tuş yazmak: "+44 20 7946 0958" | "+" silinir, kalan rakamlar "(442) 079-4609" olur ve Save bunu **yanlış bir ABD numarası olarak kaydeder** | Alan yazılanı gösterir: "+44 20 7946 0958". Save kapalı kalır: "To save, fill in phone number." |
| 10 | Aynı numarayı yapıştırmak | Alan boş kalır | Alan yazılanı gösterir, Save kapalı kalır |
| 11 | Uygulamanın kendi biçimini yapıştırmak: "+1 (415) 555-0100" | Tarayıcı 14 karakterde keser: "(415) 555-0" (eksik numara) | Tam gelir: "(415) 555-0100" |
| 12 | Mac'ten ya da PDF'ten "Şişli" gibi ayrık yazılmış Türkçe harf yapıştırmak (ad ve adres alanları) | Ekran kuralı kaçırıyor | "Use English letters instead of ş, ğ, ı or İ." uyarısı çıkar |

Deneme sayfası (önce ve sonra yan yana, gerçek kodla): bkz. thread'deki bağlantı. Sayfa dosyası: `/mnt/project-files/pages/bl-969-telefon-alani.html`.

**Kodda kalkan ama canlıda kimsenin göremeyeceği farklar** (canlıda böyle kayıt yok):
- Çalışan kurulumu → Profile adımı: "Your account phone is not a US number. Change it in Account › Profile." uyarısı kalkar (veride artık yabancı hesap numarası olamaz).
- Settings → Jobs → iş çekmecesi: Save, iş adını her zaman denetler. Bugün kuraldan önce "Aşçı" diye kaydedilmiş bir iş, adı değiştirilmeden kişi atamasıyla kaydedilebiliyordu.
- Kayıtlı yabancı numara bugün "kaydedildiği gibi" gösteriliyor; bu yol silinir.

## 4. Uygulama sırası ve geri dönüş

1. Dal bugünkü main'e taşınır. Main bu sabahtan beri iki kez ilerledi (`8845a744` → `cedf5982`); çakışan tek dosya otomatik üretilen veritabanı şeması (`supabase/schema.sql`), yeniden üretilir. Testler yeniden koşar.
2. Canlıda salt okuma ölçümü (yukarıdaki sayılar), sonra yedek: etkilenen satırlar, hesap telefonlarının tamamı, silinecek 3 eski kuralın ve değişen fonksiyonun tanımı.
3. Birinci değişiklik canlıya, sonra doğrulama (24 kural yerinde, +1'siz telefon 0, Türkçe harf 0).
4. Tren ile main'e, sonra Vercel canlı site. **Vercel'in yayın kotası dolu:** canlı site 10 Ekim sabahı Pacific 04:00 civarında açılır. Bu yüzden 5. ve 6. adım yarın sabaha kalır.
5. Hesap telefonları yeniden yedeklenir; iki kolon her hesapta aynı mı bakılır.
6. İkinci değişiklik canlıya (eski kolon silinir), doğrulama.

Geri dönüş: bilgisayarındaki Claude'un hazırladığı geri alma betiği `C:\Users\TheWe\Documents\Codex\newfork-wt\coord\artifacts\bl-969-canli\geri-alma.sql`; ayrıca her adımdan önce alınan yedek. (Betiğin içini bu thread'den okumadım; bilgisayarındaki Claude uygulamadan önce gözden geçirir.)

## 5. Eksik ya da yanlış olabilecek

- Canlı sayılar bu sabahki ölçüm; gün içinde yeni kayıt girdiyse değişebilir. Ölçüm uygulamadan hemen önce yeniden yapılır.
- Ülke kodu olmadan yazılmış 10 haneli yabancı numara ABD numarasından ayırt edilemez; ölçümde alan kodlarına gözle bakılır.
- Bugün tuş tuş yazılmış yabancı numaralar (madde 9) zaten "yanlış ABD numarası" olarak kaydedilmiş olabilir. BL-969 bunları bulamaz, çünkü geçerli ABD numarası görünürler.
- Bir servisteki eski "en az 7 karakter" kontrolü kalıyor; zararsız, veritabanı kuralı daha sıkı.
- Birinci adımla 6. adım arasında (yarın sabaha kadar) eski web canlıda kalır; eski web numarayı iki kolona aynı yazdığı için sorun çıkarmaz.

## 6. Bence

Onayla. Canlıda silinen ya da değişen gerçek veri yok (yalnız 3 numaranın biçimi). Asıl kazanç madde 9: bugün yabancı bir numara sessizce yanlış bir ABD numarası olarak kaydediliyor; bu düzeltme ancak BL-969 ile main'e girer. Beklemenin tek artısı, Vercel kotası açılınca bütün adımları tek oturumda yapmak; ama birinci adım beklemeden de güvenli.
