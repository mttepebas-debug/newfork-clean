# EKRAN-01 DRAG — sürükleme rengi ölçümü — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | DRAG — ölçüm (kod yok) | `nf-arayuz` / arayüz hattı | R1 (ölçüm R0) | yok (yalnız ölçüm) | 2026-10-06 |

## Sonrası için
- Tuzak: API `/schedule/reference` cevabında `settings` yalnız `time_format` taşıyor (`apps/api/src/schedule/schedule-service.ts:510-515`); veritabanının `conflict_rules`'u düşüyor ve web her bırakmayı amber sayıyor.
- Ölçüm: bugün dört sürüklemede (taşı, kopyala, açık vardiya, preset) boş hücre amber, izinli gün amber; kurallar gelince yeşil / kırmızı — karar (2026-10-06) ile uyumlu.
- Kalıp: bırakma rengi `block` → kırmızı, `warn` ve `confirm` → amber (`useScheduleGridDragControllers.ts:31-36`); kapalı gün rengi K17 ayarını izler.
- Karar adayı: API düzeltmesi (R2, `nf-backend`) DRAG'dan önce; DRAG'a yalnız token ve test kalır.

## Rapor

- **Karar:** ölçüm; kod yok.
- **İzin:** gerekmiyor.
- **Risk:** 🟠 sürüklemede hiç yeşil yok, izinli gün kırmızı değil amber (API hatası).
- **Soru:** koordinatöre: API düzeltmesi `nf-backend`'e, DRAG'dan önce mi.
- **Sonraki:** düzeltme main'e girince DRAG (token + vitest).

## 4. DRAG ölçümü (Görev 2) — kod yok, "başla" bekleniyor
**Yöntem:** bırakma rengini üreten iki fonksiyon (`evaluateScheduleShiftDropTarget`, `evaluateSchedulePresetDropTarget`; grup değerlendirmesi hiçbir sürüklemeden çağrılmıyor) gerçek kodla, geçici bir vitest dosyasıyla 5 hücre × 4 sürükleme koşuldu (dosya sonra silindi). API'nin gerçek cevabı yerel 5613'ten okundu (`/schedule/reference`, Meyhouse, 2026-10-06): `settings` = `{"time_format":"12h"}`.

**Kök bulgu:** API, veritabanının gönderdiği `settings.conflict_rules`'u düşürüyor. `apps/api/src/schedule/schedule-service.ts:510-515` `settings`'i yalnız `{ time_format }` ile yeniden yazıyor; veritabanı fonksiyonu kuralları gönderiyor (`supabase/migrations/20261007030000_manager_note_names_its_writer.sql:122-127`). Kural yokken web her bırakmayı "kurallar kontrol edilmeli" diye amber sayıyor (`apps/web/src/schedule/hooks/useScheduleGridDragControllers.ts:42`) ve izni "confirm"e düşürüyor (`apps/web/src/schedule/schedule-conflicts.ts:28-29`).

| Hücre | Bugün (taşı / kopyala / açık vardiya / preset — dördü aynı) | Kurallar gelseydi | Karar (KARARLAR 2026-10-06) |
|---|---|---|---|
| Boş, uygun hücre | **amber** | yeşil | yeşil |
| Müsait değil | amber | amber | amber ✓ |
| Onaylı izin | **amber** | kırmızı | kırmızı |
| Aynı saatte başka vardiya | kırmızı | kırmızı | kırmızı ✓ |
| Kapalı gün | amber | ayara göre (Meyhouse `confirm` → amber; `block` → kırmızı) | K17 ayarı |
| Yanlış lokasyon / yanlış iş | kırmızı | kırmızı | kırmızı ✓ |
| Unassigned satırına | **amber** | yeşil | yeşil |

Örnek: Ayşe bugün Ali'nin vardiyasını boş bir Perşembe'ye sürüklediğinde hücre yeşil değil amber yanar; Ali'nin izinli Çarşamba'sı da kırmızı değil amber yanar ve bırakılabilir.
- Aynı alan K17 kapalı gün ayarını da besliyor: hızlı düzenleyici (`ShiftQuickEditor.tsx:420`) ve `SchedulePage.tsx:656` ayarı okuyamıyor (ölçülmedi; aynı kayıp alan).
- Yerel ayar (2026-10-06 SELECT): 426 workspace'in hepsinde `approved_time_off = block`; Meyhouse ve dünyada `closed_location = confirm`.
- **Sonuç:** veri katmanı düzelince renk mantığı karara zaten uyuyor. DRAG diliminde arayüze kalan: `styles.css:5841-5855` ham hex'lerin token'a geçmesi ve `data-drop-status` için vitest.
- Öneri sırası: önce `nf-backend` küçük düzeltmesi (API `settings`'e `conflict_rules`, `minimum_travel_minutes`, `minimum_rest_minutes` geçer; paylaşılan cevap şekli → R2; test: API cevabında kurallar var + web'de boş hücre "allowed"), sonra DRAG.

