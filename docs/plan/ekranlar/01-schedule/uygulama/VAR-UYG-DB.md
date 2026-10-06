# EKRAN-01 VAR-UYG-DB — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | VAR-UYG-DB — Edit modunda "changed after publishing" bayrağı (K18, M11) | `nf-db` / veri hattı | R2 | ONAY @51afa8ab (`nf-guvenlik`, 2. tur; 1. tur DEĞİŞİKLİK) | 2026-10-06 |

## Sonrası için
- Tuzak: `published.source_shift_id = shift.id` eşlemesi bir haftada tek değil. Vardiya taslakta başka lokasyona taşınıp yalnız yeni lokasyon yayınlanınca iki güncel yayın aynı kaynağı taşır; skaler alt sorgu `21000` ile bütün okumayı düşürür. Tek satır seç: `order by (c.location_id = shift.location_id) desc limit 1`.
- Kalıp: yayın karşılığına bağlanan her okumaya "taşı, yalnız B'yi yayınla" test hücresi.

## Rapor
**Karar:** VAR-UYG-DB bitti, `nf-guvenlik` ONAY @51afa8ab (R2; 2 tur: DEĞİŞİKLİK → ONAY).
**İzin:** R2 — gönderildi (ONAY + rebase sonrası `test:db` yeşil + Done when kanıtlı). Canlı migration için izin istiyorum.
**Risk:** 🟢 yalnız okuma projeksiyonu; yetki, grant, şema değişmedi; 210 vardiyalık düzenleme okumasında fark 1–4 ms.
**Soru:** koordinatöre (ürün) — bayrak vardiyanın Edit'teki hâlinden değil yayındaki hâlinden okunuyor (görev metni böyle). Ör. müdür Edit'te Emre'nin Salı'sını Ali'ye verirse kartta Ali görünür ama "!" Emre'nin yayından sonraki işareti yüzünden yanar. (a) **(Önerilen)** kişi değişince bayrak düşsün: karttaki kişi Emre değilse "changed after publishing" anlamsız. Dayanak: KARARLAR K18 ("yayınlanmış vardiyada müsaitlik uyarısı görünür") + ILKELER P11 (doğru veri). (b) bugünkü gibi yayındaki hâlden okunsun.
**Sonraki:** EKRAN-02 A1 — bu oturumun bağlamı doluyor (~%70); A1 yeni oturumda başlamalı (devir notu raporda).

### EKRAN-01 VAR-UYG-DB — Edit modunda "changed after publishing" (nf-db/veri)

Delegasyon: R2 (okuma projeksiyonu, yetki yok); tek bağımsız inceleme `nf-guvenlik` (2 tur); görsel QA yok (ekran kodu değişmedi).

### 1. Nerede duruyor
Bitti, main'de; canlı migration koordinatörün iznini bekliyor (her canlı migration izin ister).

### 2. Ne yapıldı (etkisi)
- **Öncesi:** "!" artık yalnız Edit modunda görünüyor (Mert, 2026-10-06), ama Edit modunun okuması (`get_schedule_edit_session_service`) "yayından sonra değişti" bayrağını taşımıyordu; yalnız yayınlanmış okuma modeli hesaplıyordu. Ör. Emre Salı akşamını yayından sonra müsait değil işaretlemiş; Ayşe Edit'e girince küçük pencerede "changed after publishing" satırı çıkmıyordu.
- **Sonrası:** Edit okumasında her vardiya `availability_changed_after_publish` taşır; değer vardiyanın güncel yayındaki karşılığından yayın modelinin kuralıyla gelir (çalışanın kendi işareti ilk yayından sonra geldiyse true; izin sayılmaz). Edit'te yeni eklenen, hiç yayınlanmamış vardiya false.
- 1. tur incelemenin bulduğu hata da kapandı: lokasyonu değiştirilip yalnız yeni lokasyonda yayınlanan vardiya Edit okumasını tamamen düşürüyordu (taslak açılmıyordu).

### 3. Açık kalanlar
- **Web (arayüz hattı, `task/ekran-01-var-uyg`):** alanı Edit kartında okur. Shared tip: `scheduleEditableShiftSchema` alanı `scheduleShiftSchema` üzerinden opsiyonel boolean olarak zaten tanıyor (inceleme doğruladı); zod değişikliği gerekmiyor.
- **Yolda bulunan (backlog önerisi, bu dalın getirmediği):** aynı akışta yayından Edit'e girme (`acquire … 'published'`) bugün `23505 duplicate key schedule_edit_session_shifts_pkey` ile düşüyor — yayın, taşınan vardiyayı iki lokasyonda tutabiliyor. Kalıcı çözüm yayın kuralında (eski lokasyon da yayınlanmalı ya da taşınan vardiya eski yayından düşmeli). `(leave: high / do: risky)`.
- İnceleme Düşük notu: hangi yayının sayıldığını değerle kilitleyen hücre yok; yayınlanmamış üçüncü lokasyona taşımada sıra belirsiz. İsteğe bağlı.

### Sözleşme
- `get_schedule_edit_session_service(...) -> 'shifts'[*].availability_changed_after_publish`: boolean, hiç null değil. Yayın karşılığı yoksa false. Aynı ad ve anlam yayınlanmış okuma modelinde (`get_schedule_read_model_service`) zaten var.

### 4. Ekranda ne değişti
Görünürde bir şey değişmedi (veri alanı eklendi). Arayüz dalı girince Edit modunda "!" penceresi "changed after publishing" satırını gösterir.

### 5. Sırada ne var
1. Canlı migration izni (koordinatör) — yedek: `get_schedule_edit_session_service` canlı tanımı.
2. EKRAN-02 A1 — yeni oturumda.

### Kanıt
- Kırmızı → yeşil (rollback): `availability_always_warns` migration'sız 41–43 kırmızı; 1. tur migration'ıyla 74 kırmızı (`21000`); düzeltmeyle 74/74.
- Rebase sonrası (`origin/main` `0cee9f19`) `test:db` 169 dosya: düşen yalnız bilinen yerel taban `bl052_document_lifecycle`, `bl052_document_notifications`. JS kapısı koşulmadı: dal yalnız `supabase/` + belge.
- `schedule_grid_read_budget` hücre 2 rollback denemesinde CI yükü altında bir kez düştü, bir kez geçti; ölçtüğü fonksiyona (yayın okuma modeli) bu dal dokunmuyor; tam koşuda yeşil.
- Dokunulan dosyalar: `supabase/migrations/20261007100000_edit_mode_says_changed_after_publishing.sql` (canlı tanımdan "tam bir kez eşleşmeli" betikle), `supabase/tests/availability_always_warns.test.sql`, `.claude/agent-memory/nf-guvenlik/` (inceleme notu).

## İnceleme

### Tur 1 (`244d3fad`) — `nf-guvenlik`: KARAR: DEĞİŞİKLİK İSTE
- **Yüksek — aynı vardiyanın iki yayın karşılığı olunca Edit okuması çöküyor** (`…100000…sql:81-87`). Tekillik yalnız bir yayının içinde; vardiya K'den B'ye taşınıp yalnız B yayınlanınca iki güncel yayın aynı kaynağı taşır; alt sorgu `21000`, `acquire` da düşer. Ölçüldü: migration'la "DRAFT acquire FAILED: 21000", migration'sız "OK". Beklenen: tek karşılık (bugünkü lokasyondaki önce, `limit 1`) + kırmızı test. **Düzeltildi** (`51afa8ab`).
- **Orta — test kapsamı:** taslaktan açılan oturum ve lokasyonu değişmiş vardiya hücresi yok. **Bölüm 10 eklendi.**
- **Bu dalın getirmediği:** yayından Edit'e giriş `23505` (yukarıda backlog önerisi).
- Temiz: türetme (`diff -w` ile yalnız üç parça farklı; kapı, `SECURITY DEFINER`, `search_path` aynı), tenant/kapsam (karşılık yalnız `publication.workspace_id` ve oturumun lokasyonlarından), kural okuma modeliyle birebir, sözleşme (şema opsiyonel boolean, katı değil), performans (210 vardiya: 31.7/30.5 ms → 32.7/34.4 ms), kapsam kayması yok.
- Soru: bayrak yayındaki kişiden okunuyor (yukarıda koordinatöre).

### Tur 2 (`51afa8ab`) — `nf-guvenlik`: KARAR: ONAY @51afa8ab
- Yüksek kapandı (alt sorgu hep tek satır; `git diff 244d3fad..51afa8ab` yalnız o üç satır); Orta kapandı (hücre 73 kurguyu sayıyor, 74 açılışı doğruluyor).
- Düşük (engel değil): sıralamayı değerle kilitleyen hücre yok; yayınlanmamış üçüncü lokasyonda sıra belirsiz.
- Kanıt: `51afa8ab` 74/74; `244d3fad` yalnız 74 kırmızı; migration'sız 41–43 kırmızı.
- Hafıza notu: `.claude/agent-memory/nf-guvenlik/checklist-published-counterpart-not-unique.md` (bu dalda commit'li).
