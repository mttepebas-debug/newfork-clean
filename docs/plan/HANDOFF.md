# Koordinatör devri — 2026-10-06 sabah (UTC)

- **Devreden ve devralan aynı oturum:** "Koordinatör" `local_9c7e674a-3796-486f-a7f7-613c4ce0c02e`. Mert bu pencerede `/clear` yazar; oturum kimliği DEĞİŞMEZ. Bağlam ~%69, iş sınırında devir. Bu oturumun harcaması ~$50+ (oturumun maliyet uyarısı).
- **Önce oku:** `CLAUDE.md` (2026-10-06'da çok değişti: §3 koordinatör işçi değil, §6 R0–R2 izinsiz gönderim, §10 5 satırlık rapor başı, §11.12 Mert'le çalışmanın beş kuralı), `DELEGASYON.md` (baştan yazıldı), `docs/plan/ILKELER.md`, `docs/plan/EKRAN-PLANI.md` ("Uygulama düzeni: hatlar" ve "Uygulama arşivi ve damıtma").

## 0. Yön ve kurallar (bugün değişenler)
- **Koordinatör işçi değil (KK-159):** kod, ölçüm, test, kapı, ekran görüntüsü, alt ajan YOK. Her iş oturuma. Koordinatör: plan, kayıt, dağıtım, denetim (rapor okuma, commit main'de mi, CI yeşil mi, R3'te riskli diff'i okuma), Mert'le tek muhatap.
- **Mert'le beş kural (KK-165, CLAUDE.md §11.12):** netleştir, sorgula (roast istiyor), önce kararlaş, en sade Türkçe rapor (öncesi/sonrası, 🟢🟠🔴, uygulamadaki yer, ekran görüntüsü — oturumlardan, SendUserFile ile —, kopyalanabilir yol), gösteriş değil gerçek bulgu. Küçük işte tek satır + yap.
- **Gönderim (KK-165 B):** R0–R2 oturum ONAY + kapı + Done when tamamsa izinsiz gönderir; R3 ve her canlı migration koordinatörün izniyle (riskli diff'i oku). Canlı/gizli işlemde Mert'in "evet"i işi yapan oturumun KENDİ penceresine yazılır.
- **Posta kutusu:** oturumlar dürtme göndermez (gelen dürtmeler eski; cevap yazma). Rapor başı 5 satır: Karar · İzin · Risk · Soru · Sonraki.
- **Arşiv (KK-163):** her dilim `docs/plan/ekranlar/<no>/uygulama/<dilim>.md`'yi kendi commit'ine ekler; ekran kapanınca koordinatör "Sonrası için"leri rol hafızasına / KARARLAR'a damıtır.
- **Soru turu (KK-165 D):** hattı durduran soru hemen; diğerleri birikir, üçü geçince ya da Mert "soru turu" deyince.

## 1. İlk işler (devralınca)
1. `node scripts/inbox.mjs claim` (çıplak komut), arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000). Çıkınca raporu oku, `ack`, yeniden başlat.
2. Bekçi (Mert'in kuralı: 2 dk; 20 dk sessiz "working" oturum bizzat kontrol): arka planda board döngüsü, kendi claim kimliğini (claim çıktısındaki session_id) hariç tut: `while true; do s=$(node scripts/inbox.mjs board | grep -A1 '^TAKILDI' | paste - - | grep -v <KENDI_ID>); [ -n "$s" ] && { echo "$s"; exit 0; }; sleep 120; done`. Ölü oturumun artık heartbeat'i `.newfork-inbox/status-stale/`'e taşınır (silinmez). Panonun "ne iş" sütunu herkese aynı metni gösteriyor (BL-755) — durumu dal adından oku.
3. `git -C ../newfork-wt/coord fetch origin` + `checkout --detach origin/main`; kayıt yazımı orada. Uzun metinleri bash heredoc'la değil, scratchpad'e yazılan python betiğiyle düzenle (heredoc'ta tırnak kırıldı).

## 2. Oturumlar ve hatlar (hepsi Remote Control açık, sabitli)
| Oturum | Kimlik | Rol | Şu an | Sırada |
|---|---|---|---|---|
| Veri hattı: nf-db | `local_c2ed4f3f-934a-48cd-82d9-1e99087b91cd` | nf-db, high | DB-1b (R3, izinli) + BE-2b-DB (R2) gönderiyor; DB-1b canlı migration izni verildi (yeşil main sonrası) | DB-2 → DB-3 → EKRAN-02 A1 → A2 → A3 → DB-4 → DB-1c; BL-494 (BE-1 raporundan) |
| Web hattı: nf-backend | `local_c9810f32-30fd-4fe4-b343-1185c9a111ef` | nf-backend, medium | TEL-KAPALI-2 gönderimi | W-1b (DB-1b + DB-2 main'de olunca; DB-1a / DB-1b sözleşme değişiklikleri raporlarında) → BE-2b API kısmı (BE-2b-DB'den sonra, dal `task/ekran-01-be-2b`) → EKRAN-02 B1 → B2 |
| Arayüz hattı: nf-arayuz | `local_6cda4e74-9638-44d9-931c-9ce8c2e1fa3c` | nf-arayuz, medium | Müsaitlik "!" tıklanır pencere canlı varyantı (Mert bekliyor); varyant sunucusu 5612/5613, başlangıç `http://127.0.0.1:5612/var.html` | Mert onaylayınca: VAR.md belge commit'i, hücre modeli + "!" uygulama dilimi (W-4 içinde), BL-441 metni; Requests görsel dilimleri (C1–C3) bağımlılıklarla |
| Rol: nf-planlama (Kayıt ve plan) | `local_47a5c079-bbdb-4533-a9d3-6fb7062efea7` | nf-planlama / gerekince nf-test, medium | boşta (CI-HIZ ve CI-HIZ-2 bitti, main'de) | EKRAN-03 Employees görev dosyası + BL numaraları (Mert'in kararlarından sonra); BL-757 |
- Mert'in kendi oturumları ("Dev server başlat", "Handoff gelecek"): dokunma.
- Ağır iş kuralı sık çiğneniyor (üç hat + CI tek bilgisayarda; bugün üç kırmızı yükten geldi). İkinci veri oturumu AÇILMAZ; asıl darboğaz bilgisayar.

## 3. Mert'e açık sorular / turlar
1. **Canlı inceleme (devirden önce başladı):** `var.html` — yeni müsaitlik/izin hücre modeli (KARARLAR Schedule), "!" tıklanır pencere, Availability kapalı hâli, Publish metni. Mert "canlıda görüp karar vermek istiyorum" dedi. Giriş adımları arayüz hattının raporunda (parola dosya yolu: `e2e/global-setup.ts:21`; sohbete yazılmaz).
2. **BL-445 dar pencere üst çubuğu:** Mert "başka fikrim var" dedi, fikrini henüz yazmadı.
3. **Requests görsel turu 2:** C-D11 (tek lokasyonda Pazar görünmüyor), S7 (kenar rengi, Schedule üst çubuğu da), G1, G2, G3, G4 (teyit). Görüntüler `artifacts/nf-arayuz/VAR-EKRAN-12/02-requests/`, `01-schedule/C-D11/`.
4. **Employees (EKRAN-03):** OZET'te S1–S5 + G1–G3; K1–K12 koordinatör önerilerini önce koordinatör okur, kurala uyanları verir.
5. **MVP hazırlığı:** canlı Resend anahtarı (BL-101 / BL-027; haftalık e-posta canlıda 503). Hatırlatmalar BL-686, BL-687.
- Artifact "Müsaitlik Ünlemi" (https://claude.ai/artifact/SjqsJmBYQZ9LeyeydQr2Ba): yorum dizisi `f9c00308-…` açık; canlı varyant gösterilince çöz (resolve).

## 4. Bugün main'e girenler (özet; ayrıntı KK-159…KK-167, EKRAN-PLANI ilerleme)
- Kurallar: `3055ecf1`, `05680324`, `3419de3f`; kararlar `7cd5ada8`, `4246d02a` ve bu devir.
- Kod: EKRAN-02 A0 (talep kaybı; canlıda), EKRAN-01 DB-1a (başka lokasyonun taslağı; canlıda), W-1a, BE-1, BE-2, DRAG-API, DRAG-UI, TEL-KAPALI, CI-HIZ, CI-HIZ-2. Canlı: `app_api_url` düzeltildi (bildirim kuyruğu çalışıyor).

## 5. Dersler (bu devir)
- **Dürtme mesajları** boş tur yediriyordu (4 kopya/saat) → kaldırıldı.
- **Main CI koşuları birbirini iptal edip kırmızıyı gizliyordu** → CI-HIZ düzeltti; yine de "yeşil koşu"yu commit'i İÇEREN koşudan oku.
- **Artifact yorum otomatik cevabı** "üzerinde çalışıyorum, sayfa güncellenecek" diye koordinatörün yapmayacağı iş için söz verdi → düzeltme yorumu yazıldı; otomatik cevaplara güvenme, işin nerede yapıldığını yorumda söyle.
- **Yazılı kural koddan sapmış olabilir:** M2 "yazar" diyordu, kod ve Mert "yazamaz" — Mert'e soru kurmadan önce ölçtür.
