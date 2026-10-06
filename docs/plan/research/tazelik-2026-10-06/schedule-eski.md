## Schedule eski BL tazeliği (89 madde)

Ölçtüğüm nokta `origin/main` = **`9146ba6b`**. Bilgisayar yeniden başladıktan sonra fetch yaptım. Kesintiden önceki okumalar `9e390950` üzerindeydi; aradaki commit'ler yalnız UNDO-db-bulgu ve belge değişiklikleri, bu maddelere dokunmuyor. Yerel DB'deki son migration `20261007130000`, main'in son migration'ıyla aynı. DB'de yalnız SELECT çalıştırdım, test koşmadım, hiçbir dosyaya yazmadım.

**Özet:** 18 madde kapandı ya da bayatladı, 13 madde değişmiş, 6 madde bugün ölçülemedi. Kalanlar geçerli. W-2 ve W-4 hiç başlamadığı için onlara bağlı maddelerin çoğu açık duruyor.

| BL | hüküm | kanıt | sınıf | sahip | görünür | dilim | not |
|---|---|---|---|---|---|---|---|
| 038 | geçerli | Altı şablon kararından yalnız Replace verildi (KK-162). | b | nf-arayuz | evet | W-3 | 5 karar açık |
| 050 | geçerli | MVP sonrası; koda dokunan commit yok. | b | – | – | – | MVP sonrası |
| 055 | değişmiş | Schedule saat biçimini kısmen kullanıyor (`ShiftCard.tsx:130` timeFormat); öteki ekranlar ölçülmedi. | a | nf-arayuz | evet | – | çok ekran |
| 067 | geçerli | MVP sonrası. | b | – | – | – | |
| 101 | değişmiş | Kod kusurları yok, ücretsiz tetik `pg_cron` ile çalışıyor (BE-2 ölçümü); canlıda e-posta anahtarı yok. | b | – | – | – | Kalan: anahtar Mert'in kararı (BL-027) |
| 121 | geçerli | "40+ scheduled hours" kodda yok (grep 0); karar KK-9. | a | nf-arayuz | evet | W-3 | |
| 122 | geçerli | Boş ızgarada yalnız ekran okuyucuya yazı var (`ScheduleGridBody.tsx:284`). | b | – | evet | – | MVP sonrası; görünür kısmı BL-612 |
| 123 | geçerli | Paylaşım linki yok. | b | – | – | – | MVP sonrası |
| 126 | geçerli | KK-10: MVP sonrası. | b | – | – | – | |
| 133 | **kapandı** (`6b0d5d7b`) | `activate_employee_onboarding_case_service` drop edildi (`20261006000000:3099`). | – | – | – | – | |
| 135 | **bayat** (`68c7bd8c`) | Okuma modeli artık notu yazanı veriyor (`note_author`, `scheduleAvailabilityMark.ts:114`). | – | – | – | – | AVAIL-002 kapattı |
| 159 | **kapandı** (`a4e0ba11`) | DB-1a: tetikleyici oturumun lokasyonuna bakıyor, ret artık `out_of_scope`. | – | – | – | – | |
| 168 | değişmiş | Web tarafı silindi (`2de22655`); API'de pending-ops POST/PATCH/DELETE ve DB'de add/update/remove servisleri duruyor. | a | nf-backend + nf-db | hayır | – | ölü kod |
| 174 | geçerli | `guard_schedule_assignment_availability`: önceki yayın varsa (`prior is not null`) değerlendirmeden dönüyor (canlı gövde :20-26). | a | nf-db | hayır | DB-4 | |
| 191 | ölçülemedi | pgTAP koşmadım. | – | nf-db | – | DB-4 | DB-4'te ölçülecek |
| 194 | değişmiş | `.schedule-state` hâlâ `#d6ddda` / `#65706b`; rename penceresindeki `#9a392f` yok. | a | nf-arayuz | evet | W-4 | |
| 211 | ölçülemedi | Tek seferlik log olayı; büyük ihtimalle bayat (BL-316). | – | nf-test | – | T-1 | |
| 218 | geçerli | `tasks/BL-218.md` hâlâ "in progress". | b | nf-db / nf-backend | evet | – | Kararlar hazır; özellik işi, hata düzeltmesi değil |
| 224 | **kapandı** (`20339ae2`) | `delete_schedule_draft_service` artık tek yardımcıyı çağırıyor (`app_private.live_draft_locations`). | – | – | – | – | |
| 233 | geçerli | Telefon kuralı 768 px'in altında; 768 px'te masaüstü çubuğu hâlâ açık, ekranda ölçülmedi. | a | nf-arayuz | evet | W-5 | |
| 236 | geçerli | `templateApplyMessage.ts:11` hâlâ `name.slice(...)` kullanıyor. | a | nf-arayuz | evet | W-4 | |
| 238 | geçerli | Fonksiyonun tek tanımı var ve çıplak `current_date` kullanıyor (canlı gövde). | a | nf-db | evet | DB-4 | KK-6 kararı var; R3 |
| 257 | değişmiş | (1) kapalı; (2) `.request-status` `#f0f4f2` / `#ced8d3` / `#4f5f58` duruyor (`styles.css:12869-12872`). | a | nf-arayuz | evet | – | Requests ekranının işi |
| 275 | geçerli | `SchedulePage.tsx:1875` her çizimde `createSortedScheduleModel` çağırıyor; `memo` yok. | a | nf-backend + nf-arayuz | hayır | K-1 | |
| 280 | değişmiş | (4) ikiz rotalar silindi (`77bbc7e3`, `62c3b07f`; gate test "retired"). (2) `onboarding-routes.ts:175` geçerli. (5) `preHandler` (`schedule-routes.ts:239`) geçerli. (6) `authorization_matrix.test.sql:529` 2 argümanla çağırıyor. (3) ölçülmedi. | a | nf-backend + nf-db | hayır | – | |
| 292 | **kapandı** (`511aed11`) | Canlı gövdede `case when row_payload ? 'note'`; anahtar yoksa not korunuyor. | – | – | – | – | |
| 298 | geçerli | shared `note: z.string().max(500)` kırpmıyor (`index.ts:1125`); `ShiftSheet.tsx:100` `shift.note &&`. | a | nf-backend | evet | – | Employee view ekranı |
| 318 | değişmiş | Stil B yalnız Publish ve Templates'te (`data-schedule-quiet-dialog`); Export, Unpublish, SaveDraft ve ConfirmDialog eski görünümde. | a | nf-arayuz | evet | W-3 | KK-10 kararı var |
| 320 | **bayat** (`81aa5544`) | Schedule 768 px altında kapalı. | – | – | – | – | |
| 325 | geçerli | Gerçek RPC çıktısını şemayla ayrıştıran test yok; yalnız servis ayrıştırıyor (`schedule-service.ts:551`). | a | nf-test | hayır | – | |
| 326 | geçerli | `publish_schedule_draft_service` hedef lokasyonların taslağın `location_ids`'inde olup olmadığına bakmıyor (canlı gövde :22-40). | a | nf-db | hayır | DB-4 | R3 |
| 327 | geçerli | 3 adet `role="button"` (`DraftDropdownMenu.tsx`); "Delete?" (`:327`, `:441`) ile "Confirm delete" iki ayrı dil. | a | nf-arayuz | evet | W-4 (+W-2) | |
| 333 | **bayat** (`81aa5544`) | 375 px'te Schedule kapalı. | – | – | – | – | |
| 334 | değişmiş | Schedule telefonda yok; ortak `.icon-button` öteki ekranlarda hâlâ 38×36. | a | nf-arayuz | evet | – | Schedule dışı; R2 |
| 346 | geçerli | `.schedule-shift-drawer` hiçbir `.tsx`'te yok, CSS'te var (`styles.css:7117+`). | a | nf-arayuz | hayır | W-4 | |
| 350 | geçerli | 150 ms kapanmayı kilitleyen test yok; `Tooltip.tsx:223` yalnız mouse'ta sıfırlıyor. | a | nf-test | hayır | – | |
| 371 | geçerli | Canlı gövdede `'published_by_name', null`. | a | nf-db | evet | DB-4 + W-4 | |
| 376 | değişmiş | `schedule-routes.ts` 1462 satır (2667'den indi, `77bbc7e3`); K-1 eşiği olan 1500'ün altında. | a | nf-backend | hayır | K-1 | Kapatılabilir |
| 386 | geçerli | `SchedulePage.tsx` 3588 satır, 26 `useState`, 23 `useEffect`. | a | nf-arayuz + nf-backend | hayır | K-1 | |
| 391 | **kapandı** (`2de22655`) | Anahtar silindi; okuma hatayı içeride yakalıyor (`SchedulePage.tsx:934-946`). | – | – | – | – | |
| 412 | **kapandı** (`a4e0ba11`) | `list_schedule_weekly_shifts_service` artık 42501 + `out_of_scope` veriyor; P0002 yok. | – | – | – | – | |
| 435 | geçerli | `schedule-service.ts:1296` `channel.send`; repoda `httpSend` yok. | a | nf-backend | hayır | – | |
| 437 | geçerli | Canlı Export panelinde "Scheduled emails" yok; `App.test.tsx:1375` yokluğu kilitliyor. | a | nf-arayuz | evet | W-3 | 10-01 kararı var; Soru 6 W-3'ten önce yeniden açılacak |
| 441 | geçerli | Alt çubukta sayım hâlâ var (`PublishScheduleDialog.tsx:888-904`). | a | nf-arayuz | evet | W-4 | Karar KARARLAR:519 |
| 442 | ölçülemedi | Kod okundu, davranış denenmedi. | – | nf-backend | evet | T-1 | |
| 445 | geçerli | VAR'da varyant hazırlandı; seçim KARARLAR'da yok. | b | nf-arayuz | evet | W-5 | Mert'in görsel seçimi |
| 448 | geçerli | Kodda değişiklik yok (`DayHeaderCell` `data-today`). | a | nf-arayuz | evet | W-4 | |
| 449 | geçerli | `ScheduleTopBar.tsx:481` `aria-label={viewModeLabel}` → "Weekly view". | a | nf-arayuz | evet | W-2 | |
| 451 | geçerli | `SchedulePage.tsx:1850` "Week of ${selectedDate}". | a | nf-arayuz | evet | W-4 | |
| 453 | geçerli | `styles.css:4356` `.schedule-publish-action:disabled` duruyor. | a | nf-arayuz | hayır | W-4 | |
| 454 | ölçülemedi | Madde baştan doğrulanmamıştı. | – | nf-arayuz | – | W-2 | ölçülecek |
| 457 | geçerli | Hata durumundaki gezinmeye `returnCue` geçmiyor (`SchedulePage.tsx:1844-1855`). | a | nf-arayuz | evet | W-4 | |
| 458 | geçerli | Karar var (karartmaya tık = Esc); kod W-2'de, W-2 başlamadı. | a | nf-arayuz | evet | W-2 | |
| 494 | geçerli | Canlı gövdede `s.created_by = actor_user_id` (:17), preset `:44`. | a | nf-db | evet | – | 10-01 kararı var; BE-1 devretti, iş açılmadı |
| 499 | geçerli | `DefaultHoursReviewDialog.tsx:92` "Saved shift type". | a | nf-arayuz | evet | W-4 | |
| 510 | geçerli | `weekly_publication_decisions` yalnız `tier='note'` olanı atlıyor (:7). | a | nf-db | hayır | DB-4 | |
| 522 | geçerli | `ScheduleRow.tsx:359` `data-overlap`, `useCellState.ts:216` `markConflict`. | a | nf-arayuz | evet | W-4 | Önce oluşma yolu ölçülecek |
| 524 | **kapandı** (`e4231bfb`) | `ScheduleEmployeeCard`'da `CalendarOff` yok; ad "!" kuralı geldi. | – | – | – | – | VAR-UYG |
| 525 | **kapandı** (`e4231bfb`) | İzin düz kırmızı "TIME OFF"; turuncu tarama silindi. | – | – | – | – | |
| 526 | değişmiş | Müsaitlik hover balonu silindi (`e4231bfb`); öteki Tooltip'ler duruyor. | a | nf-arayuz | evet | W-2 | ölçülecek |
| 537 | geçerli | `schedule_closures` görünümünde workspace süzgeci yok (`pg_get_viewdef`). | a | nf-db | hayır | DB-4 | |
| 545 | **kapandı** (`511aed11`) | DB-3: K16 açık düzenlemeye de uygulanıyor; `closed_days_reach_the_shifts` testi. | – | – | – | – | |
| 548 | geçerli | `important_date_closure_impact` hâlâ `shift_exchange_shift` + `coalesce(time_timezone, location.timezone)`. | a | nf-db | evet | – | Important Dates ekranı |
| 549 | ölçülemedi | Arşivden geri alma yolu adla bulunamadı. | – | nf-db | – | – | Settings → Locations turu |
| 551 | geçerli | Yalnız pkey ve `date_idx` var; üç yabancı anahtar indekssiz. | a | nf-db | hayır | – | Toplu indeks işi |
| 552 | zaten kapalı | BL-685'e birleşti (2026-10-05). | – | – | – | – | |
| 562 | zaten kapalı (`23f168ae`) | BACKLOG'da "Kapandı" satırı var. | – | – | – | – | |
| 570 | **kapandı** (`e4231bfb`) | `ScheduleAvailabilityTip` silindi; "You can still schedule" grep 0. | – | – | – | – | |
| 573 | **bayat** (`81aa5544`, `e4231bfb`) | Telefonda Schedule kapalı; balon da silindi. | – | – | – | – | |
| 574 | ölçülemedi | Rozet ölçümü değişti (`1ed53a2c`); ekranda ölçülmedi. | – | nf-arayuz | evet | W-4 | |
| 577 | geçerli | `ShiftQuickEditor.tsx:1066` ile `SchedulePage.tsx:3035` iki ayrı cümle. | a | nf-arayuz | evet | W-4 | Metin seçimi koordinatörde |
| 578 | **bayat** (`81aa5544`) | 390 px'te Schedule kapalı. | – | – | – | – | |
| 579 | geçerli | `mark.unavailable` izni de kapsıyor (`unavailable + leave`), kart "!"i `warning_codes` "availability"den geliyor (`ShiftCard.tsx:122`). | a | nf-db + nf-arayuz | evet | W-4 | S6 kararı var |
| 587 | **bayat** (`81aa5544`) | 375 px'te Schedule kapalı. | – | – | – | – | |
| 608 | geçerli | W-2 başlamadı; dokunan commit yok. | a | nf-arayuz | evet | W-2 | |
| 609 | geçerli | `data-paste-armed` CSS'i var (`styles.css:5867`) ama hiçbir bileşen koymuyor (grep 0). | a | nf-arayuz | evet | W-4 | |
| 610 | geçerli | W-2 başlamadı. | a | nf-arayuz | evet | W-2 | |
| 611 | geçerli | `DayHeaderCell.tsx:40` ve `scheduleFilterModel.ts:57` `${type}: ${title}` yazıyor. | a | nf-arayuz | evet | W-4 | |
| 612 | geçerli | `ScheduleGridBody.tsx:284` `sr-only` "No employees". | a | nf-arayuz | evet | W-2 | |
| 613 | geçerli | W-4 başlamadı. | a | nf-arayuz | evet | W-4 | |
| 614 | geçerli | `SchedulePage.tsx:3176` `published_shift_count` → "changes". | a | nf-arayuz | evet | W-4 | |
| 615 | geçerli | W-4 başlamadı; dokunan commit yok. | a | nf-arayuz | evet | W-4 | |
| 616 | **kapandı** (`6682304e`) | `EnterEditModeDialog` grep 0. | – | – | – | – | |
| 617 | geçerli | Karar var (ilk tık yalnız menüyü kapatır); W-2 yok. `88f5e7a1` yalnız pencere içi basışı düzeltti. | a | nf-arayuz | evet | W-2 | |
| 618 | geçerli | Şemsiye madde; W-4 başlamadı. | a | nf-arayuz | evet | W-4 | |
| 619 | **bayat** (`4f0a43a0`) | `own_mark` yalnız `week.unavailable` sayıyor, izni saymıyor (okuma modeli :221-224); Edit tarafı da aynı (`1154d318`). | – | – | – | – | |
| 655 | geçerli | `ScheduleTopBar.tsx:640` "Role Seperators". | a | nf-arayuz | evet | W-4 | |
| 681 | geçerli | `scheduleGridViewModel.ts:70` `hasEditSession \|\| unassigned.length > 0`. | a | nf-arayuz | evet | W-3 | |
| 685 | **kapandı** (`e986f346`) | shared `confirm_scope` (`availability-assessment.ts:79`), web `closedDayAnswer.ts:10`. | – | – | – | – | |

**Fazla düzgün sonuç kontrolü:** "W-2/W-4 başlamadı" diye geçerli dediğim satırlardan üçünü elle doğruladım: 609 (paste CSS'i hiçbir bileşen koymuyor), 614 (bildirim metni) ve 611 (ham tür kodu). Ayrıca 619'u "bayat" yazmadan önce iki okumanın da canlı gövdesini okudum.

### DONE.md için önerilen etki cümleleri

- **BL-159, BL-412** (`a4e0ba11`): Açık düzenleme yalnız kendi lokasyonuna yazar. Yönetici var olmayan ya da göremediği taslağı soruda ayırt edemez.
- **BL-224** (`20339ae2`): Arşivli ya da silinmiş lokasyonu olan taslak tek kuralla silinir; kural satır içinde ikinci kez yazılı değil.
- **BL-292, BL-545** (`511aed11`): Notu göndermeyen kayıt yolu notu silmez. Açık düzenlemedeki vardiya kapalı güne düşünce açığa çıkar.
- **BL-391, BL-168 web kısmı** (`2de22655`): Yayın durumu okuması düşünce tarayıcıda yakalanmamış hata kalmaz. Ölü taslak işlem fonksiyonları web'den silindi; API ve DB kalanı açık.
- **BL-616** (`6682304e`): Hiç açılmayan "taslak seç" penceresi silindi.
- **BL-685, BL-552 ile birlikte** (`e986f346`): "Confirm once" ekranda sunucunun işaretiyle çalışır, ayarın ikinci kopyasına bakmaz.
- **BL-524, BL-525, BL-570** (`e4231bfb`): Ad sütunundaki eski takvim simgesi ve hücre balonu gitti. İzin düz kırmızı "TIME OFF", müsaitlik tıklanan "!" ile gösterilir; ikisi artık yalnız renkle ayrılmıyor.
- **BL-133** (`6b0d5d7b`): Kapısız `activate_employee_onboarding_case_service` silindi.
- **BL-135** (`68c7bd8c`, bayat): Manager note kimin, ne zaman yazdığını taşıyor.
- **BL-619** (`4f0a43a0`, bayat): "Changed after publishing" onaylı izni saymaz.
- **BL-320, BL-333, BL-573, BL-578, BL-587** (`81aa5544`, bayat): Schedule 768 px altında kapalı olduğu için telefondaki taşma ve boşluklar artık oluşamaz.
- **BL-376** (`77bbc7e3`, değişmiş, kapatma önerisi): `schedule-routes.ts` 1462 satıra indi, K-1'in 1500 satır eşiğinin altında.

### Ölçülemeyenler (6)

- **BL-191, BL-454, BL-574:** test ya da ekran görüntüsü gerekiyor (DB-4, W-2, W-4).
- **BL-211, BL-442:** T-1'de ölçülecek.
- **BL-549:** lokasyonu arşivden geri alma yolunu adla bulamadım; Settings → Locations turunda bakılmalı.

### Yolda bulunan

BL-494'ün kararı var (2026-10-01) ama BE-1 işi veri hattına devretti ve iş açılmadı. Hiçbir dilimde değil; DB-4'e eklenmesini öneririm.
