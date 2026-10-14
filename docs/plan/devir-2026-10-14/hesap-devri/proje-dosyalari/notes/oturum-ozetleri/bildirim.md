# BILDIRIM: bildirim sistemi, oturum özeti

**Özet**
- Mert bildirim motorunu, çalışma mantığını ve arayüzünü sıfırdan kurdurmak istedi ("bu en önemli işlerden 1 tanesi"). Ardından eski sistemi incelemeyi bile istemedi ("istersen direk söksün atsın").
- Aşama 1 bitti ve main'de (`e49ec3e3`, `ba8ccc75`): söküm listesi, 162 olaylık envanter, B0–B8 planı, 6 temel soru ve görsel varyantlar. Kod yazılmadı. Eski sistem hâlâ main'de ve canlıda.
- Mert'in 6 temel model sorusu (G8) ve varyant seçimi (G9) 2026-10-07'den beri cevapsız. İlk dilim olan B1 söküm hiç başlamadı.
- Kayıtta iki tutarsızlık var:
  - KK-210 "paket tek seferde" diyor; plan "dilim dilim" diyor.
  - `SORULAR.md` G8'in özetinde Mert'in "değerlendirme yok" kararından önce yazılmış, artık geçersiz bir cümle duruyor ("29 kart / 267 kontrol…").
- Eski Settings → Notifications sayfası 2026-10-09'da bile yamandı (BL-1011, `a8d545d3`). Bu, "sökülecek" denen ekrana harcanan emek.

## Okunan oturumlar
- **`session_012MbYSirVoJSuqq44FPM5GG` (istenen oturum):** yalnız 2026-10-08 22:27–22:29Z arası var, devir notunun yazılması. Okundu; Mert mesajı yok.
- **`session_01C5q48MsU43uZny5b5tPQoB` (aynı başlıklı eski oturum, 2026-10-07 08:30–09:40Z):** baştan sona okundu. Mert bu oturuma doğrudan yazmadı; iki isteğini koordinatör aktardı.
- **Repo (main `d68aa958`):**
  - devir notu `docs/plan/devir-2026-10-08/BILDIRIM.md`
  - `docs/plan/tasks/BILDIRIM.md`, `docs/plan/research/BILDIRIM-INCELEME.md`
  - `SORULAR.md` G8 / G9, KARARLAR, BACKLOG
  - `supabase/schema.sql`
  - `backup/tasarim-kaynaklari`

## Mert'in istekleri (sırayla, saatler UTC, olay saati)

| # | Zaman | Mert'in sözü | Ne yapıldı | Durum |
|---|---|---|---|---|
| 1 | 2026-10-07 08:30:19 (koordinatörün görev mesajında, Mert'in sözü olarak) | "http://localhost:5555/app/settings/notifications sayfasını çok detaylı ve derinlemesine incelesin. uygulamanın bildirim motoru, bildirim çalışma mantıgı, bildirim ui'ı sıfırdan inşa edilecek. uygulamanın hertarafındaki notification üretme potansiyeli olan şeyler hesaplanacak saptanacak. notificationın dokundugu bütün kod bu plana dahil edilecek. bu en önemli işlerden 1 tanesi" | İnceleme ve plan main'e girdi (`e49ec3e3`, 09:26Z): ayar sayfası incelemesi, motor haritası, ekran görüntüleri. Artifact v1 yayınlandı. | Plan kayıtta. İnceleme kısmı sonra belgeden çıkarıldı; yalnız git geçmişinde duruyor. |
| 2 | 09:28:05 (koordinatör aktardı; Mert'in sözü ~09:25Z) | "bana sorarsan bugünkü bildirimi araştırmasın incelemesin bile, istersen direk söksün atsın." | Kapsam daraldı; main `ba8ccc75` (09:37Z). İçeriği tablonun altında. | Yalnız kayıtta ve Artifact'ta; kod yok |

**`ba8ccc75`'in içeriği (2. satır):**
- Söküm listesi, her nesnenin onu çağıranla birlikte: 18 tablo, 50 fonksiyon, 3 tetikleyici, 1 zamanlayıcı, 10 API yolu, düzenlenecek 21 fonksiyon.
- Sökerken korunacak 5 iş (K1–K5).
- 162 olaylık envanter.
- Plan: dilimler B0–B8.
- 6 temel soru.
- Artifact v2; "Bugün" sekmesi çıkarıldı.
- Backlog'a giren yan bulgular: BL-954…957.

## Repo doğrulaması (main `d68aa958`)
- Plan ve envanter main'de: `docs/plan/tasks/BILDIRIM.md` ve `docs/plan/research/BILDIRIM-INCELEME.md`.
- **Eski sistem main'de duruyor.** `supabase/schema.sql`'de şu tablolar var: `notification_outbox`, `notification_catalog`, `notification_user_preferences`, `account_notification_items`, `notification_delivery_attempts`, `notification_endpoints`, `notification_consents`, `notification_audit_log`. Söküm migration'ı yok.
- KARARLAR'da bildirimle ilgili, 2026-10-07'den sonra verilmiş karar yok; G8 ve G9 cevapsız.
- `task/bildirim` uzağa itilmedi; içeriği main'de.
- **Yedek:** `backup/tasarim-kaynaklari`@`dee23faf`. Dosyalar: `kaynak/newfork-pages/bildirim-varyantlari.html` ve `kaynak/newfork-clean-artifacts/BILDIRIM/`.

## Linkler ve Mert'in seçimleri
- **Varyant sayfası (Hesap 1, v2):** https://claude.ai/artifact/M8yVRt1fWEY8Sg24ze8Wmv
  - Bildirim merkezi: A tablo / B iki şerit / C panel.
  - Ayar sayfası: A sayfa yok / B salt okunur / C üç anahtar.
  - Telefon: A / B / C.
  - **Mert'in seçimi: henüz yok.** Hesap 2'de kopyası yok.

## Mert'e açık sorular
**G8: temel model, önce sohbette konuşulur.** Tam metinler planın §10'unda. Her sorunun önerisi:
1. **Kanal:** uygulama içi, artı kısa bir listede e-posta (Resend, ücretsiz).
2. **Ayar kimde:** workspace ayarı yok; kişisel ayar yalnız e-posta için.
3. **Owner / admin hangi karar bildirimlerini alır:** önce lokasyon müdürü, müdür yoksa admin / owner. Mert'in iki istisnası kalır: tercih edilen ad ve müsaitlik.
4. **Karar verilince öteki kutulardaki bildirim:** satır herkeste kapanır, sonuç aynı satıra yazılır.
5. **Program yayınında kime:** otomatik, yalnız vardiyası değişen kişiye. "Notify" adımı kalkar.
6. **Cover ve açık vardiya duyurusu:** uygun kişilere günde tek satır. Dayanağı yok, yeni karar.

**G9:** merkez A/B/C, ayar A/B/C, telefon A/B/C.

**KK-210 varsayılanları (Mert itiraz ederse değişir):** sessiz saat ve günlük özet MVP'de yok; bildirimler 90 gün saklanır (hesap güvenliği 1 yıl); eski bildirim verisi taşınmaz.

**Bağlantılı:** Important Dates'teki "Remove" (yayınlanmış vardiyanın kaldırılması) çalışana bildirim üretmeli; bu olay envantere eklenmeli (EKRAN-08).

## Neden main'e ve canlıya çıkmadı
- Aşama 1 bilerek yalnız plandı. Kod G8 ve G9'un cevabını bekliyor; bunlar temel model kararı olduğu için Mert'in.
- B1 söküm, EKRAN-02 veri paketini bekliyordu. Paket 2026-10-08 ~12:20Z'de main'e girdi, ama söküm görevi açılmadı.
- B1'den önce iki şey yapılmalı:
  - Söküm listesi bugünkü main'de `pg_proc` ile yeniden ölçülmeli. EKRAN-02 paketi `notify_*` ve `time_off_*` fonksiyonlarını yeniden yazdı.
  - K1 (belge süresi geçen kişinin kısıtlanması) ve K2 (süresi dolan takasın kapanması) bildirim işçisinden ayrı bir zamanlayıcıya taşınmalı. Taşınmazsa sökümle birlikte sessizce dururlar.
