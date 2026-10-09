# EKRAN-01 VAR-UYG — müsaitlik "!" ve izin hücresi gerçek Schedule'da — uygulama arşivi

Varyant turu: `VAR.md` (VAR-HUCRE a/b/c, dal `task/var-ekran-12`, main'e girmez). Veri parçası: VAR-UYG-DB (main `0cff91bb`, Edit okumasına `availability_changed_after_publish`).

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | VAR-UYG — izin hücresi, köşe / kart / ad "!", "!" penceresi, Mert'in 5 düzeltmesi, ad "!" kuralı | `nf-arayuz` / arayüz hattı | R1 | oturumun kendi okuması + gerçek Edit modunda ekran görüntüsü (R1) | 2026-10-06 |

## Sonrası için
- Kural: ad "!" = (çakışmayan vardiya bir günün köşe "!"ini örtüyor) VEYA (haftada ≥2 farklı günde müsait-değil). İzin sayılmaz; iki lokasyonda aynı gün bir kez sayılır. Tek kaynak: `nameCellShowsAvailabilityMark` (`apps/web/src/schedule/lib/scheduleAvailabilityMark.ts`). Hücrede birden çok vardiya: "!" yalnız çakışan kartlarda; hiçbiri çakışmıyorsa ad "!" (koşul 1).
- Kural: "!"ler yalnız Edit modunda ve Availability açıkken (`ScheduleGrid` → `showAvailabilityMarks`); görünüm modunda Settings → Availability satırı soluk. İzin kırmızısı ("TIME OFF") her zaman kalır.
- Kalıp: pencere `AvailabilityMarkButton`. Kart bir `<button>` olduğu için kart "!"i `insideButton` ile `span role="button"` (Enter / Space açar); iç içe düğme yok.
- Tuzak: pencere açıkken ilk basış / Esc yalnız pencereyi kapatmalı. Schedule'ın kendi pencere dinleyicileri sayfa açılınca kuruluyor; bu yüzden "!" modülü yüklenirken `window`'a en önce kendi capture dinleyicisini kurar (`activeHub`). Kapatan basışın geri kalanı (mousedown, click) yutulur; tarayıcı mousedown göndermezse bekçi click'te ya da sonraki basışta düşer (yoksa bir sonraki basışı yutar — test yakaladı).
- Tuzak: köşe "!" hücrenin ekle katmanından (z 1) sonra DOM'da ve z 1; donmuş Unassigned satırı (z 2) kayan satırın köşesini örter. z 2 verirsen "!" Unassigned'ın üstünden görünür.
- Tuzak: rozet genişliği ölçüm sürümü (`createScheduleBadgeMeasurementVersion`) kartın "!" kazanmasını da içermeli; içermezse çok lokasyonlu düzende sütun dar kalır. Tek lokasyonlu haftada sütunlar ekrana sığdırılır, uzun yazı kelimeden kayar (bugünkü kural).
- K18 / M11: "Changed after publishing" kart penceresinin son satırı; Edit modunda veri VAR-UYG-DB'den gelir.
- Silinenler (ikiz yok): hover balonları (`ScheduleAvailabilityTip`), ad yanındaki takvim simgesi (`weeklyEmployeeSummary`, "needs checking" dahil), turuncu tarama ve çerçeve.

## Rapor

- **Karar:** R1; inceleme oturumun kendi okuması + gerçek Edit modunda görüntü (DELEGASYON §3).
- **İzin:** R1 — koşullar tamamsa izin beklemeden gönderilir.
- **Risk:** 🟢 kural testli (birim + ızgara + e2e 5/5), gerçek Edit modunda altı durumla ölçüldü.
- **Soru:** yok.
- **Sonraki:** 5612/5613 varyant sunucuları açık (EKRAN-03 varyantları için); VAR-ART-REQ.

### Ne yapıldı (ekranda)
| Durum | Edit modunda |
|---|---|
| Tek gün, boş hücre | köşe "!", ad "!" yok |
| Tek vardiya, çakışmıyor | yalnız ad "!" |
| İki gün (Salı çakışan kart + Cuma boş) | kart "!", köşe "!", ad "!" |
| (a) 2 vardiya, biri çakışıyor | "!" yalnız çakışan kartta, ad "!" yok |
| (b) 3 vardiya, hiçbiri çakışmıyor | kart ve köşe "!" yok, ad "!" var |
| (c) 2 vardiya, ikisi de çakışıyor | "!" iki kartta, ad "!" yok |
| İzinli gün | düz kırmızı "TIME OFF" |
| Görünüm modu | 0 "!", TIME OFF duruyor, Settings → Availability soluk |
| Pencereler | ad: haftanın bütün günleri alt alta; kart / köşe: o gün; "by" yok; K18 satırı en altta |
| Düzeltme 1 | odaklı vardiya Esc ve boşa tıklamadan sonra odaklı, hafta aynı |
| Düzeltme 4 | açık pencereden başka "!"e tıklama onun penceresini açar |

Görüntüler: `artifacts/nf-arayuz/VAR-UYG/` (ana klasörde, git dışı): `_cases.png`, `edit-1440.png`, `edit-name-window.png`, `edit-card-window.png`, `edit-multi-shift.png`, `view-1440.png`, `burak-variant.png`.

### Kanıt
- Birim + ızgara: `scheduleAvailabilityMark.test.ts` (ad kuralı, üç çok-vardiya durumu), `ScheduleGrid.test.tsx` (Edit × Availability matrisi, köşe / ad, a/b/c), `ShiftCard.test.tsx` (pencere, Esc, dış basış, Enter, M11), `ScheduleTopBar.test.tsx`, `ScheduleEmployeeCard.test.tsx`, `scheduleGridLayout.test.ts`.
- e2e: `e2e/flows/schedule-availability-warning.spec.ts` 5/5 (M11 artık Edit live'da), rebase sonrası, db.lock ile.
- Burak Kaya (varyant): Salı 18:00 sonrası + öğle vardiyası (koşul 1) ve Cuma bütün gün (koşul 2) — ad "!" iki kurala göre de doğru.

### Yolda bulunup düzeltilenler
- Kapatan basıştan kalan "yut" dinleyicisi sonraki basışı yutuyordu (varyantta da vardı).
- Köşe "!" donmuş Unassigned satırının üstünden görünüyordu.
- "!" kazanan kartta rozet genişliği yeniden ölçülmüyordu.

Skill: `test-driven-development`, `systematic-debugging` (e2e düşüşü → VAR-UYG-DB), `verification-before-completion`.
