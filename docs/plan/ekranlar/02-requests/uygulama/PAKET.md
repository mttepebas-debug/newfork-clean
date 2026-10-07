# EKRAN-02 veri paketi — A1A2 + A3 + AUTHZ-DUMP + A4 + BL-910, güncel main'de

- **Karar:** Paket gönderime hazır. `task/ekran-02-data` @`d32c12f3`, taban `origin/main` @`702f2b69`'dan sonraki uç (PARALEL-1 dahil); 17 commit.
- **İzin:** Gönderim S1 (ultrareview) cevabına bağlı. Canlı migration ve main için Mert'in "evet"i bu oturumun penceresine yazılmalı (CLAUDE.md §5.3; koordinatör 2026-10-07).
- **Risk:** 🔴 R3: yetki çekirdeği, takas yetkisi, izin kuralları ve okumalar, bildirim alıcıları. `nf-guvenlik` ONAY @`acfb0e9b`; içerik aynı, rebase sonrası uç `d32c12f3`. Düşük bulgu 1 ve 2 `d32c12f3`'te düzeltildi.
- **Soru:** Mert'e bir: müdür olan vardiya sahibi ret gerekçesini Requests'te görür (aşağıda). Koordinatöre bir: ACIL-40001 sırası (aşağıda).
- **Sonraki:** S1 + Mert "evet" → `main.lock` → yerel DB'ye kalıcı uygulama → Requests e2e → canlı (`apply_migration`, önce yedek) → push. Sonra C2 (H2 takas penceresi) bu paketin üstünde.

## Nerede duruyor
- Worktree `newfork-wt/ekran-02-pkg`, dal `task/ekran-02-data`.
- Paket `origin/main`'in üstüne kuruldu, ekran dalının (`task/ekran-02`) üstüne değil. Böylece Mert'in bakışını bekleyen ekran işinden bağımsız gidebilir. Paketin web koduna bağı yok; B1a zaten A1–A3'e bağlı olmayan kısım.
- Geçici dal `task/ekran-02-pkg` (paket ekran dalının üstünde) artık kullanılmıyor; silinebilir.

## Ne yapıldı
1. **Taşıma:** a1a2 → a3 → authz-dump → a4 commit'leri cherry-pick edildi.
   - Tek çatışma: main'in sildiği iki rol hafızası dosyası (`.claude/agent-memory/nf-db/*`). Dosyalar düşürüldü.
   - Rol hafızası commit'leri (`2ee14550`, `c0a5e701`) alınmadı.
   - Main'de paketin tabanından bu yana migration değişikliği yok; paketin yeniden yazdığı 32 fonksiyonla örtüşme 0.
   - Main'in son migration'ı `20261007130000`; paketinkiler `140000`–`170000` ve `200000`.
2. **`supabase/schema.sql`:** `pnpm db:schema` ile yeniden üretildi. `check-fast` 0.
3. **BL-910 (#108):** müdürün ret gerekçesi yalnız başvurana gider.
   - Kırmızı test önce (`71c3f9fe`). Paketin 4 migration'ıyla hücre 3, 4, 5 ve 7 not ok.
   - Düzeltme `20261007200000_rejection_reason_reaches_only_the_applicant.sql` (`7e5a3ab1`). 5 migration'la 8/8.
   - **Yolda bulunan ikinci sızıntı:** gerekçe yalnız bildirimde değil, takasın geçmişinde (`history[].message`) de sahibe görünüyordu. Bu yol hem Shift Hub'da hem Requests okumalarında vardı, ikisi de `app_private.shift_exchange_case_item` üzerinden. Bu da kapandı.
   - Vardiya sahibi ve başvuran dışındaki her alıcı genel cümleyi alır: "A request for your shift was declined. You are still responsible for this shift."
   - Lokasyonun taleplerini okuyan müdür gerekçeyi görür; `applications[].reason` ile aynı kural.
4. **İnceleme:** `nf-guvenlik` ONAY @`acfb0e9b`.
   - Düzeltildi (`d32c12f3`): yorum "who decides" yerine "who reads the location's requests" diyor. Requests (müdür görünümü) hücresi eklendi.
   - Açık kalan, soru: müdür olan vardiya sahibi (örnek: Emre Kadıköy'de shift manager) gerekçeyi Requests'te görür, Shift Hub'da görmez. Rolü gereği lokasyonun bütün gerekçelerini zaten okuyor. KARARLAR'da yok; Mert'e sorulacak.
   - Daha önce sızmış kayıtlar (`notification_inbox_items`, `public.notifications`) temizlenmiyor. İncelemenin hükmü: canlı kullanıcı yok (P01), canlıda veri silmek Mert onayı ister; gerekirse ayrı R3 iş.

## Kanıt
- **pgTAP (177 dosya):** her dosya paketin 5 migration'ı ve builder'la kendi geri alınan transaction'ında koştu (`artifacts/ekran-02/pkg/run-pgtap.mjs`). Önce `node scripts/test-db.mjs --load-only` (PARALEL-1). Log `newfork-wt/ekran-02-pkg-pgtap.log`, 2026-10-07 05:17–05:21 (yerel saat).
  - **172 ok.** Paketin kendi dosyaları dahil: `eligibility_matrix` 74, `shift_exchange_decided_one_rank_up` 35, `requests_closed_unified_read`, `shift_exchange_rejection_reason_stays_with_the_applicant` 8.
  - **5 kırmızı, hiçbiri paketin değil:**
    - `scheduling_settings_shift_types_rls` CI'ın bilinen kırmızılar listesinde (`ci-not-green.txt`).
    - `bl052_document_lifecycle`, `bl052_document_notifications`, `browser_privileges` (hücre 3) ve `document_types_rls` paket olmadan da aynı hatayla kırmızı (05:26). Ortak yerel DB'nin bugünkü durumu; koordinatöre bildirildi.
  - Neden `pnpm test:db` değil: paketin migration'ları kurala göre ortak DB'ye kalıcı yalnız main'e gönderimden hemen önce, `main.lock` penceresinde uygulanır (`supabase/CLAUDE.md`). PARALEL-1'in aracı dalın builder'ını dosyanın işlemine alıyor, uygulanmamış migration'ları almıyor; koşucu ikisini de alıyor.
- **Tam kapı** (`heavy.lock`, CI boşken, 05:21–05:23): lint 0 hata, typecheck, test (ui 9 · shared 212 · api 1012 · web 2225), build. Çıkış 0. Log `newfork-wt/ekran-02-pkg-gate.log`.
- **Requests e2e:** henüz koşulmadı. e2e ortak DB'yi okuyor; paketin migration'ları orada yok. Gönderim penceresinde (`main.lock`), kalıcı uygulamadan sonra ve push'tan önce koşulacak: `time-off-approval`, `shift-hub-swap`, `shift-hub-time-off`, `schedule-publish-approved-exchange`.

## Gönderimden önce bakılacak
- **ACIL-40001 (BL-958):** önce main'e girerse, paketteki `20261007160000_time_off_rules_and_reads.sql`'in 4 izin fonksiyonundaki 8 `40001` satırı `PT409`'a çevrilecek. Kalıcı çakışma için önce kırmızı test eklenecek. Paket önce girerse ACIL kendini `schema.sql`'den yeniden kurar. Bugün (05:30) main'de değil.
- **Canlı sıra:** önce yedek (`pg_get_functiondef` + silinen nesnelerin tanımı), sonra `apply_migration` (5 dosya, sırayla), md5/sürüm doğrulaması, `get_advisors`, bağımsız SELECT. Silen migration (A1'in eski yardımcıları, A3) main CI yeşil olunca gider.
- **DB-4 (EKRAN-01):** `task/ekran-01-db4` bu migration'ları içeriyor ve üstüne `20261007180000` koyuyor. Sahibi kendi dalını paket main'e girdikten sonra taşır.
