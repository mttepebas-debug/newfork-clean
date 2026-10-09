# DEVIR — BILDIRIM (oturum/bildirim)

Yazıldı: 2026-10-08 ~22:35Z. Yalnız okuma yapıldı; kod, test, push, canlı DB işlemi yok.

## 1. Kimlik

- **Oturum:** "oturum/bildirim". Claude Code oturumu, başlangıç klasörü `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\hopeful-darwin-d59182` (dal `claude/hopeful-darwin-d59182`, kullanılmadı, temiz).
- **Asıl worktree:** `C:\Users\TheWe\Documents\Codex\newfork-wt\bildirim`, dal `task/bildirim`, son sha `ba8ccc75`. Temiz (`git status` boş).
- **Uzakta mı:** `task/bildirim` dalı uzağa itilmedi. Commit'ler doğrudan main'e gönderildi.
- **Main'e girdi mi:** evet. `e49ec3e3` (ilk teslim) ve `ba8ccc75` (daraltılmış kapsam) `origin/main`'de. Bugünkü `origin/main`: `9f287986`. BILDIRIM dosyaları `ba8ccc75`'ten beri değişmedi.

## 2. Hedef ve dayandığı dosya

- **Hedef:** bildirim sistemini (motor, kurallar, arayüz) sıfırdan kurmak. Eski sistem değerlendirilmez, ilk dilimde sökülür.
- **Kaynaklar:**
  - Mert'in isteği: KK-203, kapsam daraltma ~09:25Z, 2026-10-07 ("bugünkü bildirimi araştırmasın incelemesin bile, istersen direk söksün atsın").
  - Kabul kaydı: KK-210, `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\KOORDINATOR-KARARLARI.md`.
- **Plan:** `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\tasks\BILDIRIM.md`
- **Söküm listesi + olay envanteri:** `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\research\BILDIRIM-INCELEME.md`

## 3. Biten (aşama 1)

- **Söküm listesi, her nesnenin çağıranıyla:** 18 tablo, 50 fonksiyon, 3 tetikleyici, 1 zamanlayıcı, 10 API yolu, 21 düzenlenecek domain fonksiyonu, SİL / DÜZENLE dosyaları ve `retired_objects_stay_gone` listesi. Kaynak: `pg_proc.prosrc` ve kod `grep`.
- **Sökerken korunacak 5 iş (K1–K5):**
  - K1 belge kısıtlaması, K2 takas süresi dolumu: bildirim işçisinin içinde çalışıyor.
  - K3 takas geçmişi, K4 hesap güvenliği denetimi: bildirim fonksiyonlarının içinde yazılıyor.
  - K5 Workspace belge işleri.
- **Ayrı e-posta yolları** (davet, parola, haftalık program, hesap silme) bildirim koduna bağlı değil.
- **Olay envanteri:** 162 olay. Her biri için tetikleyen, etkilenen ve karar veren (P07).
- **Plan:**
  - Model, veri ve yetki, API, arayüz, test.
  - Dilimler B0–B8. İlk dilim B1 söküm; söküm ile yeni sistem arasındaki boşluk kabul edildi.
  - Rakipler, 6 soru.
- **Artifact:** bildirim merkezi A/B/C, telefon A/B/C, ayar A/B/C.
- **Koordinatör kayıtları:** KK-210 (aşama 1 kabul, 5 teknik karar onaylı), SABAH-SORULAR G8 ve G9, BACKLOG BL-954…957, BL-910.

## 4. Açık kalan (sıradaki adım)

1. Mert'in G8 (6 soru) ve G9 (varyant) cevapları. Hepsi açık; KARARLAR'da bildirimle ilgili 2026-10-08 kararı yok.
2. **B1 söküm artık başlayabilir.** EKRAN-02 veri paketi main'de: `7c7b5513` (BL-910 düzeltmesi dahil) ve `26942d2d`, 2026-10-08 ~12:20Z.
   - Önce söküm listesini bugünkü main'de `pg_proc` ile yeniden ölçmek gerekiyor: paket `shift_exchange_emit_notification_base`, `notify_*` ve `time_off_*` fonksiyonlarını yeniden yazdı, eskileri kendi son migration'ında emekliye ayırdı (`78077080`). `exchange_decision_reason` main'de var.
   - BL-965 (`19c2f3ec`, `c22e89ea`) bildirim işçisindeki belge bakımı adımına dokundu. Bu, K1'in taşınacağı yer.
3. B1 için önce görev mesajı ve `nf-guvenlik` ile R3 akışı (plan §8).

## 5. Karar bekleyen (Mert'le önce sohbette, P18)

Sorular tam metniyle planın §10'unda: `C:\Users\TheWe\Documents\Codex\newfork-clean\docs\plan\tasks\BILDIRIM.md`. Her biri "bugün → isimli örnek → seçenekler" biçiminde; önerilen seçenek ilk sırada.

1. **Kanal.** Önerilen: uygulama içi + kısa listede e-posta (Resend ücretsiz, $0). Öteki seçenekler: yalnız uygulama içi / her bildirime e-posta / web push.
2. **Ayar kimde.** Önerilen: workspace ayarı yok, kişisel ayar yalnız e-posta (ayar varyantı A). Öteki seçenekler: salt okunur kurallar sayfası (B) / 3 workspace anahtarı (C) / bugünkü gibi.
3. **Owner/admin hangi karar bildirimlerini alır.** Önerilen: önce lokasyon müdürü, müdür yoksa admin/owner; Mert'in iki istisnası (tercih edilen ad, müsaitlik) kalır. Öteki seçenekler: istisnasız aynı kural / karar verebilen herkes alır, biri karar verince herkesin satırı kapanır.
4. **Karar verilince öteki kutulardaki bildirim.** Önerilen: satır herkeste kendiliğinden kapanır, sonuç aynı satıra yazılır. Öteki seçenekler: satır kutudan kalkar + ayrı bilgi bildirimi / bugünkü gibi.
5. **Program yayınında kime.** Önerilen: otomatik, yalnız vardiyası değişen kişiye, değişikliği yazan tek satır; "Notify" adımı kalkar. Öteki seçenekler: otomatik + "herkese bildir" / bugünkü gibi yayınlayan seçer.
6. **Cover ve açık vardiya duyurusu.** Önerilen: uygun kişilere günde tek satır (dayanak yok, yeni karar). Öteki seçenekler: bildirim yok / her isteğe ayrı bildirim.

**İki görsel seçim (G9):**
- Bildirim merkezi: A tablo (DOC-TABLE kararı) / B iki şerit / C panel.
- Ayar sayfası: A sayfa yok / B salt okunur / C üç anahtar.
- Telefon görünümleri: A / B / C.

**KK-210 varsayılanları** (Mert'in itiraz hakkıyla G8'de): sessiz saat ve özet MVP'de yok; saklama 90 gün (hesap güvenliği 1 yıl); eski bildirim verisi taşınmaz.

## 6. İnceleme bekleyen artifact ve dosyalar

- **Varyant sayfası, hesap 1 (mt.tepebas, `Artifact list` ile doğrulandı):** https://claude.ai/artifact/M8yVRt1fWEY8Sg24ze8Wmv. Sürüm 2; "Bugün" ekran görüntüleri sekmesi çıkarıldı.
  - Hesap 2'de bağlantı yok: `pages.json`'da yalnız `hesap1` var.
  - Hesap 2'de gerekiyorsa aynı dosyadan yeniden yayınlanmalı.
- **Sayfa dosyası:** `C:\Users\TheWe\Documents\Codex\newfork-pages\bildirim-varyantlari.html`. Yayındaki sürüm 2 ile aynı içerik; dosyanın başında yayın iskeleti var. Kaydı `C:\Users\TheWe\Documents\Codex\newfork-pages\pages.json`'da.
- **Kaynak kopyalar** (iskeletsiz, aynı içerik):
  - `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\BILDIRIM\bildirim-varyantlari.html`
  - `C:\Users\TheWe\AppData\Local\Temp\claude\C--Users-TheWe-Documents-Codex-newfork-clean--claude-worktrees-hopeful-darwin-d59182\8ce4e7ad-6d53-43a1-83ea-b47574b287b9\scratchpad\art\bildirim-varyantlari.html`
- **Ekran görüntüleri:** `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\BILDIRIM\` (gitignore'da; 77 dosya).
  - Varyant ön izlemeleri: `look-ca.png`, `look-cb.png`, `look-cc.png`, `look-ph.png`, `look-sa.png`, `look-sb.png`, `look-sc.png`, `look-mobile.png`.
  - Eski ekranların dört rol, 1440 ve 390 görüntüleri: `owner-*`, `admin-*`, `manager-*`, `employee-*` ve `owner-tall-app_settings_notifications-1440.png`. Kapsam daraldığı için artık kullanılmıyor; silinebilir.

## 7. Veritabanı durumu

- Yerel DB'ye yazılmadı; yalnız SELECT yapıldı. Canlıya dokunulmadı.
- Bu oturumda alınmış kilit yok. `db.lock`, `main.lock` ve `heavy.lock` 2026-10-08 ~22:35Z'de boş.

## 8. Bilinmesi gereken, kayıtta olmayan

- **KK-210 ile plan çelişiyor.** KK-210 "paket tek seferde" diyor. Planın son hâli (`ba8ccc75`, §8, koordinatör daraltmasıyla) ise "B1 söküm ilk dilim, sonra dilimler sırayla main'e; aradaki bildirimsiz dönem kabul" diyor. KK-210 ilk teslime (`e49ec3e3`) göre yazılmış. Yeni koordinatör kaydı düzeltmeli ya da sormalı.
- **SABAH-SORULAR G8 özetinde artık geçersiz bir cümle var.** "29 kart / 267 kontrolün yalnız Enabled'ı bir şeyi değiştiriyor" cümlesi, Mert'in "değerlendirme yok" kararından önceki teslimden kalma. Mert'e soru sunulurken bu cümle kullanılmamalı.
- **K1 ve K2 sessiz kırılma riski.** `documents_maintain_service` ve `shift_exchanges_maintain_service` yalnız bildirim işçisinden çalışıyor (`apps\api\src\notifications\notification-outbox-worker.ts`). İşçi silinmeden önce bu iki iş yeni bir bakım zamanlayıcısına taşınmalı. Aksi hâlde süresi geçen belge kişiyi kısıtlamaz, süresi dolan takas açık kalır.
- **Yerelde bildirim kutusu boş görünür.** `notification-outbox` zamanlayıcısı yerelde hiçbir yere istek atmıyor (Vault'ta `app_api_url` / `cron_secret` yok). Bu bir hata değil; yeni sistem senkron yazacağı için konu kalkıyor.
- **Hesap.** Varyant sayfası hesap 1'de (mt.tepebas): 2026-10-08'de `Artifact list` ile doğrulandı ("mine"). Hesap 2 için bağlantı yok. Gerekirse `C:\Users\TheWe\Documents\Codex\newfork-pages\bildirim-varyantlari.html` hesap 2'den yayınlanır ve `pages.json`'a `hesap2` olarak yazılır.
- **`test.admin@meyhouse.test` sihirli bağlantıyla oturum açamıyor (BL-957).** Admin görüntüsü için e2e dünyası `World e2e1790265977849`'un admin'i (Zeynep) kullanıldı. Parola `C:\Users\TheWe\Documents\Codex\newfork-clean\e2e\.world.json` dosyasında.

## 9. Temizlik

- Bu oturum dev sunucusu başlatmadı. Açık Playwright / Chromium süreci yok (2026-10-07'de ölçüldü). Durdurulacak PID yok.
- Worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\bildirim` temiz ve commit'leri main'de; silinebilir.
  - İçinde gitignore'daki bu not var: `artifacts\devir\DEVIR-BILDIRIM.md`.
  - Dal `task/bildirim` yerelde; içeriği main'de. Silmeden önce `git cherry -v origin/main task/bildirim` ile ölçülmeli.
- Kullanılmayan başlangıç worktree'si: `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\hopeful-darwin-d59182` (temiz).
- Scratchpad'deki ara dosyalar (`notes-*.md`, `rapor-*.md`, `callers*.sql`, `shots.mjs`, `login*.mjs`) geçici; kayıtta gerekmez.

## 10. Bağlam ve devam önerisi

- **Bağlam:** yaklaşık %40 (tahmin; ölçülemedi).
- **Öneri:**
  1. Mert'le önce G8'in 6 sorusunu sohbette konuş, sonra G9 varyantını seçtir.
  2. Cevaplar KARARLAR'a işlenince KK-210'u "dilim dilim" diye düzelt.
  3. B1 sökümü taze bir oturuma ver. Görev mesajına şunları yaz:
     - (a) söküm listesini bugünkü main'de `pg_proc` ile yeniden ölç (EKRAN-02 paketi fonksiyonları yeniden yazdı);
     - (b) K1–K5'i önce taşı, sonra sil;
     - (c) R3, `nf-guvenlik`, `test:db`, canlı migration yedekli ve "gönder" izniyle.
