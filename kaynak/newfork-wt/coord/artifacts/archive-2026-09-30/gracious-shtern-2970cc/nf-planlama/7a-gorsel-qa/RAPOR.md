# nf-planlama — `.7a` görsel QA bulguları (2026-09-30)

Dal `task/backlog-program-20`, taban `origin/main` `702e7732`, commit **`5a56a051`** (push yok).

## 1. Nerede duruyor
Bitti. Açık madde 225 → 228.

## 2. Ne yapıldı (etkisi)
- **G7 satırı:** ".7a görsel QA ONAY @3dee00d5, dal CI 36611564258 yeşil; T5b toplu turunu bekliyor". CI'ı `gh run view`
  ile doğruladım: `task/fb62-core-b-7a` @`3dee00d5`, check + db + e2e başarılı.
- **§3 madde 1 → BL-403'e ek:** el imleci + Tab odağı, basınca bir şey olmuyor (klavye için yanıltıcı); varsayılan
  rollerde çıkmıyor, yalnız özel rolde; Availability'de 4 kişi + 28 gün düğmesi pasif.
- **§3 madde 2 → BL-402'ye ek:** başlıkta "Profile — Identity and manager-owned contact details", avatar "N", alt çubukta "Cancel".
- **§3 madde 3 → BL-404'e ek:** sihirli bağlantı da 500 (`/auth/v1/otp` "Database error finding user"); dört NULL sütun;
  sonuç: dünya owner'ıyla hiçbir yoldan girilemiyor.
- **Yolda bulunan üç eski bulgu:** var olan maddelerle karşılaştırıldı (BL-244, BL-366, BL-338, BL-352, BL-129, BL-072;
  "Invite", "Terminate", "photo", "Close" araması). Çakışma yok. Üçü de main `702e7732`'de kodla doğrulandı, yeni madde:
  - **BL-406 (low / safe), G17:** bağlı çalışanda "Invite" (`EmployeeDrawer.tsx:1263-1266` `user_id`'ye bakmıyor; rol alanı `:1238` bakıyor).
  - **BL-407 (medium / safe), G17:** telefonda "Terminate employee" / "Restore employee" yok (`styles.css:2644-2646`,
    `@media (max-width: 640px)` `:2606`) — telefondan işten çıkarma yolu yok. Medium verdim: restoran yöneticisi çoğu işi telefondan yapar.
  - **BL-408 (low / safe), G17:** salt okunurda "Profile photo removal" başlığı ve açıklaması kalıyor (`:2482-2483`, düğme `:2488` `!readOnly`).
- **"Öneri (zevk)":** salt okunur çekmecede "Cancel" → "Close" — BL-408'e not (görsel/metin kararı, `nf-arayuz` varyantla).

## 3. Açık kalan ve nedeni
- BL-406'da Invite'a basılırsa sunucunun ne yaptığı ölçülmedi (yazma gerekir; salt okurum).

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız `docs/plan`).

## 5. Sırada ne var
- BL-402 ve BL-403 `.8`'le (`nf-arayuz`); BL-406…408 aynı çekmecede, G17 sırası gelince ya da `.8`'e eklenebilir (koordinatör kararı).
- BL-404, `.10` e2e'sinde owner girişi gerekirse önce gelmeli.

## Kanıt
- `python say.py .`: `acik 228 numarali 199 numarasiz 29 program 228 kopya []`, farklar/kesişim boş, en yüksek BL-408.
- `gh run view 36611564258`: `headSha 3dee00d5…`, `db:success e2e:success check:success`.
- Yazılan dosyalar: `docs/plan/BACKLOG.md` (BL-402/403/404 ekleri, BL-406/407/408), `docs/plan/tasks/BACKLOG-PROGRAM.md` (G7, G17, Notes / Result).
