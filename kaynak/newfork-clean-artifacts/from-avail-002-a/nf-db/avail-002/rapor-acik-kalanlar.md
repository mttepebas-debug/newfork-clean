# AVAIL-002-A — nf-db: rapor özeti + açık kalanlar (Mert'in isteğiyle yeniden)

**KARAR GEREKEN / SENİN ADIMIN:** `nf-guvenlik` incelemesini gönder (R3). A, B olmadan main'e girmez.

## 1. Nerede duruyor
A1 + A2 bitti. Dal `task/avail-002-a` (worktree `newfork-wt/avail-002-a`), commit'ler `9531ee10` (A1), `b8185352` (A2 yetki/keep-cancel/M3/bildirim), `9d8c767c` (A2 çok aralık + kayıpsız çeviri). Push yok. db.lock ve main.lock boş.
Tam rapor: posta kutusunda `done/20261004T151334-nf-db-avail-002-a-avail-002-a.md` (içerik değişmedi).

## 2. Ne yapıldı (kısaca)
- Müsaitlik her yazma yolunda yalnız uyarı; yönetici notu ayrı hatırlatma (turuncu değil, Auto-fill/Publish/cover'a girmez, yalnız notu okuyabilene görünür).
- Publish onay istemiyor; müsaitliğin "acknowledged/previously accepted" satırları silindi; kapalı gün gibi çakışmaların "retained" kaydı duruyor (S-B a).
- "Changed after publishing" ilk yayına göre; unpublish/republish sonucu değiştirmez.
- Kendi haftasını yalnız employee yazar (onboarding'deki dahil); dört servis yetki çekirdeğine soruyor; eski yardımcının çağıranı 11 → 10.
- Keep/cancel penceresi silindi; hafta kaydı bekleyen takas/cover/pickup'a dokunmaz.
- Bütün tipler işaretliyse gün "All day"; günde birden çok saat aralığı; tipten saate çeviri kayıpsız.
- "Check your availability" bütün employee'lere.

Kanıt: geri alınan denemede ci-green 163 dosyanın 161'i yeşil (kalan 2 `bl052_*` migration'sız da kırmızı, ortak DB kayması); ızgara ≤50 ms (17/17); ortak DB'de iz yok (391/1726/80); canlıda silinecek tablo/kolon boş (SELECT, ~15:40Z).

## 3. Açık kalanlar
1. **`nf-guvenlik` incelemesi (R3) — senin göndermen bekleniyor.** Bakılacak yerler: `app_private.authz_check` (`own` + `employee_target`), dört servis (`weekly_preferences_read/save_service`, `weekly_preference_settings_read/save_service`), `app_private.weekly_preference_may_write` / `weekly_preference_whole_days` (grant'lar `public, anon, authenticated`'tan alındı), tablo ve kolon silme (`weekly_preference_commitment_decisions`, `weekly_preference_events.decisions`).
2. **A tek başına main'e giremez (S-A a).** Haftalık kaydın biçimi (`range` → `ranges`), kaydetme cevabı (`{model}`), Publish bulgusu ve silinen iki uç bugünkü web ve API'yi kırar. B (nf-backend) bu daldan açılmalı; gereken değişiklik listesi tam raporun 5. bölümünde (8 madde).
3. **Tam kapı (lint / typecheck / test / build) A'da koşulmadı.** Değişen yalnız `supabase/**`. `pnpm test`'te `packages/shared` yetki ikizi testi B `authorization.ts`'i güncelleyip `dump:authz-matrix`'i yeniden üretene kadar kırmızı kalır. Tam kapı A+B birlikte, main'e almadan önce koşulmalı.
4. **Ultrareview önerisi (CLAUDE.md §5):** yetki çekirdeği + tablo silme var. Ücretsiz hak bittiyse yalnız dolar tutarıyla önerilmeli; Mert iki kez "iki inceleme yeter" dedi (ILKELER P06) — büyük olasılıkla gerekmez, karar senin.

## 4. Ekranda ne değişti
Hiçbir şey; görünür kısım B ve C ile gelir.

## 5. Sırada ne var
- `nf-guvenlik` → ONAY ya da bulgu (bulgu gelirse düzeltmeyi bu dalda ben yaparım).
- B (nf-backend) `task/avail-002-a`'dan açılır; A+B aynı main penceresinde, migration'lar ortak yerel DB'ye o pencerede kalıcı uygulanır.
- Yolda bulunan (dokunulmadı): yazma kapısının ret metni hâlâ "Resolve availability, shift hours or approved time off…" diyor; müsaitlik artık reddetmediği için yanıltıcı (B/C'de ekranda görünüyorsa düzeltilebilir).

## Senin yerine verdiğim kararlar
- Ayar okuma artık employee'ye kapalı (çekirdeğin `settings.availability.read` tanımı; kullanan ekran yok).
- Saatten tipe çeviride gece yarısını geçen tipin ertesi güne düşen kısmı da "değen" sayılır (ör. Pazartesi bütün gün işaretliyse Pazar 22–02 tipi işaretlenir).
- "İlk yayın" ölçüsü yayın görüntüsündeki `first` alanı; eski görüntüsü olmayan kayıt "değişmedi" sayılır (canlı veri yok).
- M3 kuralı çeviri sonucuna da uygulanır.
