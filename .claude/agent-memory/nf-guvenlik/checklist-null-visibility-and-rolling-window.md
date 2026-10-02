---
name: checklist-null-visibility-and-rolling-window
description: Boolean görünürlük yardımcısı üye olmayana NULL döndürür mü ("if not f()" NULL'da geçer); "bu haftadan itibaren" süzgeci geçmiş haftanın görünümünü hafta dönünce değiştirir mi
metadata:
  type: reference
---

FB-6.7 A yeniden inceleme (2026-10-02, uç `d78d477c`):
- `communication_reaches` `state.status = 'active' and (...)` ile başlıyor; üye olmayanda `state.status` NULL,
  `important_date_visible`/`announcement_visible` NULL döner. Çağıranlar `if ... or not visible(...) then raise`
  yazıyor: `not NULL` = NULL, raise ATLANIR. Bugün her çağıranın önünde `authorize()` + `workspace_id = hedef`
  süzgeci olduğu için sömürülemez; ama yeni çağıran bu sırayı unutursa fail-open olur.
  Kontrol: boolean yetki/görünürlük yardımcısı `coalesce(..., false)` ya da çağıranda `is not true` mu; üye
  olmayan ve başka workspace'in kaydıyla bir kez çağır.
- `schedule_closures` view'ı `greatest(gün, schedule_current_week_start)` ile yalnız bu haftadan itibaren
  satır üretiyor: Pazartesi gelince geçen haftanın kapalı günü ve `closed_location` uyarısı geçmiş haftadan
  silinir. "Geçmiş kilitli hafta değişmez" kuralının tersi yönde değişim. Kontrol: tarih penceresi `now()`
  ile kayıyorsa, pencereden çıkan geçmiş satır da yok oluyor mu, kural buna izin veriyor mu.
- Maske ekli liste (FB-6.7 ek fark `242b9d56`): bir satırın kim/ne zaman alanı null'a çekilince sıralama
  anahtarı (`order by changed_at`) ve üst başlık alanları (`author_*` = ilk sürümün yazarı) aynı bilgiyi
  dolaylı verir mi; liste ucunda (`created_by`, `updated_at`) zaten görünüyorsa sızıntı yeni değildir, öneri.
  Kırmızı kanıtı: deneme dosyasında düzeltme satırlarını `sed` ile geri al, aynı testler `not ok` olmalı.
