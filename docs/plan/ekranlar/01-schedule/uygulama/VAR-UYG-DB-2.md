# EKRAN-01 VAR-UYG-DB-2 — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | VAR-UYG-DB-2 — Edit bayrağı karttaki kişiye bağlı (KK-171) | `nf-db` / veri hattı | R2 | ONAY @8eeae457 (`nf-guvenlik`, tek tur) | 2026-10-06 |

## Sonrası için
- Kalıp: "yayından sonra değişti" yayınlanan kişinin kendi işaretidir; Edit'teki kişi yayındakinden farklıysa bayrak düşer, yeni kişinin bugünkü işareti `warning_codes: availability` ile görünmeye devam eder.

## Rapor
**Karar:** VAR-UYG-DB-2 bitti, `nf-guvenlik` ONAY @8eeae457 (R2, bulgu yok).
**İzin:** R2 — gönderildi (ONAY + rebase sonrası `test:db` yeşil). Canlı: koordinatörün izni var (20261007100000 ile tek pencerede, bu dalın main CI'ı yeşil olunca).
**Risk:** 🟢 bayrak yalnız daralıyor; yetki, grant, sözleşme değişmedi.
**Soru:** yok.
**Sonraki:** iki migration canlıya; sonra dal/worktree kapanışı, devir notu, `/clear`.

### Ne yapıldı (etkisi)
- **Öncesi:** Schedule → Edit modunda Emre'nin Salı vardiyası Ali'ye verilince kartta "changed after publishing" kalıyordu; işaret Emre'nin yayından sonraki müsaitlik işaretinden geliyordu.
- **Sonrası:** Karttaki kişi yayındaki karşılığının kişisinden farklıysa bayrak `false`; kişi Emre'ye dönerse geri gelir. Açık vardiya (kişisiz) `false`.
- Dayanak: koordinatör kararı KK-171 (KARARLAR K18 + ILKELER P11).

### Kanıt
- `availability_always_warns` hücre 44 migration'sız kırmızı, migration'la 75/75; komşu 6 dosya yeşil; inceleme 9 dosyayı ve açık vardiya / geri dönüş denemesini yeşil gördü.
- Migration `supabase/migrations/20261007110000_edit_flag_follows_the_person_on_the_card.sql` yerel canlı tanımdan tek satır eşlemeyle türetildi (`diff -w` yalnız bayrak satırı).
- Görünürde bir şey değişmedi (Edit kartı bayrağı web hattının dalında okunur).

## İnceleme — Tur 1 (`8eeae457`) — `nf-guvenlik`: KARAR: ONAY @8eeae457
- Bulgu yok. Kontrol: değişiklik tek satır (`diff -w`), yetki/grant aynı (`CREATE OR REPLACE`, yalnız `service_role`, security definer, `search_path=''`), açık vardiya `coalesce` ile `false`, kural KK-171/K18/P11'e uygun, yeni kişinin işareti `warning_codes`'ta duruyor, lokasyon sırası değişmedi, test boşa geçemez (`is(NULL,false)` düşer), sözleşme aynı.
- Öneri (isteğe bağlı): açık vardiya ve Emre'ye geri dönüş adımları kalıcı hücre olabilir (denemede yeşil).
