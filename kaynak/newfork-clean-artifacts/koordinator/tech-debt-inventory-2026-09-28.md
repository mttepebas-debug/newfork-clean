# Teknik borç envanteri (oturum "Ultrareview repo taraması", local_88691168, 2026-09-28)
Ölçüm: main 4d4d48af. Öncelik = (etki + risk) × (6 − efor). Kullanıcıya "backlog'a yazılsın mı" soruldu, CEVAPSIZ; backlog'a işlenmedi (koordinatör 2026-09-28 kontrolü: CORS/hız sınırı maddesi BACKLOG'da yok).

| # | Borç | E/R/Ef | Öncelik | Backlog |
|---|---|---|---|---|
| 1 | 15 pgTAP dosyası CI kontrol listesinin (ci-green.txt) dışında | 3/5/2 | 32 | yeni (BL-281 ile örtüşebilir) |
| 2 | API hız sınırı ve CORS doğrulanmadı (Vercel'de karşılanıyor olabilir) | 1/4/1 | 25 | yeni |
| 3 | API yetki kontrolünden sonra tabloları service role ile okuyor | 2/4/2 | 24 | yeni |
| 4 | Rota içi yetki kapıları: Settings, Availability, Onboarding, Schedule Requests | 3/4/3 | 21 | BL-223 (yalnız Settings) |
| 5 | Hata yardımcısı 9 kopya, hatayı mesaj metnine bakarak sınıflıyor | 4/3/3 | 21 | BL-134, hata planı P1 |
| 6 | 15 küçük paket güncellemesi; 1 orta açık (exceljs > uuid) | 1/2/1 | 15 | yeni (DEBT-001 notu) |
| 7 | 7 API rota dosyası ve 9 servisin testi yok (ör. schedule-requests) | 2/3/3 | 15 | yeni |
| 8 | App.test.tsx'te 25 sn bekleme > 20 sn test sınırı | 1/2/1 | 15 | BL-120 |
| 9 | Web'de 23 dosyada permissions.includes | 3/3/4 | 12 | BL-176 (eksik kapsamlı) |
| 10 | 8 akışın e2e'si yok: izin talebi, duyurular, belgeler, davet, roller, bildirimler, hesap silme, sahiplik devri | 2/4/4 | 12 | yeni |
| 11 | Excel dışa aktarma iki yerde (web export-v2, API schedule-export) — doğrulanmadı | 3/3/4 | 12 | kısmen BL-254 |
| 12 | Ham hex ~20 CSS dosyasında; Availability kendi renk seti | 2/1/3 | 9 | BL-169/194/215 |
| 13 | Dev dosyalar: SchedulePage 3.507, çalışan çekmecesi 3.052, App.test.tsx 5.405 satır | 4/2/5 | 6 | yeni |
| 14 | _base/_vN/_legacy fonksiyonlarının kaldırma planı yok | 1/1/3 | 6 | yeni |

Önerilen aşamalar: 1) 1, 2, 6, 8 (nf-test + koordinatör, ~yarım gün); 2) 5 → 4, 3 (nf-backend, nf-guvenlik; ultrareview); 3) 7, 9, 10, 12 dokunulan yerde; 4) 11, 13, 14 bekler.
Not: aynı gün yapılan tüm repo kod denetimi BL-266..282 olarak işlendi (722ce0e8); bu envanterle çakışmalar tazelikte ayrılmalı.
