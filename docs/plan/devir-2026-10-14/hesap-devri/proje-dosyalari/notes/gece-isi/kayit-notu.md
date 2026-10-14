# Kayıt notu: Code oturumlarından gelen, defterde olmayan kararlar (2026-10-09 gece)

Yazan: gece thread'i ("/oto"). Bu dosya yalnız öneri: kayıt dosyalarına (KARARLAR, BACKLOG, SORULAR) bunları kayıt işini yapan thread yazar (koordinatörün yönlendirmesiyle, `coord/kayit` ya da trenle). Satır numaraları main `d68aa958`.

## A. KARARLAR.md'ye eklenecek

1. **Takas penceresi düğmeleri 34 px (H2'deki hâl).** Mert 2026-10-07 23:47Z "H2 deki daha estetik" (oturum 555-b989cf58; `notes/ekran-02-swap-oturum-ozeti.md` #36). Reddedilen: 36 px, izin çekmecesiyle eş. Kodda `task/ekran-02-c2r` `swap-review.css:217` (min-height 34px); şu an yalnız c2r dalındaki C2.md'de. Yeri: KARARLAR:497 (H2) maddesinin sonuna ek. Sayfa: https://claude.ai/artifact/PYbKyq7WaoWmZ7yRoCzT22 (✅ Done).
2. **Settings → General: altı tasarımın (A–F) hiçbiri seçilmedi.** Mert 2026-10-07 09:13Z "hiçbirisini begenmedim. bu sessionı durdur şimdilik" (`notes/oturum-ozetleri/ekran-10-general.md:26`). Yeni yön bekliyor; açık sorular SORULAR G1–G3 ve DURUM B6/B8. Sayfa: https://claude.ai/artifact/Kwz63F5JeddW5S7y2kSsAi (yalnız Original kaldı).
3. **Giriş ve katılım: 14 "Değiştir" seçimi** (Mert 2026-10-07 10:13–10:19Z; sayfanın kendi `decisions` kaydında). `docs/plan/ekranlar/16-giris-katilim/OZET.md` §9 boş. S-118 (2026-10-09 04:19Z) gereği giriş ekranı e-posta servisine kadar bekliyor; seçimler kaybolmasın diye deftere "kararlı, B1 bekliyor" olarak yazılmalı. Satır listesi sayfada: https://claude.ai/artifact/PEYuSjGWXGN9dkb9LipikY (9 satır "B1 bekliyor", 5 satır modelden bağımsız: E16-10, E16-09, E16-20, E16-L-welcome-metin, E16-01).
4. **Employees telefon listesi: kişi başına kart (varyant 1), satırda lokasyon · iş.** Mert 2026-10-07 08:08Z (oturum 558-290d7bd1). KARARLAR:381'de var; eksik olan SORULAR tarafı (aşağıda C1).
5. **H2 "On time off / chose to work" kutusu geçersiz.** KARARLAR:497 bu hâli "final" sayıyor; KARARLAR:196 (Mert 2026-10-09 05:57Z: onaylı izinle 1 dakika çakışan vardiya alınamaz) onu geçersiz kılıyor. :497'deki hâl kaldırılmalı ya da "yerini aldı 2026-10-09, :196" diye işaretlenmeli. Sunucu tarafı BL-995 (riskli, ayrı iş).

## B. BACKLOG.md

1. **BL-178 kapanışı:** GA-2 ile kapandı (koordinatör hafızası; kayıt işi kapatma satırını GA-2'nin main sha'sıyla yazsın).
2. **BL-965 kapanışı:** kapanış kanıtı kayıt işinde ölçülmeli (`BACKLOG.md:1015` "kırmızısı ürün kodunda (BL-965)"); ölçülmeden kapatılmasın.
3. **BL-595:** bu gece yapıldı, `claude/project-thread-rei7pj@8cf1ffe3` (trenle main'e girince kapanır).
4. **BL-334:** `@36721018` (aynı dal). **BL-257** (Requests durum rozeti token'ları, `task/arayuz-salt-hata@a54e56aa`) EKRAN-02 alanında olduğu için taşınmadı; EKRAN-02 kurtarması bitince ayrı küçük iş.
5. **Yeni madde önerisi:** Important Dates "History" sekmesi `task/fb-6.7-ui`'da duruyor, main'de yok; çekmece A + L1 ile birlikte yeniden kurulmalı (EKRAN-08).
6. **Yeni madde önerisi:** FB-6.7 tasarım sayfasındaki demo adlar Türkçe (KadıköyMüdür1, Ayşe…), Important Dates demosu da; ABD demo dünyasına çevirmek (düşük öncelik).
7. **Yeni madde önerisi:** Design tuvali https://claude.ai/artifact/4AGPsoDPMS4gS9M2rup6sZ eskidi (Account satırı 9 tahta, Owner kurulumu 4 tahta silinebilir; s3/s5 notları KARARLAR:257-258 ile çelişiyor). Bu gece dokunulmadı: `docs/design-canvas.md` onu tasarım kaynağı sayıyor, silme Mert'e sorulmalı. Ayrıntı `sayfa-bildirim-giris.md`.

## C. SORULAR.md

1. **SORULAR.md:272 (Soru-22, ilk satır, Employees telefon listesi) bayat:** Mert 2026-10-07 08:08Z kartı seçti. Satır kapatılmalı.
2. **Jobs (Settings → Jobs) açık soruları S1–S5** SORULAR'a girmeli: S1 düz Jobs listesi, S2 başlıktan sıralama, S3 grup katlama / Collapse all, S4 Archived sekmesinin içeriği, S5 New department'ın yeri + Departments satır düzeni (DURUM B9, B10). Kaynak `notes/oturum-ozetleri/ekran-10-jobs.md`; sayfa https://claude.ai/artifact/BUJShpW3rXDGFVNyEygDZr (◐ yarı).
3. **Republish Acknowledgements:** Unpublish düğmesinin yeri (EKRAN-07 S1) açık; sayfa https://claude.ai/artifact/6YJ3MmXnmAJMY7JYGboWj6.
4. **Müsaitlik S5-B:** takasta yerini H2 aldı; cover / open shift onayında S5-B sürüyor mu, kayıtta açık değil.

## D. Koda girmemiş, kararı verilmiş işler (koordinatörün iş sırası için)

Bu gece koda girenler: EKRAN-01 ızgara seçimleri 1, 3, 4, 15, 16 (`@06ceba62`), FB-6.7 Announcements Archive iki tık + "Acknowledge again" + Conflict handling metinleri (`@433caf4a`), BL-334 (`@36721018`), BL-595 (`@8cf1ffe3`).

Hâlâ kod bekleyen ve kararı tam olanlar (Mert'e soru gerekmez):
- Settings → Locations A (Mert 2026-10-07 "a", "Tamam"): https://claude.ai/artifact/Lru9WAg6HaSbdErLyMhU26
- Important Dates çekmecesi A + L1 (Mert 2026-10-07 "L1 ONAY"): https://claude.ai/artifact/Pt7K2NVLwFx6TPS9ZuXNKX; yeni tablo gerekiyor (DB, bilgisayar thread'i)
- Employees telefon kartı (BL-599): https://claude.ai/artifact/GVmBUJTwTrJqyMxwYn3Uvk; c1a kurtarmasına bağlı (EKRAN-02 kurtarma dalı)
- Onboarding Documents karma akış (BL-825, önce BL-560): https://claude.ai/artifact/8g3ojM6qy3diHECSHjZvkS
- Müsaitlik S4-E (Shift Hub "emin misin?" penceresi): lab `task/avail-design@8066c66a`; takas kabulü EKRAN-02 alanına değdiği için kurtarmadan sonra
- Duyuru K19–K28 / Republish (EKRAN-07; Unpublish yeri hariç)

Yarı kararlı (önce Mert): Jobs V1 + S1–S5; Requests G3 (Soru-4); bildirim sistemi G8/G9; giriş B1.

## E. Riskli, buluttan yapılmadı (bilgisayar thread'i)
- **BL-969** `backup/task/bl-969@d3e8e6ad`: main ile ortak tabanı yok; veri düzelten ve eski telefon kolonunu silen iki migration (riskli, canlı veri). Güncel main'e yeniden kurulmalı, test:db, nf-guvenlik ONAY, koordinatörün "gönder"i; gerçek veri silinirse Mert'in "evet"i.
- **DB-4** (`archive/ekran-01-db4@f5282ef2`): main'deki guard fonksiyonu 20261008110559 ile değişti; CREATE OR REPLACE, riskli; test:db şart.
