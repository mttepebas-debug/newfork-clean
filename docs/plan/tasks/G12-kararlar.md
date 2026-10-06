# G12 — yerel veritabanına dayanıklı pgTAP: işçinin kararları

İşçi oturumu (nf-test), dal `task/g12-pgtap-resilience` (taban `4490f8e3`), 2026-09-29.
Koordinatör: `local_54c1c741…`. Yalnız test; migration yok.

1. **BL-245 / BL-296 — kiralamadan önce başka workspace'lerin satırları park.** Kuyruk kiralaması
   bütün workspace'lerin en eski 100 satırını alıyor; yerelde 340 bekleyen satır vardı ve iki dosya
   kırmızıydı (notifications 2/23, account_inbox 5+). Test, rollback'li işlemi içinde başka
   workspace'lerin satırlarını pencereden çıkarıyor. Ürün fonksiyonu değişmedi (workspace'e göre
   kiralama migration isterdi). Önce kırmızı, sonra yeşil (08:11).
2. **BL-288 — denetim testi kendi satırını okuyor.** Her koşu kendi kaynak kimliğini üretir; üç
   hücre yalnız o satıra bakar. Ham kimliğin hiçbir satırda durmadığı hücresi tablo geneline
   genişletildi (daha sıkı, gevşek değil).
3. **BL-173 — sekiz dosyadaki tablo geneli sayımlar dosyanın kendi workspace'ine daraltıldı.**
4. **BL-253 — elle arşivleme silindi.** Yayın taslağı arşivlemez; hafta iki taslak listeler
   (yayınlanan + kaydedilen), ikisi de doğrulanıyor (plan 25 → 26).
5. **BL-217 / BL-209 — `time_off_published_assignment_disposition` kendi dünyasında.** Saat dilimi
   lokasyonun kendisinden; "ilgisiz vardiya" hücresi gerçek bir ilgisiz vardiyayla (beklenti
   korunuyor). **`shift_exchanges_v1` taşınmadı:** 20 farklı seed kimliği, sabit hafta
   (2030-01-07), seed lokasyon/iş/vardiya tipi; ayrı iş öneriliyor. BL-209'un o dosyadaki yarısı
   (yerel seed lokasyonunun saat dilimi) hâlâ kullanıcının onarım komutunu bekliyor.
6. **BL-369 — bütçe ölçümü yükte sakin anı arıyor.** 12 ardışık okuma yerine: en az 12, 50 ms'nin
   altında bir sıcak okuma gelene ya da 60 okuma bitene kadar; 15'ten sonra okumalar arası 50 ms.
   Bütçe (50 ms) aynı. Döngü değişkeni `who` → `reader` (sütun adıyla çakışma tuzağı).
7. **BL-344 — ölçüldü, kök neden bulunmadı.** Yerelde 10 koşuda 2 kırmızı (hücre 25, 08:13);
   teşhis satırlı kopyada 10'da 0. Projeksiyon (`document_sync_onboarding`) her dosyayı tek
   sürüme bağlı buldu; "UPDATE FROM çoklu eşleşme" açıklaması elendi. Beklenti gevşetilmedi.
8. **BL-105 — açık, kullanıcı onayı.** pgTAP'ı yerel veritabanına kalıcı kurmak CLAUDE.md §8
   "kalıcı kurulum"; yapılmadı.
9. **BL-248, BL-094 — ürün kararı.** BL-248: belgesi engelli owner artık ürünle kurulamıyor
   (devirde ve kayıtta owner muaf); test koruyucu olarak mı kalsın, silinsin mi? BL-094:
   `seed.sql:275` demo haftası "bu hafta"ya bağlı; ileri almak demo/e2e'yi etkiler.
10. **BL-368 — 14 dosya bir kez CI'da (dal CI 36588987982, 15:16–15:22 UTC, temiz DB).** 2 yeşil,
    yeşil listeye geçti: `employee_hub`, `time_off_partial_period_decisions`. 12 kırmızı, düşen
    hücreleriyle `ci-not-green.txt`'e geri döndü; yerel koşudaki (07:41) kırmızılarla aynı dosyalar,
    yani eski veri değil gerçek kırmızı. Her birine ayrı madde önerildi (rapor). Aynı koşuda
    değiştirilen 13 dosya yeşil; check ve e2e yeşil.
12. **Bekçi düzeltmesi.** "Kırmızı liste büyümesin" kuralı satır karşılaştırıyordu; bir nedenin
    metni değişince dosya "eklendi" sayılıyordu. Artık yollar karşılaştırılıyor (`comm`). Deneme:
    neden değişikliği 0; tabanda yeşil bir dosyayı kırmızıya taşımak iki hatayla 1.
11. **Süreç notu:** BL-245'in kırmızı ölçümü (07:4x) bir CI işi koşarken başladı; kontrol edildi,
    beklenmedi (kısa, iki dosya). Sonraki bütün koşular CI boşken.
