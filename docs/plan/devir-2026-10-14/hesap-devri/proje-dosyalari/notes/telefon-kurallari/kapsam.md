# Telefon kuralları: kapsam önerisi (Mert, 2026-10-09 22:00Z isteği)

Durum: **öneri, Mert'in onayını bekliyor.** Kod yazılmadı.
Deneme sayfası: https://claude.ai/artifact/LPMFzbYr4Yd2fdPSDWSiio · kaynak `/mnt/project-files/pages/telefon-kurallari.html`

## İş 1: Yazarken maske (normal sınıf)

- **Hedef:** bütün telefon alanlarında "+1" aynı kutunun başında sabit; ayraçlar hane yazıldıkça gelir, silindikçe aynı yerde gider.
- **Nerede:** tek ortak parça (`apps/web/src/shell/UsPhoneInput.tsx`, `packages/shared/src/us-forms.ts`); 5 ekran: Account → Profile (Phone number, Contact phone) · çalışan kurulumu → Profile ve Emergency contact · Employees → kişi çekmecesi → Emergency contact · Settings → Locations → çekmece → Phone · owner kurulumu → Locations → Phone.
- **Bitti ölçütü:**
  - Seçilen biçimde her hane sayısı için alanın gösterdiği metin birim testinde (0–10 hane).
  - Backspace yalnız ayracı silerse önündeki hane de gider (yoksa maske ayracı geri koyar, alan "takılır").
  - "+1 (415) 555-0100" ve "415.555.0100" yapıştırması doğru biçimde gelir.
  - Bir akış testi (Playwright): Account → Profile'da tuş tuş yaz ve sil.
  - KARARLAR §1.3 "Telefon" satırı yeni zamanlamayla güncellenir.

## İş 2: Kurulumda numara başkasında mı (incelemeli sınıf)

- **Hedef:** davetle katılan kişi kurulumda kendi numarasını tamamlayınca (10 hane) aynı workspace'te başka bir kayıtta aynı numara varsa alan kırmızı, altında "This number is already used by someone in this workspace."
- **Varsayılanlarım (aksini söylersen değişir):**
  - "Başka birisi" = aynı workspace'te aktif ya da davetli çalışan kayıtları; işten çıkarılmış ve arşivli kayıtlar sayılmaz; kişinin kendi kaydı sayılmaz.
  - Hata kimin numarası olduğunu söylemez.
  - Aynı kontrol kayıt anında sunucuda da yapılır (yalnız ekranda olursa API'den geçer). Bu yeni bir sunucu fonksiyonu: yetki matrisi, güvenlik incelemesi.
  - Hesabında numara zaten varsa alan bugün salt okunur geliyor; o numara çakışırsa hata "Change it in Account › Profile." ile biter.
- **Açık nokta (backlog'a):** aynı kural Account → Profile'da ve müdürün Employees çekmecesinde de olsun mu; veritabanı benzersizlik kısıtı (canlıda çakışan numara sayısı ölçüldükten sonra).

## İş 3: Acil kişi kendi numaram olamaz (incelemeli sınıf, İş 2 ile aynı dal)

- **Hedef:** acil kişi numarası kişinin kendi numarasıyla aynıysa alan kırmızı, altında "Enter someone else's number, not your own."; bir hane silinince hata hemen kalkar. Acil kişi workspace'teki başkalarının numarasıyla karşılaştırılmaz.
- **Nerede:** çalışan kurulumu → Emergency contact · Account → Profile → Emergency contact · Employees çekmecesi (owner kendi kaydı).
- **Sunucu:** kayıtta aynı kural (veritabanı kuralı: acil telefon ≠ kişinin telefonu), canlıda bozan kayıt sayısı ölçüldükten sonra.

## Üçü için ortak

- Hata, alanın altındaki yardım satırının yerine çıkar; satır her zaman ayrılmıştır, alan yerinden oynamaz. Masaüstü 1440 ve telefon 390 görüntüsüyle kanıt.
- Hepsi BL-969'un dokunduğu dosyalarda: BL-969 main'e girdikten sonra onun üstüne kurulur.
- KARARLAR'a üç yeni satır (Mert, 2026-10-09).
