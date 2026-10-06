# Koordinatör devri — 2026-10-06 gece planı (UTC ~13:25Z; Mert uyuyor)

- **Oturum:** "Koordinatör" `local_9c7e674a-3796-486f-a7f7-613c4ce0c02e`. Mert bu pencerede `/compact` ya da `/clear` yazar; kimlik DEĞİŞMEZ. Bugün bir kez `/compact` yapıldı; gece kendiliğinden sıkışabilir — bu dosya sırayı taşır.
- **Önce oku:** `CLAUDE.md` (§3 koordinatör işçi değil, §6 R0–R2 izinsiz gönderim, §10 5 satırlık rapor başı, §11.12 beş kural), `DELEGASYON.md`, `docs/plan/ILKELER.md`, `docs/plan/EKRAN-PLANI.md` ("Uygulama düzeni: hatlar", "Uygulama arşivi").

## 0. GECE KURALI (Mert, 2026-10-06 ~13:05–13:20Z; KK-175)
- **Sıra:** "sessionları yöneterek sayfalama inceleme işini bitir sonra da backloglara dön". Önce ekran dilimleri (sayfa sayfa plan), sonra backlog.
- **Ekran değişiklikleri sabahı bekler:** ekranda görünen bir şeyi değiştiren iş main'e GİRMEZ — dalında hazır, tam kapı yeşil, öncesi/sonrası görüntüleri `artifacts/<rol>/<iş>/`, raporda "sabah onayına hazır". Veri, API, CI, test işleri normal kuralla main'e ve canlıya gider (R3 koordinatör izniyle, canlı migration yedekli).
- **Köklü değişiklik yok:** "design, kural, davranış, mantık, kod calışma prensibi gibi değişiklikleri gerekmedikçe yapma … ben yokken köklü değişiklik yapma." Dilim içinde KARARLAR'da olmayan karar gerekirse uygulanmaz, sabah sorusu olur.
- **Backlog:** "sadece backlogda olanların tazeliklerini kontrol et. hala geçerliyse backlogları azaltmaya çalış". Kapsam Schedule + Requests + Employees maddeleri. Planlama tazeliği ölçer (bayat → kanıtla kapanır), geçerliyi "salt hata düzeltmesi" / "karar ister" diye ayırır; hatlar sıraları bitince "salt hata düzeltmesi"ni alır (görünürse dalda).
- **Sabah raporu (Mert uyanınca ilk mesaj):** ne bitti, ne canlıda, sabah onayını bekleyen dallar + görüntüleri (SendUserFile), backlog'dan kapananlar ve nedeni, sorular (tek tur, §13 şablonu).

- **PC yeniden başladı (~13:40Z, aşırı yük) → TEK AĞIR İŞ (Mert ~13:50Z; KK-176):** runner 2 ve 3 durduruldu, CI tek runner'da sırayla (~25 dk); yerel ağır iş (tam test, e2e, test:db, build) yalnız `db.lock` ile ve `gh run list` boşken. Hatlar 13:55Z'de bu kuralla yeniden başlatıldı; dört sabitli oturumda Remote Control açık. CI-DOCS (docs push'u CI koşturmasın) arayüz hattında; REMOTE-CI araştırması planlamada (sabah Mert'e).

## 1. Yön ve kurallar
- **Koordinatör işçi değil (KK-159):** kod, ölçüm, test, kapı, ekran görüntüsü, alt ajan YOK. Oturumların görüntülerine bakmak ve Mert'e göndermek serbest.
- **Beş kural (KK-165)**; **görsel soru dersi:** önce nerede / kim / ne oluyor / sorun ne; görüntüye kendin bak; Mert'in seçtiğini yeniden onaya sunma (OBSERVATIONS 2026-10-06, iki kez).
- **Gönderim:** R0–R2 oturum izinsiz; R3 ve her canlı migration koordinatörün izniyle (riskli diff'i oku).
- **Docs gönderimi CI tetikliyor** ve koşan CI'ı iptal edebilir: kayıtları topla, CI bitince gönder.
- **Kilit:** `node scripts/lock.mjs take main "koordinator/<iş>"` ayrı komutta, sonra push, sonra release.
- **GateGuard** her yeni scratchpad dosyasında olgu ister; yazıp yeniden dene.
- **Kırmızı main:** bugün 5 e2e kırmızısı, hepsi yük (VAR-E2E-GIRIS, VAR-E2E-2). Önce ayır (kod mu, yük mü), yalnız düşen işi yeniden koşturt; aynı test tekrar düşerse sınıflandırma görevi. E2E-YUK (`29e504d5`: e2e `needs: [check, db]` + flow 7 `test.slow()`) girdi; ilk koşusu 37467116856.

## 2. İlk işler (devralınca)
1. `node scripts/inbox.mjs claim`, arka planda `node scripts/inbox.mjs wait 7000` (timeout 7200000). Her çıkışta çıktıyı VE `ls .newfork-inbox/new/`'i oku (ack'lenmemiş eski rapor = işlenmemiş; 2026-10-06'da üç rapor böyle kaçtı), `ack`, yeniden başlat.
2. Her uyanışta takılma: `node scripts/inbox.mjs board | grep -A1 '^TAKILDI' | paste - - | grep -v 53bf53b1`; 20 dk sessiz "working" → `list_events`.
3. Kayıt worktree'si `../newfork-wt/coord` (`fetch` + `checkout --detach origin/main`); düzenleme scratchpad python betiğiyle.

## 3. Hatlar (hepsi sabitli, Remote Control açık) ve gece sırası (KK-174, KK-175)
| Oturum | Kimlik | Gece sırası |
|---|---|---|
| Veri: nf-db (opus/high) | `local_c2ed4f3f-934a-48cd-82d9-1e99087b91cd` | Undo geri yükleme sınırı (`20261007130000`, ONAY @21387bce, R2) main + canlı → **devir notu, "temizlenebilir" raporu → koordinatör `clear_session` + A1 mesajı + bir tur sonra Remote Control aç** → EKRAN-02 A1 → A2 → A3 → A4 (R3: koordinatör gönder izni) → EKRAN-03 A1 → A4 (Q1, Q2 cevaplı) → backlog salt hata (nf-db) |
| Web: nf-backend (medium) | `local_c9810f32-30fd-4fe4-b343-1185c9a111ef` | EKRAN-02 B1a (ekran → dal, push yok) → BE-2b-O1 (e-posta bir kez yeniden deneme, R2, gider) → B1b (A1–A3 sonra; ekran kısmı dal) → B2 → B3 → backlog salt hata (nf-backend) |
| Arayüz: nf-arayuz (medium) | `local_6cda4e74-9638-44d9-931c-9ce8c2e1fa3c` | E2E-YUK (girdi) → EKRAN-02 C3 sayfalama → C1 tek tablo → C2 inceleme (üçü dal + görüntü) → backlog salt hata (nf-arayuz; görünürse dal) |
| Planlama: nf-planlama (medium) | `local_47a5c079-bbdb-4533-a9d3-6fb7062efea7` | GECE-2 EKRAN-01 kapanış ölçümü → BACKLOG-TAZELIK-RE (Schedule + Requests + Employees) → GECE-3 EKRAN-04 Availability keşfi |
- Mert'in kendi oturumları: dokunma. İkinci veri oturumu açılmaz (bilgisayar darboğaz). Aynı anda en çok iki ağır iş.

## 4. Mert'te bekleyenler (sabah)
1. Sabah onayı: gece dallarda bekleyen ekran işleri (B1a, C3, C1, C2, görünür backlog düzeltmeleri) — görüntüler.
2. **Requests uyarı varyantları** https://claude.ai/artifact/UvHbxipPcLVHmMW1ZVE4Xh — G2 yol/dinlenme uyarısının yeri, G3 izin kısaltma satırı: birer numara.
3. **Telefon tasarımı:** Mert 2026-10-06 ~11:50Z soruyu kapattı ("bekle"); Employees telefon listesi https://claude.ai/artifact/CQx4kkeVq1CJF3zGchvkXC Sistem 1'den önce; önerilen yol Sistem 1'in telefon hâli, 5 varyant.
4. **Resend:** canlıda e-posta yok; adımlar Mert'e iletildi (12:35Z, `docs/plan/mvp/RESEND.md` §3). Mert "tamam" deyince bir oturum canlıda test daveti + parola sıfırlama doğrular.
5. Sorulmayanlar: C-D11 (tek lokasyonda Pazar görünmüyor), BL-445 "başka fikri"; planlamanın "karar ister" listesi; EKRAN-04 soruları.
6. Hatırlatmalar BL-686, BL-687.

## 5. Bugün main'e ve canlıya girenler
- Sabah: "!" işi, Edit bayrağı, canlı kanal lokasyon başına (DB-2), şablon Replace kuralı (DB-3), BE-2b API.
- Öğleden sonra: VAR-UYG-KIRMIZI (`88f5e7a1`, kökü kodda), LIST-YESIL (`529d6e98`, üç sayfada yeşil ekleme düğmesi), DB-1c Undo sunucuda (`ec38901d`, canlı `20261007120000`), BL-763 e2e kurulum (`bce5765a`), Undo düğmesi bağlantısı (`48de63c5`), E2E-YUK (`29e504d5`). Canlı web/API = main (CANLI-ESIT-WEB), canlı DB = main 436/436 (CANLI-ESIT-DB).
- Kararlar: KK-172…KK-175; KARARLAR liste ortak dili (yeşil ekleme düğmesi, sayfalama 25/50/100 varsayılan 50, bütün liste sayfaları — her sayfa kendi ekran turunda), Requests tek tablo, Employees Q1 (bekleyen izin sessizce geri çekilir), Schedule haftalık e-posta bir kez yeniden dener; BL-761…BL-788.

## 6. Dersler
- Okunmamış rapor kalmasın (yukarıda §2.1).
- Mert'in seçtiği şeyi yeniden onaya sunma; soru yalnız yeni karar için.
- Arayüz hattı sunucu açık bırakmasın; PID ile kapatsın.
