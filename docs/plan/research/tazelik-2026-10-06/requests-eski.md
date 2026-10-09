Ölçüm `origin/main` **`9146ba6b`** üzerinde bitti. Yeniden başlatmadan önce `9e390950`'deydim; aradaki fark yalnız Schedule geri alma işi (EKRAN-01 DB-1c) ve bu maddelerin hiçbirine dokunmuyor. Yerel DB main'le aynı: 437 migration, son sürüm `20261007130000`. Yalnız okuma, git ve SELECT kullandım; test koşmadım, dosya yazmadım.

**Sayılar (`9146ba6b`, 55 madde):** 42 geçerli · 11 değişmiş · 1 bayat (BL-508) · 1 zaten kapalı (BL-183). Açık 53 maddenin 44'ü (a) salt hata düzeltmesi, 9'u (b) karar ister.

Hükümler tek tip çıkmadı, yine de iki maddeyi elle yeniden doğruladım:
- **BL-508:** bekleyen izni okuma pgTAP'la kilitli, test CI yeşil listesinde (`ci-green.txt:158`).
- **BL-183:** eski bildirim metni `pg_proc`'ta 0, ama kapanıştaki kanıt fonksiyonu yerinden kalkmış (aşağıda).

| BL | hüküm | kanıt | sınıf | sahip | görünür | dilim | not |
|---|---|---|---|---|---|---|---|
| 041 | geçerli | Şemsiye madde; EKRAN-02'nin kendisi (görev dosyası Out of scope 9) | b | — | — | — | Tur kapanınca kapanır |
| 057 | değişmiş | `git grep -i "time.?tracking" apps/web/src` → 0; Shift Hub sekmeleri `ShiftExchangeHub.tsx:419-424` duruyor | b | — | — | — | "Time Tracking gizlenir" kısmı bayat; sekme düzeni ekran 13'ün kararı (Out of scope 1) |
| 110 | değişmiş | "Hours need verification" artık `TimeOffProgressPanel.tsx:68`; shared `time-off.ts:104` `time_unknown`; DB `20260924194855…:682` sabit false; Shift Hub `:1783`, `:1878` "Unconfirmed"; `shift-exchanges.ts:52-53` boş olabilen saat; `scheduleShiftSchema` `""` kabul ediyor (`index.ts:1462-1469`) | a | nf-db + nf-backend + nf-arayuz | evet | A3 / B1 / C2 | P01 ve KARARLAR §9: eski veriye tolerans gösteren ölü dal silinir. `scheduleShiftSchema` kısmı Schedule'ın (EKRAN-01) |
| 167 | geçerli | `shift_exchange_schedule_recovery_service`'in güncelleme dalı yalnız yer, kişi, iş ve saati döndürüyor; not, `hide_time_on_badge` ve etiket yok (pg_proc SELECT) | a | nf-db | evet | A2 | Hata: geri alınan vardiyada müdür notu boş geliyor |
| 176 | geçerli | `PermissionRoute.tsx:38`, `:56` `context.permissions.includes`; `SettingsHomeRedirect.tsx:6-10` `permissions.has`; test dışında 21 satır | a | nf-backend | hayır | B1 | CLAUDE.md §9: web'de `permissions.includes` kalmaz, `can()` kullanılır. `SettingsHomeRedirect` Settings ekranının |
| 179 | geçerli | `time_off_event_released_assignments`: eski yardımcı var, `authorize` yok (pg_proc) | a | nf-db | hayır | A2 | §9 yetki çekirdeği |
| 183 | zaten kapalı | Eski "needs manager review" metni pg_proc'ta 0; `notify_owner_time_off_open_shifts` `20261003040000:30`'da silindi, yerine `app_private.time_off_notify_shifts_opened` geldi | — | — | — | — | Kapanış notundaki test (`owner_time_off_notifies_open_shifts`) artık yok; kanıt satırı güncellenmeli |
| 189 | geçerli | Kurtarma fonksiyonu hâlâ `schedule_actor_can_manage_service`'te; 3 adet 42501'in hiçbirinde `authz.*` hint yok | a | nf-db | evet (403 kartı) | A2 | §9 "hayır" sözleşmesi |
| 200 | geçerli | `shift-exchanges-service.ts:106` `AbortSignal.timeout(2_000)` | b | nf-backend | evet (bekleme) | B1 | Teknik karar (P19, Claude verir); önce ölçüm |
| 217 | geçerli | `shift_exchanges_v1.test.sql:163`, `:194`, `:196` seed lokasyonunun saat dilimini değiştiriyor | a | nf-test | hayır | A1 | Ortak yerel DB'yi bozma riski |
| 227 | geçerli | `ci-not-green.txt:4`; test, kalkmış `location_id` kolonuna yazıyor (`:37`, `:42`, `:48`) | a | nf-db | hayır | A1 | P24 / D6 kararı zaten verildi |
| 228 | geçerli | `shift_exchange_draft_undoes` gövdesinde `updated_at>pub.published_at` hâlâ var (pg_proc) | a | nf-db | hayır | A1 | Yarış penceresi |
| 229 | geçerli | Pickup mesajını çalıştıran test yok; yalnız `shift_exchanges_v1:74`, `:78` | a | nf-test | hayır | A1 | |
| 255 | geçerli | `jobs-settings.css:6` `--job-border #e1e7e3`; 16 `.tsx` kullanıyor | a | nf-arayuz | evet | C3 | KARARLAR UI-09: tek beyaz düğme kuralı, ekran bazlı ezme yazılmaz; S7 kararı |
| 256 | geçerli | `requests-catalog.css:148` `.nf-button:not(.secondary):not(.danger)` (satır kaydı) | a | nf-arayuz | evet | C1 | UI-09 |
| 276 | değişmiş | Belge servisleri ve taslak kaydetme/heartbeat artık `authorize`'a soruyor; `shift_exchanges_command_service` 3 yerde `schedule_actor_has_capability_service`, `authorize` yok; eski kapıyı kullanan 10 fonksiyonun hiçbiri Requests'te değil | a | nf-db | hayır | A2 | Açık kalan yalnız (1) takas onayının rütbe kuralı |
| 362 | geçerli | `git grep "Shorten time off and assign"` → 0 | b | — | — | — (Out of scope 3) | Yeni davranış; Schedule ekranının |
| 363 | geçerli | `schedule-requests-routes.ts:33`, `:72`, `:129`, `:150` rota-yerel kapı; `requests-data.ts:37` kendi `fetch`'i | a | nf-backend | hayır | B1 | §9: rota-yerel yetki kapısı olmaz |
| 364 | geçerli | `ScheduleRequestsPage.tsx:609` "Leave cancellation" | b | — | — | V (G3) → A3 / C1 | KARARLAR:533 G3 hâlâ açık |
| 375 | geçerli | `ShiftExchangeHub.tsx:383` "Shift Hub is unavailable"; dosyada `isNoAccess` yok | a | nf-backend + nf-arayuz | evet | B1 | §9 "hayır" sözleşmesi |
| 395 | geçerli | `SchedulePage.tsx` içinde 7 adet `(error as Error).message` (madde 6 diyor) | a | nf-arayuz | evet | — (EKRAN-01) | G11 kuralı |
| 396 | geçerli | Son tanım `20261003040000…:622` hâlâ "is back on the schedule." | a | nf-db | evet (bildirim) | A3 | Metin hatası: kişi vardiyaya yazılmadı |
| 397 | geçerli | Aynı rıza metni `:616`'da `sx-help`, öteki yerlerde `sx-pending`; `.sx-pending` (`shift-exchanges.css:253`) simge ile yazı arasında boşluk vermiyor | a | nf-arayuz | evet | C2 | §9 görsel tutarlılık |
| 398 | değişmiş | `time-off.css:14`, `:21`, `:56`, `:58`, `:60`, `:66`, `:72` `#c5ccd6`; `:75` `#508dc8` (satırlar kaydı, ham renk sayısı arttı) | a | nf-arayuz | evet | C1 | §9 token kuralı |
| 399 | değişmiş | Revoke artık zorunlu gerekçeli onay penceresi açıyor (`ScheduleRequestsPage.tsx:528-560`), iki adım; ama yerel kural düğmeyi hâlâ soluk çiziyor (`requests-catalog.css:156-163`) | a | nf-arayuz | evet | C1 | Yalnız renk kısmı kaldı (UI-09 kırmızı yıkıcı düğme) |
| 400 | geçerli | `shift-exchanges.css:128` `flex: 0 0 200px`; `:766` sütun düzeninde basis düzeltilmiyor | a | nf-arayuz | evet | C2 | |
| 410 | geçerli | `WorkspacePage.tsx:396-402` widget `can()` olmadan çiziliyor | b | — | — | — (Out of scope 2) | Gizlemek yeni davranış (KK-32 (c) 0'ı bırakmıştı) |
| 411 | değişmiş | Fonksiyon silindi; aynı sıra artık `20261003040000:415-419`: önce talep aranıyor (yoksa `out_of_scope`), üyelik sonra soruluyor | a | nf-db | hayır | A3 | §9: bilinmeyen ve kapsam dışı hedef aynı cevabı alır |
| 450 | değişmiş | `styles.css:85` hâlâ `#aeb9b4`; S7 kararı (KARARLAR:531, `#7f8c86`) Schedule üst çubuğunu da kapsıyor | a | nf-arayuz | evet | C3 | Artık karar var. Dikkat: `--theme-text-faint` da bu token'ı okuyor (`styles.css:101`) |
| 506 | geçerli | `time_off_sweep`: `limit 500`, her talepte workspace kilidi, prosedür değil fonksiyon | b | nf-db | hayır | A3 | Teknik ödünleşim (P19) |
| 507 | geçerli | `time_off_sweep` hatayı yalnız `raise warning` ile yazıyor, kalıcı kayıt yok | a | nf-db | hayır | A3 | P09: sessiz davranış kalmaz |
| 508 | bayat | `time_off_seen_by_who_decides` pgTAP, `ci-green.txt:158` | — | — | — | — | KK-158 |
| 509 | geçerli | `time-off-voting-service.ts:50` her 23514 kodunu 409'a çeviriyor | a | nf-backend | hayır | B1 | G11 hata sözleşmesi |
| 512 | değişmiş | (1) tarih artık biçimli (`TimeOffPeriods.tsx:8` `formatTimeOffDay`); (2) `<legend className="sr-only">` (`EmployeeHubPage.tsx:337`); (3) iki başlık aynı biçimde (`TimeOffProgressPanel.tsx:31`, `:47`) | a | nf-arayuz | evet | — (Out of scope 5) | Requests'teki kalemler bayat; (4) ve (5) ölçülmedi |
| 513 | geçerli | Başlık sınıfı `ScheduleRequestsPage.tsx:360`; telefonda gizleyen kural `jobs-settings.css:1149` | a | nf-arayuz | evet | C1 | |
| 515 | geçerli | `CatalogDrawer.tsx:39-41` arka planı `inert` yapıyor; `<Toaster />` `App.tsx:144`'te, inert kalan tarafta | a | nf-arayuz | evet | C3 | WCAG 2.1 AA (§9) |
| 517 | değişmiş | DB çakışmayı zaten reddediyor (`request_time_off_cancellation_service`: `covered && span` → 22023); shared şema `time-off.ts:71-76` reddetmiyor | a | nf-backend | evet (erken hata) | B1 | P11: çakışma yazıldığı anda uyarılır. Yalnız şema kısmı kaldı |
| 518 | geçerli | `time-off.ts:154` `time_timezone` opsiyonel; web'de 4 adet `time_timezone!` | a | nf-backend | hayır | B1 | |
| 519 | geçerli | Ham `set status`: `weekly_assignment_candidates:96`, `weekly_exchange_acceptance:87`, `weekly_shift_availability_assessment:105`, `weekly_schedule_acceptance:71`, `:90` | a | nf-test | hayır | A1 (dokunulursa) / Out of scope 3 | Test, ürünün üretemeyeceği bir hâli ölçüyor |
| 523 | geçerli | CHECK `scheduling_conflict_rules_valid`; zod `availability-assessment.ts:11`; web `schedule-conflicts.ts:23` | a | nf-db + nf-backend | hayır | — (Out of scope 4) | KARARLAR "onaylı izin kesin engel, ayarı yok"; P01 |
| 544 | geçerli | `important_date_close_shifts` adımları kendisi yazıyor; ortak yardımcıyı yalnız yorumda anıyor ("the same steps … `time_off_release_shifts`") | a | nf-db | hayır | — (Out of scope 3) | §9 ikiz sistem yok |
| 580 | geçerli | `styles.css:7273` `.app-confirm` `calc(100vw - 28px)` | a | nf-arayuz | evet | C3 | Ortak onay penceresi telefonda 8 px kayık |
| 589 | geçerli | `font-weight: 850` / `900` 22 yerde (ör. `styles.css:268`, `:3154`) | a | nf-arayuz | hayır | C3 | |
| 600 | değişmiş | Token hâlâ `#aeb9b4` (`styles.css:85`); Mert `#7f8c86`'yı seçti (KARARLAR:531) | a | nf-arayuz | evet | C3 | Kararı bekleyen madde artık "karar uygulanmamış" madde. KARARLAR:549'daki "bekliyor" satırı eskimiş |
| 602 | geçerli | `role="tab"` 15 dosyada; ok tuşu yalnız `ShiftCatalogTabs.tsx:22`'de | a | nf-arayuz | evet | C1 | §9 klavye erişimi |
| 604 | geçerli | `list-page` 7 dosyada; Requests, Employees, Locations, Jobs, Acknowledgements'ta yok | a | nf-arayuz | evet | C1 / C2 | KARARLAR "Liste sayfalarının ortak dili" (Sistem 1). Öteki ekranlar kendi turlarında |
| 652 | geçerli | `ShiftExchangeHub.tsx:293` `from = todayIn()`; `:778` "Cover for" | b | — | — | — (Out of scope 1) | Geçmiş ne kadar geriye gitsin: Mert'e soru (KK-143) |
| 653 | geçerli | `ScheduleRequestsPage.tsx:715` "until this is approved"; `:725` "Employee note"; `:764` "View-only access" | a | nf-arayuz | evet | C1 | Yanlış metin |
| 654 | geçerli | `ScheduleRequestsPage.tsx:284-285` `query.error.message` ekrana basılıyor | a | nf-backend + nf-arayuz | evet | B1 / C1 | G11. Settings kısmı o ekranın; tam ölçülmedi |
| 656 | geçerli | `ConfirmDialog.tsx:53` dönülecek öğeyi effect anında okuyor, `:85` geri dönüyor; dosya `6326f23a`'dan beri değişmedi | a | nf-arayuz | evet | C3 | WCAG (§9). Davranış tarayıcıda yeniden koşulmadı |
| 657 | geçerli | `requests-catalog.css:218` `outline: none` | a | nf-arayuz | evet | C1 | WCAG 2.4.7 |
| 658 | değişmiş | `styles.css:13002` iç içe `li` de grid; `ShiftExchangeHub.tsx:810`, `:812` "Try another date range" | a | nf-arayuz | evet | C1 / C2 | Tek tablo kararıyla (4) ve (7) C1'e taşındı ya da düştü (EKRAN-02 C1/C2 güncellemesi) |
| 661 | geçerli | `ShiftExchangeHub.tsx:1509`; `AvailabilityPage.tsx:152`; `JobAssignmentsDrawer.tsx:360`; `NotificationSettingsPage.tsx:107` | a | nf-arayuz | evet | C2 | Yalnız Shift Hub kısmı Requests'in |
| 663 | geçerli | `styles.css:1300` ok `opacity: 0`, yalnız hover/odakta 1 | b | nf-arayuz | evet | C3 | KARARLAR'da kural yok; ortak değer olduğu için önce kural yazılır |
| 674 | geçerli | `ScheduleRequestsPage.tsx:820` `toLocaleString()`; `ExchangeShiftCard.tsx:44` sabit `"12h"` | a | nf-arayuz | evet | C1 / C2 | Workspace'in 12/24 saat ayarı yok sayılıyor |

**DONE.md için önerilen kapanış cümleleri:**
- **BL-508:** "Bekleyen izni yalnız ona karar verebilenler ve sahibi okuyor; eş müdür hangi lokasyonu kimin onayladığını artık görmüyor (`time_off_seen_by_who_decides` pgTAP, CI yeşil listesinde; ölçüm `9146ba6b`)."
- **BL-183:** madde zaten kapalı, yeni satır gerekmiyor. Yalnız kapanış notundaki kanıt eskimiş: `notify_owner_time_off_open_shifts` ve testi FB-6.3'te kalktı, yerine `app_private.time_off_notify_shifts_opened` geldi. Eski "needs manager review" bildirimi DB'de 0.

**Ölçülemeyenler:**
- **BL-200:** 2 saniyelik gecikme süresi ölçülmedi (uygulamayı çalıştırmak gerekir).
- **BL-656:** odak kaybı tarayıcıda yeniden koşulmadı; hüküm kodun değişmemiş olmasına dayanıyor.
- **BL-512 (4), (5):** ölçülmedi.
- **BL-654:** Settings kısmı tam ölçülmedi.
- **BL-276:** rütbe ihlali çifti sayısı (321) yeniden sayılmadı.

**Kayıtta düzeltilmesi gerekenler:**
- KARARLAR:549 hâlâ "S7 görsel karar bekliyor" diyor, oysa KARARLAR:531'de karar verilmiş. İkisi çelişiyor.
- BL-450 ile BL-600 artık aynı token değişikliği. Değişince soluk yazı rengi (`--theme-text-faint`) de koyulaşır; C3'te ayrıca bakılmalı.
