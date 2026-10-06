# Koordinatör devri — 2026-10-06 öğle (UTC ~10:20Z)

- **Oturum:** "Koordinatör" `local_9c7e674a-3796-486f-a7f7-613c4ce0c02e`. Mert bu pencerede `/compact` ya da `/clear` yazar; kimlik DEĞİŞMEZ. Bu sabah bir kez `/compact` yapıldı; bağlam yine doluyor.
- **Önce oku:** `CLAUDE.md` (§3 koordinatör işçi değil, §6 R0–R2 izinsiz gönderim, §10 5 satırlık rapor başı, §11.12 beş kural), `DELEGASYON.md`, `docs/plan/ILKELER.md`, `docs/plan/EKRAN-PLANI.md` ("Uygulama düzeni: hatlar", "Uygulama arşivi").

## 0. Yön ve kurallar
- **Koordinatör işçi değil (KK-159):** kod, ölçüm, test, kapı, ekran görüntüsü, alt ajan YOK. Oturumların ekran görüntülerine bakmak ve Mert'e göndermek serbest (SendUserFile).
- **Beş kural (KK-165):** netleştir, sorgula, önce kararlaş, en sade Türkçe rapor, gerçek bulgu.
- **Görsel soru dersi (2026-10-06):** Mert yazılı görsel soruları anlamadı. Her soruda önce nerede (ekran → sekme → düğme), kim bakıyor, ne oluyor (isimli örnek), bugün sorun ne; seçenek sonra. Soruyu kurmadan görüntüye kendin bak. Mert artık görsel seçimleri **artifact'ta 5 temiz varyant** olarak istiyor ("sleek, professional, minimalist, modern, temiz"); arayüz hattı yapar, koordinatör her varyanta yorum + kendi seçimini nedeniyle yazar.
- **Gönderim:** R0–R2 oturum izinsiz; R3 ve her canlı migration koordinatörün izniyle (riskli diff'i oku).
- **Docs gönderimi CI tetikliyor** (her push tam CI, yük): kayıtları yerelde topla, birkaç kararda bir gönder.
- **Kilit kimliği** "rol/oturum" biçiminde: `node scripts/lock.mjs take main "koordinator/<iş>"`; guard push'u kilit ALINMADAN önceki komutta reddeder → kilidi ayrı komutta al.
- **GateGuard** her yeni scratchpad dosyasında olgu ister (çağıran, API/şema etkisi, Mert'in sözü, geri dönüş); yazıp yeniden dene.

## 1. İlk işler (devralınca)
1. `node scripts/inbox.mjs claim`, arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000). Çıkınca oku, `ack`, yeniden başlat.
2. Bekçi döngüsü 2 saat sınırına takılıyor (araç: en uzun süreyle yeniden başlatma). Takılma kontrolünü her uyanışta elle yap: `node scripts/inbox.mjs board | grep -A1 '^TAKILDI' | paste - - | grep -v 53bf53b1`. 20 dk sessiz "working" oturum → `list_events`.
3. Kayıt worktree'si `../newfork-wt/coord` (`fetch` + `checkout --detach origin/main`); düzenleme scratchpad python betiğiyle.

## 2. Oturumlar ve hatlar (hepsi sabitli; Remote Control açık)
| Oturum | Kimlik | Şu an | Sırada |
|---|---|---|---|
| Veri hattı: nf-db (opus/high) | `local_c2ed4f3f-934a-48cd-82d9-1e99087b91cd` | ~10:10Z temizlendi; **EKRAN-01 DB-1c** (Undo sunucuda, R3, KK-171). Web hattının sözleşme önerisi iletildi (`done/20261006T100945-…-db-1c-sozlesme.md`). | EKRAN-02 A1 (devir notu + tazelik: `done/20261006T100247-…-var-uyg-db-2.md`) → A2 → A3 → DB-4 → BL-494; BL-759 DB-4 alanında |
| Web hattı: nf-backend (medium) | `local_c9810f32-30fd-4fe4-b343-1185c9a111ef` | **W-1b kalanı** (D-Y5, D-O6, D-O9, D-D3, KK-164, "Save draft Undo geçmişini temizler"); sıcak dosyalar (SchedulePage.tsx, styles.css) onda | Undo düğmesi bağlantısı (DB-1c main'e girince) → EKRAN-02 B1 → B2 |
| Arayüz hattı: nf-arayuz (medium) | `local_6cda4e74-9638-44d9-931c-9ce8c2e1fa3c` | **VAR-UYG-KIRMIZI:** main CI 37443040170'da `App.test.tsx` "gives the first mouse press inside the save recovery sheet to the sheet" bir kez düştü (sonraki koşu yeşil); yeni ilk-basış dinleyicisiyle yarış mı, yük mü | Mert'in seçimleriyle EKRAN-02 C dilimleri ve EKRAN-03 liste düzeni; telefon varyantları |
| Rol: nf-planlama (medium) | `local_47a5c079-bbdb-4533-a9d3-6fb7062efea7` | **MVP-RESEND** (`docs/plan/mvp/RESEND.md`: canlıda e-posta gönderen özellikler, Resend ücretsiz katman, Mert'in adımları) | EKRAN-03 görev dosyası (Restore dilimi `S1-restore.md` + S2–S5 + K1–K12, liste düzeni seçilince); BL-757 |
- Mert'in kendi oturumları: dokunma. İkinci veri oturumu açılmaz (bilgisayar darboğaz; bugün üç kırmızı yükten).

## 3. Mert'te bekleyenler
1. **Requests artifact** https://claude.ai/artifact/UvHbxipPcLVHmMW1ZVE4Xh — G2 yol/dinlenme uyarısının yeri (5 varyant) ve G3 sistemin yazdığı izin kısaltma satırı (5 varyant): birer numara.
2. **Liste sayfaları ortak masaüstü düzeni** https://claude.ai/artifact/R22hrq2pwAET22CKT6K1BE — 5 sistem. Koordinatörün önerisi: Sistem 1 (C: yeşil düğme arama satırının ucunda) + Sistem 2'den iki parça (Requests'te Time off / Shift changes iki parçalı düğme; tablonun altında "7 shown · Sorted by name"). Sistem 3 tabloyu kesiyor, 4'te arama kutusu kırık, 5'te boş "—" kutuları. Seçim mevcut ortak dilden farklıysa öteki sayfaların geçişi ayrı iş.
3. **Mobil konuşması** (Mert: "mobili az sonra konuşacağız"): Employees telefon listesi 5 varyant https://claude.ai/artifact/CQx4kkeVq1CJF3zGchvkXC (bölüm 2).
4. Requests turu 2'den sorulmayanlar: **C-D11** (tek lokasyonlu haftada Pazar görünmüyor; görüntü `artifacts/nf-arayuz/VAR-EKRAN-12/01-schedule/C-D11/`), **G4** teyit (Shift changes, Time off'un denetimini alır; `02-requests/G4/`), **BL-445** dar pencere üst çubuğu için Mert'in "başka fikri".
5. **Resend anahtarı:** planlama sayfası gelince Mert'e (dolar, adımlar; değer sohbete yazılmaz).
6. Hatırlatmalar BL-686, BL-687: "kalsın, bir daha hatırlat" (sonraki temizlik turu).

## 4. Bugün main'e ve canlıya girenler (öğleden önce)
- "!" işi (VAR-UYG, `924cb773`) + Edit bayrağı (VAR-UYG-DB/-2, canlı `20261007110000`); canlı kanal lokasyon başına (DB-2 + API, canlı); şablon Replace kuralı (DB-3, canlı); BE-2b API (haftalık e-postada kısmi teslim).
- Kararlar: KK-168…KK-171; KARARLAR Schedule ("!" kuralları, çok vardiyalı hücre, K18 satırı), Employees (S1–S5, K1–K12, K5/K11 Mert'in değişiklikleri, Restore uç durumları, "Kadikoy +1"), Requests (G1 B, S7 B).

## 5. Dersler
- Kırmızı main üç kez yükten; docs push'ları da CI yükü. Kayıtları topla.
- Arayüz hattı varyant dalında sunucu açık bırakmasın; işi bitince PID ile kapatsın.
- Yerel test dünyasında e2e koşularından kalan çok sayıda "Corner…/Covered…" kişi birikiyor (yalnız görüntü kirliliği).
