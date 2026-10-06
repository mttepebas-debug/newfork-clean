# BACKLOG-TAZELIK-RE — Schedule, Requests, Employees (2026-10-06)

Ölçüm `origin/main` `9146ba6b` (bilgisayar yeniden başladıktan sonra), yalnız okuma / git / SELECT; test koşulmadı. Ham tablolar bu klasörde (ajan raporları, aynen). Her maddenin altına "Tazelik 2026-10-06" satırı yazıldı; kapananlar "Kapandı 2026-10-06" + DONE.md satırı aldı.

**Sınıflar:** (a) **salt hata düzeltmesi** — KARARLAR / ILKELER / CLAUDE.md §9'daki karara bugün uyulmuyor ya da açık hata; düzeltme yeni tasarım, kural, davranış, mantık getirmiyor (Mert'in gece kuralına göre onaysız yapılabilir; R3 yüzeyi yine `nf-guvenlik` ister). (b) **karar ister** — sabah Mert'e.

**Uyarı (ölçüm derinliği):** Schedule yeni (688–723) ve 724–788 tablolarında "geçerli" hükümlerinin bir kısmı "dosya keşiften beri değişmedi" kanıtına dayanıyor (tarayıcıda yeniden denenmedi); ayrıntı ham tablolarda.

## 1. Sayılar

| Ekran | Ölçülen | Kapandı / bayat | Geçerli + değişmiş | (a) | (b) |
|---|---|---|---|---|---|
| Schedule | 125 | 36 | 83 | 70 | 12 |
| Requests | 86 | 3 | 83 | 63 | 20 |
| Employees | 101 | 1 | 100 | 81 | 19 |
| **Toplam** | 312 | 40 | 266 | 214 | 51 |

Ölçülemeyen: BL-191, BL-211, BL-442, BL-454, BL-549, BL-574.

## 2. Kapanan / bayat (BACKLOG'da kapatıldı, DONE.md'ye yazıldı)

- BL-042 (Employees) — bayat: ölçülecek bir iddia yok ("drawer UI polish"); işi EKRAN-03 C2 ve ayrı BL'ler aldı
- BL-133 (Schedule) — kapandı (`6b0d5d7b`): `activate_employee_onboarding_case_service` drop edildi (`20261006000000:3099`).
- BL-135 (Schedule) — bayat (`68c7bd8c`): Okuma modeli artık notu yazanı veriyor (`note_author`, `scheduleAvailabilityMark.ts:114`).
- BL-159 (Schedule) — kapandı (`a4e0ba11`): DB-1a: tetikleyici oturumun lokasyonuna bakıyor, ret artık `out_of_scope`.
- BL-183 (Requests) — zaten kapalı: Eski "needs manager review" metni pg_proc'ta 0; `notify_owner_time_off_open_shifts` `20261003040000:30`'da sil…
- BL-224 (Schedule) — kapandı (`20339ae2`): `delete_schedule_draft_service` artık tek yardımcıyı çağırıyor (`app_private.live_draft_locations`).
- BL-292 (Schedule) — kapandı (`511aed11`): Canlı gövdede `case when row_payload ? 'note'`; anahtar yoksa not korunuyor.
- BL-320 (Schedule) — bayat (`81aa5544`): Schedule 768 px altında kapalı.
- BL-333 (Schedule) — bayat (`81aa5544`): 375 px'te Schedule kapalı.
- BL-391 (Schedule) — kapandı (`2de22655`): Anahtar silindi; okuma hatayı içeride yakalıyor (`SchedulePage.tsx:934-946`).
- BL-412 (Schedule) — kapandı (`a4e0ba11`): `list_schedule_weekly_shifts_service` artık 42501 + `out_of_scope` veriyor; P0002 yok.
- BL-508 (Requests) — bayat: `time_off_seen_by_who_decides` pgTAP, `ci-green.txt:158`
- BL-524 (Schedule) — kapandı (`e4231bfb`): `ScheduleEmployeeCard`'da `CalendarOff` yok; ad "!" kuralı geldi.
- BL-525 (Schedule) — kapandı (`e4231bfb`): İzin düz kırmızı "TIME OFF"; turuncu tarama silindi.
- BL-545 (Schedule) — kapandı (`511aed11`): DB-3: K16 açık düzenlemeye de uygulanıyor; `closed_days_reach_the_shifts` testi.
- BL-552 (Schedule) — zaten kapalı: BL-685'e birleşti (2026-10-05).
- BL-562 (Schedule) — zaten kapalı (`23f168ae`): BACKLOG'da "Kapandı" satırı var.
- BL-570 (Schedule) — kapandı (`e4231bfb`): `ScheduleAvailabilityTip` silindi; "You can still schedule" grep 0.
- BL-573 (Schedule) — bayat (`81aa5544`, `e4231bfb`): Telefonda Schedule kapalı; balon da silindi.
- BL-578 (Schedule) — bayat (`81aa5544`): 390 px'te Schedule kapalı.
- BL-587 (Schedule) — bayat (`81aa5544`): 375 px'te Schedule kapalı.
- BL-616 (Schedule) — kapandı (`6682304e`): `EnterEditModeDialog` grep 0.
- BL-619 (Schedule) — bayat (`4f0a43a0`): `own_mark` yalnız `week.unavailable` sayıyor, izni saymıyor (okuma modeli :221-224); Edit tarafı da aynı (`115…
- BL-685 (Schedule) — kapandı (`e986f346`): shared `confirm_scope` (`availability-assessment.ts:79`), web `closedDayAnswer.ts:10`.
- BL-688 (Schedule) — zaten kapalı: DB-1b `20339ae2`/`40f2948a`/`a089f778` + `ed74a30b`: süre dolunca `autosave`, "Auto-save · ad · saat" taslağı
- BL-689 (Schedule) — zaten kapalı: DB-1c `bb7df088`/`ec38901d` + `05c19950`/`9a6fe619`: Undo sunucudaki adımı geri alıyor; `b921a0fd` takas geri …
- BL-690 (Schedule) — zaten kapalı: W-1a `6501b429`/`8440c6bb` + W-1b `659f0b9f`: geri sayımda kilit düşmüyor, düşerse bir kez kurtarılıp yeniden …
- BL-691 (Schedule) — zaten kapalı: `6501b429` (yenileyince düzenleme sürüyor) + `f667cfd5` (başka hafta görünüm modunda)
- BL-692 (Schedule) — zaten kapalı: DB-1b: bekleyen değişiklik listesi yalnız çağıranın; e2e `57726b9a`
- BL-693 (Schedule) — zaten kapalı: `8fec3a7d` (lokasyon başına `rls_can`) + `39e94551`/`ae526db3` (yükte taslak, kullanıcı, vardiya kimliği yok)
- BL-695 (Schedule) — zaten kapalı: DB-1b: kira canlıyken 409 `schedule.draft_being_edited` + `46ed4225` sade metin
- BL-696 (Schedule) — zaten kapalı: DB-3 `511aed11`: şablon molayı saklıyor ve uyguluyor
- BL-697 (Schedule) — zaten kapalı: DB-3: yeni vardiya `source_published_shift_id` almıyor; web `scheduleShiftMetadata.ts:25-32` buna bakıyor
- BL-698 (Schedule) — zaten kapalı: DB-1b ad biçimi + `recovered_draft_name`; `12b8e9b1` açılışta tek satır
- BL-700 (Schedule) — zaten kapalı: BE-1 `7cb8813c`: Export authorize çekirdeğe soruyor, eski kapı silindi
- BL-703 (Schedule) — zaten kapalı: `efe215a4` + BE-2b `7bd0190f`/`d2264f7a`/`27f102db`: kısmi teslim notu, kural açık kalıyor
- BL-704 (Schedule) — zaten kapalı: DRAG-API `7f7e90dc` (kurallar ekrana ulaşıyor) + DRAG-UI `4d2e571a` (token, üç durum testli)
- BL-709 (Schedule) — zaten kapalı: W-1b `fe5f1b61`: görünen her lokasyon izleniyor
- BL-718 (Schedule) — bayat: KARARLAR :519 "Schedule telefonda tamamen kapalı"; `81aa5544` + `bdd1be43`
- BL-724 (Requests) — zaten kapalı: `666ff634` / migration `20261007040000_time_off_pages_lose_no_request.sql`: imleç artık sayfanın son satırının…

## 3. (a) Salt hata düzeltmesi — hatların alacağı liste

Önce **dilimsiz ve ekran turu içinde** olanlar (hat boşalınca doğrudan alır), sonra **bir görev dosyası dilimine eşli** olanlar (o dilimde yapılır), en son **başka ekranın turuna / MVP sonrası** olanlar. Sahip = ilk yazılan rol; birden çok rol varsa sırayla.

### 3.1 Dilimsiz (hat boşta alır)

**nf-db** (5)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-168 | Schedule | hayır | – | Web tarafı silindi (`2de22655`); API'de pending-ops POST/PATCH/DELETE ve DB'de add/update/remove servisleri du… |
| BL-280 | Schedule | hayır | – | (4) ikiz rotalar silindi (`77bbc7e3`, `62c3b07f`; gate test "retired"). (2) `onboarding-routes.ts:175` geçerli… |
| BL-494 | Schedule | evet | – | Canlı gövdede `s.created_by = actor_user_id` (:17), preset `:44`. |
| BL-548 | Schedule | evet | – | `important_date_closure_impact` hâlâ `shift_exchange_shift` + `coalesce(time_timezone, location.timezone)`. |
| BL-551 | Schedule | hayır | – | Yalnız pkey ve `date_idx` var; üç yabancı anahtar indekssiz. |

**nf-backend** (2)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-298 | Schedule | evet | – | shared `note: z.string().max(500)` kırpmıyor (`index.ts:1125`); `ShiftSheet.tsx:100` `shift.note &&`. |
| BL-435 | Schedule | hayır | – | `schedule-service.ts:1296` `channel.send`; repoda `httpSend` yok. |

**nf-arayuz** (3)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-055 | Schedule | evet | – | Schedule saat biçimini kısmen kullanıyor (`ShiftCard.tsx:130` timeFormat); öteki ekranlar ölçülmedi. |
| BL-257 | Schedule | evet | – | (1) kapalı; (2) `.request-status` `#f0f4f2` / `#ced8d3` / `#4f5f58` duruyor (`styles.css:12869-12872`). |
| BL-334 | Schedule | evet | – | Schedule telefonda yok; ortak `.icon-button` öteki ekranlarda hâlâ 38×36. |

**nf-test** (2)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-325 | Schedule | hayır | – | Gerçek RPC çıktısını şemayla ayrıştıran test yok; yalnız servis ayrıştırıyor (`schedule-service.ts:551`). |
| BL-350 | Schedule | hayır | – | 150 ms kapanmayı kilitleyen test yok; `Tooltip.tsx:223` yalnız mouse'ta sıfırlıyor. |

### 3.2 Bir dilime eşli (dilimde yapılır)

**nf-db** (45)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-079 | Employees | evet | A4 | `person_display_name` yok (0); `first_name` okuyan 46 fonksiyon, `preferred_name` okuyan 33 (pg_proc) |
| BL-110 | Requests | evet | A3 / B1 / C2 | "Hours need verification" artık `TimeOffProgressPanel.tsx:68`; shared `time-off.ts:104` `time_unknown`; DB `20… |
| BL-167 | Requests | evet | A2 | `shift_exchange_schedule_recovery_service`'in güncelleme dalı yalnız yer, kişi, iş ve saati döndürüyor; not, `… |
| BL-174 | Schedule | hayır | DB-4 | `guard_schedule_assignment_availability`: önceki yayın varsa (`prior is not null`) değerlendirmeden dönüyor (c… |
| BL-179 | Requests | hayır | A2 | `time_off_event_released_assignments`: eski yardımcı var, `authorize` yok (pg_proc) |
| BL-189 | Requests | evet (403 kartı) | A2 | Kurtarma fonksiyonu hâlâ `schedule_actor_can_manage_service`'te; 3 adet 42501'in hiçbirinde `authz.*` hint yok |
| BL-227 | Requests | hayır | A1 | `ci-not-green.txt:4`; test, kalkmış `location_id` kolonuna yazıyor (`:37`, `:42`, `:48`) |
| BL-228 | Requests | hayır | A1 | `shift_exchange_draft_undoes` gövdesinde `updated_at>pub.published_at` hâlâ var (pg_proc) |
| BL-238 | Schedule | evet | DB-4 | Fonksiyonun tek tanımı var ve çıplak `current_date` kullanıyor (canlı gövde). |
| BL-276 | Requests | hayır | A2 | Belge servisleri ve taslak kaydetme/heartbeat artık `authorize`'a soruyor; `shift_exchanges_command_service` 3… |
| BL-282 | Employees | evet | A4+B1+C1 | CSV düzelmiş (`schedule-export.ts:451` formül başına `'` ekliyor); Employees listesi hâlâ `page_limit: 100` (`… |
| BL-326 | Schedule | hayır | DB-4 | `publish_schedule_draft_service` hedef lokasyonların taslağın `location_ids`'inde olup olmadığına bakmıyor (ca… |
| BL-338 | Employees | evet | A4 | 464 aktif owner'ın 77'sinin arşivsiz kaydı yok (SELECT, 4'ü elle doğrulandı); "her owner'ın kaydı var" pgTAP d… |
| BL-371 | Schedule | evet | DB-4 + W-4 | Canlı gövdede `'published_by_name', null`. |
| BL-388 | Employees | evet | A1+B2 | iki servisin prosrc'unda `at time zone` var, `time_timezone` ve taslak tablosu yok |
| BL-396 | Requests | evet (bildirim) | A3 | Son tanım `20261003040000…:622` hâlâ "is back on the schedule." |
| BL-401 | Employees | evet | B1+A1 | prosrc sırası: `42501 authz.rank`, sonra `P0002` |
| BL-411 | Requests | hayır | A3 | Fonksiyon silindi; aynı sıra artık `20261003040000:415-419`: önce talep aranıyor (yoksa `out_of_scope`), üyeli… |
| BL-419 | Employees | hayır | A3 | davet rotası `app.ts:544` ve `prepare_employee_invitation_service`'te kurulum kontrolü yok |
| BL-428 | Employees | evet | A4+C1 | hücre `primary_location_name ?? "Unassigned"` + `+N` (`EmployeeLocationParts.tsx:115-117`) |
| BL-436 | Employees | evet | A4+C1 | süzgeç `primary_location_id` ile eşliyor (`EmployeesPage.tsx:205-222`) |
| BL-456 | Employees | evet | A1+A3 | aynı çağrı listesi; davet kabulü ve `set_employee_archived_service` çağırmıyor |
| BL-503 | Employees | evet | A2+B2 | e-posta tekil indeksi yok; aynı workspace'te 2 yinelenen çift (SELECT); telefon ipucu `ProfilePage.tsx:523` |
| BL-507 | Requests | hayır | A3 | `time_off_sweep` hatayı yalnız `raise warning` ile yazıyor, kalıcı kayıt yok |
| BL-510 | Schedule | hayır | DB-4 | `weekly_publication_decisions` yalnız `tier='note'` olanı atlıyor (:7). |
| BL-537 | Schedule | hayır | DB-4 | `schedule_closures` görünümünde workspace süzgeci yok (`pg_get_viewdef`). |
| BL-579 | Schedule | evet | W-4 | `mark.unavailable` izni de kapsıyor (`unavailable + leave`), kart "!"i `warning_codes` "availability"den geliy… |
| BL-701 | Schedule | hayır | DB-4 | `schedule-service.ts:480,513` önemli tarihleri service role ile okuyup TS'de süzüyor |
| BL-725 | Requests | evet (Approve açılır) | A1 (+C2) | KARARLAR:168 "işaret, engel değil". Exchange fonksiyonlarını son tanımlayan migration eski; bugünkü migration'… |
| BL-726 | Requests | hayır (hata mesajı) | A2 | Ret dalındaki kendi-vaka kuralı hâlâ yok; KARARLAR "kimse kendi talebini onaylayamaz" (Requests S1). Migration… |
| BL-727 | Requests | evet (kısıtlı çalışanda düğme hata verir) | A2 | `exchange.offer_own` / `apply_own` `restricted_ok = f` hâlâ `20260924123013_authorization_core.sql`'de; komut … |
| BL-733 | Requests | hayır (vaka takılı kalır) | A1 | `weekly_exchange_changed_terms.test.sql` hâlâ `ci-not-green.txt:4`'te; P24 "gerçek çakışmada kabul düşer" |
| BL-734 | Requests | evet (ikinci tık, durum yazısı) | A2 + B2 | Oy tekrarı: işlemi yapan fonksiyon son migration'dan beri aynı; Undo migration yalnız `shift_exchange_rebase_d… |
| BL-737 | Requests | evet (Closed etiketi) | A3 + C1 | "Revoked · No longer approved leave" etiketi aynı okuma modelinde |
| BL-738 | Requests | evet (bildirim metni) | A3 | Karar bildirimi metni değişmedi |
| BL-746 | Requests | evet (Settings → Roles açıklaması) | B1 → **nf-db** yeni migration | Metin sayfada değil, veri satırında: `20260821100000_schedule_requests.sql:4` "Approve, deny, return, and revo… |
| BL-765 | Employees | evet (Confirm termination açılır) | A1 + B2 | `terminate_employee_service` son tanım `20260930130000`; K4 (KK-169) yazılı |
| BL-766 | Employees | hayır (veri) | A1 | Aynı fonksiyon `>= resolved_effective_at`; K1 (KK-169, P09) yazılı |
| BL-767 | Employees | evet | A3 + B1 | `EmployeeDrawer.tsx:2584` "Send reminder"; `invitations_ask_the_core` `:281` "failed invitation not found" |
| BL-769 | Employees | evet (admin'in ekranı) | A2 | `save_employee_service` son tanım `20261003000000`; K11 (KK-169) yazılı |
| BL-770 | Employees | evet | A1 + B1 + B2 | `employee-data.ts:195` `restoreAccess=false` varsayılan; `EmployeeDrawer.tsx` onu hiç göndermiyor |
| BL-772 | Employees | hayır | A1 | KARARLAR "tek yol Remove"; API'nin ikiz yolu duruyor |
| BL-773 | Employees | hayır | A2 | Rütbe hesabı davetli admin'i "çalışan" sayıyor; K12 yazılı |
| BL-774 | Employees | hayır | A2 + B1 | Çekmece satır içi izin listesi; Requests S3 ve Employees S4 yazılı |
| BL-776 | Employees | evet (bildirim) | A3 | K5 (KK-169) yazılı; bildirim alıcıları migration'da değişmedi |

**nf-backend** (19)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-176 | Requests | hayır | B1 | `PermissionRoute.tsx:38`, `:56` `context.permissions.includes`; `SettingsHomeRedirect.tsx:6-10` `permissions.h… |
| BL-275 | Schedule | hayır | K-1 | `SchedulePage.tsx:1875` her çizimde `createSortedScheduleModel` çağırıyor; `memo` yok. |
| BL-363 | Requests | hayır | B1 | `schedule-requests-routes.ts:33`, `:72`, `:129`, `:150` rota-yerel kapı; `requests-data.ts:37` kendi `fetch`'i |
| BL-375 | Requests | evet | B1 | `ShiftExchangeHub.tsx:383` "Shift Hub is unavailable"; dosyada `isNoAccess` yok |
| BL-376 | Schedule | hayır | K-1 | `schedule-routes.ts` 1462 satır (2667'den indi, `77bbc7e3`); K-1 eşiği olan 1500'ün altında. |
| BL-383 | Employees | hayır | B1 | gövde doğrulaması yetkiden önce (`employee-directory-routes.ts:462-467` → `resolveActor` sonra) |
| BL-386 | Schedule | hayır | K-1 | `SchedulePage.tsx` 3588 satır, 26 `useState`, 23 `useEffect`. |
| BL-509 | Requests | hayır | B1 | `time-off-voting-service.ts:50` her 23514 kodunu 409'a çeviriyor |
| BL-517 | Requests | evet (erken hata) | B1 | DB çakışmayı zaten reddediyor (`request_time_off_cancellation_service`: `covered && span` → 22023); shared şem… |
| BL-518 | Requests | hayır | B1 | `time-off.ts:154` `time_timezone` opsiyonel; web'de 4 adet `time_timezone!` |
| BL-621 | Employees | evet | B1 (Employees yarısı) | ham zod mesajı `EmployeeOnboardingPage.tsx:591`, `WeeklyPreferencesForm.tsx:118-121` |
| BL-654 | Requests | evet | B1 / C1 | `ScheduleRequestsPage.tsx:284-285` `query.error.message` ekrana basılıyor |
| BL-669 | Employees | evet | B2+C2 | "Onboarding in progress" `EmployeeDrawer.tsx:2449` (dosya `6326f23a`'dan beri değişmedi) |
| BL-739 | Requests | hayır | A3 + B1 | `time-off-shorten-routes.ts` son commit 59b32a14 (09-29) |
| BL-741 | Requests | evet (arama kutusu imleci kaybeder) | B1 | `useScheduleRequests` hâlâ `keepPreviousData` kullanmıyor; sayfa `ScheduleRequestsPage.tsx:279`'da "Loading re… |
| BL-742 | Requests | evet | B1 + C1 | Hata/yükleme hâlinde `RequestState` çerçevesiz; KK-173 sekme yapısını değiştiriyor |
| BL-743 | Requests | evet | B1 | Aynı kök (önceki veri tutulmuyor) |
| BL-775 | Employees | hayır | B1 | Ölü yol kodda duruyor; BL-408/472/473 kökü |
| BL-785 | Employees | evet | B1 | Önbellek geçersiz kılma eksik |

**nf-arayuz** (89)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-121 | Schedule | evet | W-3 | "40+ scheduled hours" kodda yok (grep 0); karar KK-9. |
| BL-194 | Schedule | evet | W-4 | `.schedule-state` hâlâ `#d6ddda` / `#65706b`; rename penceresindeki `#9a392f` yok. |
| BL-233 | Schedule | evet | W-5 | Telefon kuralı 768 px'in altında; 768 px'te masaüstü çubuğu hâlâ açık, ekranda ölçülmedi. |
| BL-236 | Schedule | evet | W-4 | `templateApplyMessage.ts:11` hâlâ `name.slice(...)` kullanıyor. |
| BL-255 | Requests | evet | C3 | `jobs-settings.css:6` `--job-border #e1e7e3`; 16 `.tsx` kullanıyor |
| BL-256 | Requests | evet | C1 | `requests-catalog.css:148` `.nf-button:not(.secondary):not(.danger)` (satır kaydı) |
| BL-259 | Employees | evet | C1+C2 | `#cbd2ce` hâlâ `styles.css:1970` ve `:2640`'ta |
| BL-318 | Schedule | evet | W-3 | Stil B yalnız Publish ve Templates'te (`data-schedule-quiet-dialog`); Export, Unpublish, SaveDraft ve ConfirmD… |
| BL-327 | Schedule | evet | W-4 (+W-2) | 3 adet `role="button"` (`DraftDropdownMenu.tsx`); "Delete?" (`:327`, `:441`) ile "Confirm delete" iki ayrı dil… |
| BL-346 | Schedule | hayır | W-4 | `.schedule-shift-drawer` hiçbir `.tsx`'te yok, CSS'te var (`styles.css:7117+`). |
| BL-395 | Requests | evet | — (EKRAN-01) | `SchedulePage.tsx` içinde 7 adet `(error as Error).message` (madde 6 diyor) |
| BL-397 | Requests | evet | C2 | Aynı rıza metni `:616`'da `sx-help`, öteki yerlerde `sx-pending`; `.sx-pending` (`shift-exchanges.css:253`) si… |
| BL-398 | Requests | evet | C1 | `time-off.css:14`, `:21`, `:56`, `:58`, `:60`, `:66`, `:72` `#c5ccd6`; `:75` `#508dc8` (satırlar kaydı, ham re… |
| BL-399 | Requests | evet | C1 | Revoke artık zorunlu gerekçeli onay penceresi açıyor (`ScheduleRequestsPage.tsx:528-560`), iki adım; ama yerel… |
| BL-400 | Requests | evet | C2 | `shift-exchanges.css:128` `flex: 0 0 200px`; `:766` sütun düzeninde basis düzeltilmiyor |
| BL-407 | Employees | evet | C2 | telefonda gizli: `styles.css:2745-2747` `display: none` |
| BL-408 | Employees | evet | C2 | "Profile photo removal" her durumda (`EmployeeDrawer.tsx:2677`); salt okunurda düğme "Cancel" (`:1297`) |
| BL-429 | Employees | evet | C1+C2 | neden artık ekran okuyucuya bağlı (`EmployeeLocationParts.tsx:69`); düğme `disabled` olduğu için klavye odağı … |
| BL-437 | Schedule | evet | W-3 | Canlı Export panelinde "Scheduled emails" yok; `App.test.tsx:1375` yokluğu kilitliyor. |
| BL-441 | Schedule | evet | W-4 | Alt çubukta sayım hâlâ var (`PublishScheduleDialog.tsx:888-904`). |
| BL-448 | Schedule | evet | W-4 | Kodda değişiklik yok (`DayHeaderCell` `data-today`). |
| BL-449 | Schedule | evet | W-2 | `ScheduleTopBar.tsx:481` `aria-label={viewModeLabel}` → "Weekly view". |
| BL-450 | Requests | evet | C3 | `styles.css:85` hâlâ `#aeb9b4`; S7 kararı (KARARLAR:531, `#7f8c86`) Schedule üst çubuğunu da kapsıyor |
| BL-451 | Schedule | evet | W-4 | `SchedulePage.tsx:1850` "Week of ${selectedDate}". |
| BL-453 | Schedule | hayır | W-4 | `styles.css:4356` `.schedule-publish-action:disabled` duruyor. |
| BL-457 | Schedule | evet | W-4 | Hata durumundaki gezinmeye `returnCue` geçmiyor (`SchedulePage.tsx:1844-1855`). |
| BL-458 | Schedule | evet | W-2 | Karar var (karartmaya tık = Esc); kod W-2'de, W-2 başlamadı. |
| BL-478 | Employees | evet | C2 | Tab tuzağı yalnız create kipinde (`:902`) |
| BL-499 | Schedule | evet | W-4 | `DefaultHoursReviewDialog.tsx:92` "Saved shift type". |
| BL-513 | Requests | evet | C1 | Başlık sınıfı `ScheduleRequestsPage.tsx:360`; telefonda gizleyen kural `jobs-settings.css:1149` |
| BL-515 | Requests | evet | C3 | `CatalogDrawer.tsx:39-41` arka planı `inert` yapıyor; `<Toaster />` `App.tsx:144`'te, inert kalan tarafta |
| BL-522 | Schedule | evet | W-4 | `ScheduleRow.tsx:359` `data-overlap`, `useCellState.ts:216` `markConflict`. |
| BL-526 | Schedule | evet | W-2 | Müsaitlik hover balonu silindi (`e4231bfb`); öteki Tooltip'ler duruyor. |
| BL-577 | Schedule | evet | W-4 | `ShiftQuickEditor.tsx:1066` ile `SchedulePage.tsx:3035` iki ayrı cümle. |
| BL-580 | Requests | evet | C3 | `styles.css:7273` `.app-confirm` `calc(100vw - 28px)` |
| BL-589 | Requests | hayır | C3 | `font-weight: 850` / `900` 22 yerde (ör. `styles.css:268`, `:3154`) |
| BL-600 | Requests | evet | C3 | Token hâlâ `#aeb9b4` (`styles.css:85`); Mert `#7f8c86`'yı seçti (KARARLAR:531) |
| BL-602 | Requests | evet | C1 | `role="tab"` 15 dosyada; ok tuşu yalnız `ShiftCatalogTabs.tsx:22`'de |
| BL-604 | Requests | evet | C1 / C2 | `list-page` 7 dosyada; Requests, Employees, Locations, Jobs, Acknowledgements'ta yok |
| BL-608 | Schedule | evet | W-2 | W-2 başlamadı; dokunan commit yok. |
| BL-609 | Schedule | evet | W-4 | `data-paste-armed` CSS'i var (`styles.css:5867`) ama hiçbir bileşen koymuyor (grep 0). |
| BL-610 | Schedule | evet | W-2 | W-2 başlamadı. |
| BL-611 | Schedule | evet | W-4 | `DayHeaderCell.tsx:40` ve `scheduleFilterModel.ts:57` `${type}: ${title}` yazıyor. |
| BL-612 | Schedule | evet | W-2 | `ScheduleGridBody.tsx:284` `sr-only` "No employees". |
| BL-613 | Schedule | evet | W-4 | W-4 başlamadı. |
| BL-614 | Schedule | evet | W-4 | `SchedulePage.tsx:3176` `published_shift_count` → "changes". |
| BL-615 | Schedule | evet | W-4 | W-4 başlamadı; dokunan commit yok. |
| BL-617 | Schedule | evet | W-2 | Karar var (ilk tık yalnız menüyü kapatır); W-2 yok. `88f5e7a1` yalnız pencere içi basışı düzeltti. |
| BL-618 | Schedule | evet | W-4 | Şemsiye madde; W-4 başlamadı. |
| BL-653 | Requests | evet | C1 | `ScheduleRequestsPage.tsx:715` "until this is approved"; `:725` "Employee note"; `:764` "View-only access" |
| BL-655 | Schedule | evet | W-4 | `ScheduleTopBar.tsx:640` "Role Seperators". |
| BL-656 | Requests | evet | C3 | `ConfirmDialog.tsx:53` dönülecek öğeyi effect anında okuyor, `:85` geri dönüyor; dosya `6326f23a`'dan beri değ… |
| BL-657 | Requests | evet | C1 | `requests-catalog.css:218` `outline: none` |
| BL-658 | Requests | evet | C1 / C2 | `styles.css:13002` iç içe `li` de grid; `ShiftExchangeHub.tsx:810`, `:812` "Try another date range" |
| BL-661 | Requests | evet | C2 | `ShiftExchangeHub.tsx:1509`; `AvailabilityPage.tsx:152`; `JobAssignmentsDrawer.tsx:360`; `NotificationSettings… |
| BL-670 | Employees | evet | C1 | `EmployeesPage.tsx`'te `Escape` geçmiyor (0); seçenekler yalnız birincil lokasyondan (`:205`) |
| BL-674 | Requests | evet | C1 / C2 | `ScheduleRequestsPage.tsx:820` `toLocaleString()`; `ExchangeShiftCard.tsx:44` sabit `"12h"` |
| BL-694 | Schedule | evet | W-3 | Veri kapandı (`511aed11`/`3304a858`/`9b93169d`); `ScheduleTemplateDialogs.tsx:227-242` Overwrite hâlâ tek tık,… |
| BL-699 | Schedule | evet | W-3 | `templateApplyMessage.ts:28-38` `converted_open_count`'u okumuyor; dosya keşiften beri değişmedi |
| BL-705 | Schedule | evet | W-3 | `DraftDropdownMenu.tsx`'te "Save as template" yok (`git grep` boş) |
| BL-706 | Schedule | evet | W-2 | `SchedulePage.tsx:3456-3464` Enter odaktan bağımsız `onConfirm()` |
| BL-707 | Schedule | evet | W-2 | `ShiftQuickEditor.tsx:1025-1036` Delete tek tık, onay yok |
| BL-708 | Schedule | evet | W-3 | `SaveDraftDialog.tsx:44-74` "Overwrite draft" tek tık; menüdeki satır ConfirmButton |
| BL-710 | Schedule | evet | W-3 | `SchedulePage.tsx:3397` `` `${n} auto-fill assignment could not be applied.` `` |
| BL-711 | Schedule | evet | W-2 | Pencere dosyaları keşiften (`06a74d5a`) beri değişmedi |
| BL-712 | Schedule | evet | W-2 | styles.css'e yalnız VAR-UYG ve DRAG dokundu; sayaç rengi değişmedi |
| BL-713 | Schedule | evet | W-2 | `ScheduleLocationHeader.tsx` keşiften beri değişmedi |
| BL-714 | Schedule | evet | W-4 | `ScheduleGridHeaders.tsx` değişmedi (`onClick={onManageLogo}` :62; haftanın atlaması dış katmanda) |
| BL-715 | Schedule | evet | W-3 | `DefaultHoursReviewDialog` stil B'ye geçmedi (W-3 commit'i yok) |
| BL-716 | Schedule | evet | W-4 | ShiftQuickEditor'a yalnız `e986f346` dokundu (yerleşim değil) |
| BL-719 | Schedule | evet | W-3 | `ScheduleEditTimeoutDialog.tsx` yalnız "No activity for N minutes."; dosya değişmedi |
| BL-720 | Schedule | evet | W-4 | ShiftQuickEditor yerleşimi değişmedi |
| BL-721 | Schedule | evet | W-4 | Hafta seçici dosyası değişmedi |
| BL-723 | Schedule | evet | W-4 | (1) `SchedulePage.tsx:1829` "Resolving the published week." duruyor; (2)–(4) W-4 commit'i yok |
| BL-745 | Requests | evet | B2 | 409 notu çekmece kapanınca görünmez |
| BL-747 | Requests | hayır (ölü kod; 30 ham renk görünür) | B2 + C2 | `ScheduleRequestsPage.tsx:65` "Discard request decision?" sarmalayıcısı duruyor; `shift-exchanges.css` son com… |
| BL-748 | Requests | evet | C2 | `ShiftExchangeHub.tsx:1593` hâlâ `sx-primary`; CLAUDE.md §9 buton dili, KARARLAR KK-158 kırmızı iki tık |
| BL-750 | Requests | evet | C1 + C2 | "Awaiting manager" renk farkı kodda duruyor (`ShiftExchangeHub.tsx:51,57`) |
| BL-752 | Requests | hayır (ekran okuyucu) | C1 | `aria-pressed` ve satır adı sorunu kodda duruyor |
| BL-753 | Requests | evet | C2 | `ShiftExchangeHub.tsx:1437` "Cancel swap request", `:1478` "Close this search" |
| BL-754 | Requests | evet (klavye) | C1 | Odak sorunu `ScheduleRequestsPage` / çekmecede; dosya değişmedi |
| BL-777 | Employees | evet | B2 | `EmployeeDrawer.tsx:2029` "Preferred name" alanı yazılabilir; K2 salt okunur der |
| BL-778 | Employees | evet | C2 | `EmployeeDrawer.tsx` "Confirm termination" `Button` yeşil; K8 kırmızı iki tık |
| BL-779 | Employees | evet (klavye) | C2 + B2 | Terminate penceresi odak yönetimi değişmedi |
| BL-780 | Employees | evet | C1 | Satır odağı/Space kodda yok |
| BL-781 | Employees | evet | B2 | Çakışma yolu değişmedi |
| BL-782 | Employees | evet | C2 | CSS önceliği hatası duruyor |
| BL-783 | Employees | evet | C2 | Telefonda başlık/durum; G2 telefon listesi kararı bekliyor |
| BL-784 | Employees | evet | C2 | Tarayıcı kutucukları duruyor |

**nf-test** (4)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-217 | Requests | hayır | A1 | `shift_exchanges_v1.test.sql:163`, `:194`, `:196` seed lokasyonunun saat dilimini değiştiriyor |
| BL-229 | Requests | hayır | A1 | Pickup mesajını çalıştıran test yok; yalnız `shift_exchanges_v1:74`, `:78` |
| BL-438 | Employees | hayır | D | `getByLabel("E-mail")` `invite.spec.ts:75` ve `employee-onboarding.spec.ts:71`'de; "Emergency e-mail" `Employe… |
| BL-788 | Employees | hayır | süreç aracı | `scripts/inbox.mjs` son commit 940b6be0; 31649359'dan beri `scripts/` değişmedi |

### 3.3 Başka ekranın turu / düşük liste / MVP sonrası

**nf-db** (11)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-071 | Employees | hayır | düşük liste | `enum_range(membership_status)` = `{active,invited,…}`; `status='invited'` olan satır 0 |
| BL-153 | Employees | hayır | dışarıda: Availability | tetikleyicinin adı artık `availability_follows_role` (`20261007010000:571-620`); yine yalnız `workspace_member… |
| BL-352 | Employees | hayır | düşük liste | teslim sırrı temizliği 2026-09-09'dan beri var (tetikleyici `20260909180000:190-209`; bekleyen olmayan davetin… |
| BL-382 | Employees | evet | dışarıda: Onboarding (16) | SSN rotası `onboarding-routes.ts:68`; Privacy sayfasında SSN cümlesi `PublicTrustPages.tsx:98`; tablo duruyor |
| BL-452 | Employees | evet | dışarıda: Settings | `keep_manager_at_a_location` yalnız 4 yerden çağrılıyor; lokasyon silme/arşivleme yolu yok |
| BL-474 | Employees | evet | dışarıda: Settings | `primary_job_required` yalnız `save_employee_service`'te (pg_proc) |
| BL-487 | Employees | hayır | düşük liste | tetikleyici `a_owner_job_and_management_primary` var; `employee.management_primary` 1 fonksiyonda |
| BL-523 | Requests | hayır | — (Out of scope 4) | CHECK `scheduling_conflict_rules_valid`; zod `availability-assessment.ts:11`; web `schedule-conflicts.ts:23` |
| BL-544 | Requests | hayır | — (Out of scope 3) | `important_date_close_shifts` adımları kendisi yazıyor; ortak yardımcıyı yalnız yorumda anıyor ("the same step… |
| BL-557 | Employees | evet | dışarıda: Documents | API `exemption_locked`'a bakıyor (`document-lifecycle-service.ts:318`), DB `owner_excused`'a (`20261006000000:… |
| BL-560 | Employees | evet | dışarıda: Documents | 465 Manager rolünün hepsinde yalnız `employee_onboarding.review`; `role_default_permissions`'ta belge izni yok |

**nf-backend** (10)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-244 | Employees | evet | düşük liste | uyarı yalnız `props.creating`'de (`EmployeeDrawer.tsx:1156`) |
| BL-336 | Employees | evet | dışarıda: Onboarding (16) | `emailRedirectTo` yok, token saklayan `sessionStorage` yazımı yok (apps/web/src/auth) |
| BL-351 | Employees | hayır | dışarıda: Onboarding (16) | `?token=` hâlâ `invitation-service.ts:108,173`, `employee-create-service.ts:54`, `account-security-service.ts:… |
| BL-389 | Employees | evet | dışarıda: Workspaces hub | `InvitationRow.tsx:21-24` `account-attention`'ı yenilemiyor |
| BL-420 | Employees | evet | düşük liste | her hata `invitation_unavailable` oluyor (`employee-data.ts:528`) |
| BL-462 | Employees | evet | düşük liste | form kayıtlı role bakıyor: `managerRecord` `role_id`'den (`EmployeeDrawer.tsx:192-193`) |
| BL-463 | Employees | evet | düşük liste | `setRolePicked(null)` okumadan bağımsız (`:463`), düğme "Done" (`:1459`) |
| BL-488 | Employees | hayır | düşük liste | "Valid employee details required" `employee-directory-routes.ts:79`, `:467`, `:495` |
| BL-620 | Employees | evet | B1 (Employees yarısı) | ham `new Error(error.message)` `organization-data.ts:57`; "Failed to fetch" `EmployeeOnboardingPage.tsx:1145` |
| BL-624 | Employees | evet | dışarıda: Onboarding (16) | hazır workspace varsa davet atlanıyor (`resolveLanding.ts:118-123`) |

**nf-arayuz** (19)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-315 | Employees | hayır | dışarıda: Schedule | çekmece ve `primaryScheduleJobId` artık kümeyi yeniden kurmuyor; kalan: `rank` her modda kuruluyor (`scheduleE… |
| BL-366 | Employees | evet | düşük liste | taslak `useState(emptyDraft)` ile başlıyor, `setDraft(baseline)` effect'te (`EmployeeDrawer.tsx:160`, `:307`) |
| BL-402 | Employees | evet | düşük liste | sol sütun koşulsuz (`EmployeeDrawer.tsx:936`), erişim-yok dalı `:1087` |
| BL-403 | Employees | evet | dışarıda: Schedule | ad düğmesi kapı almıyor (`ScheduleEmployeeCard.tsx:62-72`); Availability'de pasif (`AvailabilityPage.tsx:248`) |
| BL-479 | Employees | evet | düşük liste | kapanınca odak açan satıra dönüyor ama satır gitmiş (`:729`) |
| BL-482 | Employees | evet | düşük liste | Jobs'ta `required` owner'a bakmıyor (`:2267`) |
| BL-484 | Employees | evet | düşük liste | ≤720 px'te `min-height: 40px` (`employee-location-parts.css:19-21`) |
| BL-485 | Employees | evet | düşük liste | `<label title={reason}>` (`EmployeeDrawer.tsx:3059`), kutucuk `disabled` |
| BL-512 | Requests | evet | — (Out of scope 5) | (1) tarih artık biçimli (`TimeOffPeriods.tsx:8` `formatTimeOffDay`); (2) `<legend className="sr-only">` (`Empl… |
| BL-554 | Employees | hayır | dışarıda: Documents | "Named people" `DocumentLifecycleFields.tsx:377`; tek kullanım `DocumentSettingsEditor.tsx:304` |
| BL-561 | Employees | evet | dışarıda: Documents | "Decision saved" çekmecenin kendi durumunda (`DocumentReviewDrawer.tsx:245`), kart kapanınca gidiyor (çıkarım) |
| BL-622 | Employees | evet | dışarıda: Onboarding (16) | etiket 750/700 (`styles.css:11220`, `:833`), alan `font: inherit` (`:860`) |
| BL-631 | Employees | evet | dışarıda: Onboarding (16) | yükleniyor dalı yok, yedek metin (`AcceptInvitationPage.tsx:52-53`) |
| BL-645 | Employees | evet | dışarıda: Onboarding (16) | metin `EmployeeOnboardingPage.tsx:918`; satırlarda "Needs changes" yok |
| BL-647 | Employees | evet | dışarıda: Onboarding (16) | `ready` yalnız `required` öğeye bakıyor (`:896-901`) |
| BL-648 | Employees | evet | dışarıda: Onboarding (16) | "Continue" her zaman açık, `onDone` (`OnboardingDocumentStep.tsx:255`) |
| BL-649 | Employees | evet | dışarıda: Onboarding (16) | `textarea` kuralı yok; ikon yalnız profilde |
| BL-662 | Employees | evet | dışarıda: Settings | Employees doğru söylüyor: "No archived employees" / "No matching employees" (`EmployeesPage.tsx:443-454`); Loc… |
| BL-673 | Employees | evet | dışarıda: Documents | servis süresi dolmuş belgeyi reddediyor (prosrc'ta `expired`); Approve koşulsuz (`DocumentReviewDrawer.tsx:922… |

**nf-test** (5)

| BL | Ekran | Görünür | Dilim | Kanıt (kısa) |
|---|---|---|---|---|
| BL-434 | Employees | hayır | dışarıda: Onboarding (16) | yalnız "I already have an account" yolu var (`invite.spec.ts:88`) |
| BL-460 | Employees | hayır | düşük liste | `clearAllMocks` yalnız `EmployeeDrawer.test.tsx:562`; yama notları `:1264`, `:2133`, `:2488` |
| BL-464 | Employees | hayır | düşük liste | 50 ms sabit bekleme `EmployeeDrawer.create.test.tsx:319` |
| BL-492 | Employees | hayır | düşük liste | `management_owner_job.test.sql`'de "yalnız Owner işiyle kayıt" için `lives_ok` hücresi yok |
| BL-519 | Requests | hayır | A1 (dokunulursa) / Out of scope 3 | Ham `set status`: `weekly_assignment_candidates:96`, `weekly_exchange_acceptance:87`, `weekly_shift_availabili… |

## 4. (b) Karar ister — sabah Mert'e

| BL | Ekran | Sahip | Dilim | Neden karar |
|---|---|---|---|---|
| BL-038 | Schedule | nf-arayuz | W-3 | 5 karar açık |
| BL-041 | Requests | — | – | Tur kapanınca kapanır |
| BL-050 | Schedule | – | – | MVP sonrası |
| BL-057 | Requests | — | – | "Time Tracking gizlenir" kısmı bayat; sekme düzeni ekran 13'ün kararı (Out of scope 1) |
| BL-067 | Schedule | – | – | b |
| BL-101 | Schedule | – | – | Kalan: anahtar Mert'in kararı (BL-027) |
| BL-122 | Schedule | – | – | MVP sonrası; görünür kısmı BL-612 |
| BL-123 | Schedule | – | – | MVP sonrası |
| BL-126 | Schedule | – | – | b |
| BL-200 | Requests | nf-backend | B1 | Teknik karar (P19, Claude verir); önce ölçüm |
| BL-218 | Schedule | nf-db / nf-backend | – | Kararlar hazır; özellik işi, hata düzeltmesi değil |
| BL-362 | Requests | — | — (Out of scope 3) | Yeni davranış; Schedule ekranının |
| BL-364 | Requests | — | V (G3) → A3 / C1 | KARARLAR:533 G3 hâlâ açık |
| BL-410 | Requests | — | — (Out of scope 2) | Gizlemek yeni davranış (KK-32 (c) 0'ı bırakmıştı) |
| BL-425 | Employees | nf-arayuz | düşük liste | 390 px ekranda bakılmadı |
| BL-430 | Employees | nf-arayuz | C2 | b) küçük görsel seçim |
| BL-439 | Employees | nf-arayuz | düşük liste | piksel ölçülmedi |
| BL-445 | Schedule | nf-arayuz | W-5 | Mert'in görsel seçimi |
| BL-459 | Employees | nf-arayuz | düşük liste | b) yerleşim |
| BL-465 | Employees | nf-backend | düşük liste | b) çare seçilmedi |
| BL-472 | Employees | nf-arayuz | düşük liste | b) metin |
| BL-473 | Employees | nf-arayuz | düşük liste | b) metin |
| BL-477 | Employees | nf-backend | düşük liste | b) yeni geri bildirim |
| BL-483 | Employees | nf-arayuz | düşük liste | `data-locked-reason` kuralı CSS'te bulunmadı |
| BL-493 | Employees | nf-db | düşük liste | b) kural |
| BL-506 | Requests | nf-db | A3 | Teknik ödünleşim (P19) |
| BL-585 | Employees | nf-arayuz | dışarıda: Documents | b) davranış |
| BL-586 | Employees | nf-arayuz | C1 (G2) | piksel ölçülmedi |
| BL-588 | Employees | nf-arayuz | Employees: C1 (G2) / Settings: dışarıda | piksel ölçülmedi |
| BL-599 | Employees | nf-arayuz | C1 (G2) | genel kart satırı kararı var |
| BL-646 | Employees | nf-arayuz | dışarıda: Onboarding (16) | b) maddenin kendisi "karar gerekir" diyor |
| BL-652 | Requests | — | — (Out of scope 1) | Geçmiş ne kadar geriye gitsin: Mert'e soru (KK-143) |
| BL-663 | Requests | nf-arayuz | C3 | KARARLAR'da kural yok; ortak değer olduğu için önce kural yazılır |
| BL-702 | Schedule | nf-db | DB-1a kalanı | b) ad benzersizliği lokasyon başına mı |
| BL-717 | Schedule | nf-arayuz | VAR→W-5 | öneri B |
| BL-722 | Schedule | nf-arayuz | W-4 | b) hangi yüzey kalır |
| BL-728 | Requests | nf-db + nf-backend + nf-arayuz | A3 + B2 | Karar yazılı ama yeni davranış (okuma izni, kapalı düğme, not metni); `requests.read` kapısı değişir, risky |
| BL-729 | Requests | nf-db + nf-backend | A3 + B2 | Sıralama kuralı tek tablo tasarımıyla yeniden yazılacak; BL-724 sonrası sırayı koruyan imleç gerekir |
| BL-730 | Requests | nf-db | A3 | "Tek karar tek bildirim" KK-158'de yazılı ama hangi bildirimin kalacağı yeni mantık |
| BL-731 | Requests | nf-db | A2 | Müdürsüz lokasyonda yedek alıcı yeni mantık |
| BL-732 | Requests | nf-db + nf-backend | A3 + B1 | İzin anahtarı kalkar; shared + Roles ekranı etkilenir |
| BL-735 | Requests | nf-db + nf-arayuz | A2 + B2 | Yeni okuma yetkisi |
| BL-736 | Requests | nf-db | A3 | "Onaylayan herkese" yeni alıcı mantığı |
| BL-740 | Requests | nf-arayuz | B2 | Closed'daki talebi bildirimden açma davranışı yeni; tek tablo kararıyla birleşir |
| BL-744 | Requests | nf-arayuz | B2 | Yeni gizleme kuralı |
| BL-749 | Requests | nf-arayuz | C1 | Büyük olasılıkla kendiliğinden kapanır; tasarım sonrası yeniden ölç |
| BL-751 | Requests | nf-arayuz | C1 | Yeni metin (P21), yerine ne yazılacağı karar |
| BL-768 | Employees | nf-db | A1 + A3 | KK-174 KARARLAR'da değil, yalnız BACKLOG/EKRAN-PLANI'nda; yeni bildirim kuralı |
| BL-771 | Employees | nf-db + nf-arayuz | A1 + B2 | Karar yalnız görev dosyasında; KARARLAR'a işlenmeli |
| BL-786 | Employees | nf-db + nf-arayuz | A4 + C2 | Kim ve lokasyon yazması yeni veri |
| BL-787 | Employees | nf-arayuz (ortak bileşen) | EKRAN-02 C3 + her ekranın turu | Karar var ama yeni özellik; sınıfı (a) değil |

## 5. Kayıtta düzeltilecekler (ajanların bulduğu)

- KARARLAR:549 hâlâ "S7 görsel karar bekliyor" diyor; KARARLAR:531'de karar var (`#7f8c86`). BL-450 ve BL-600 aynı token değişikliği; değişince `--theme-text-faint` da koyulaşır (C3'te bakılmalı).
- BL-352'nin ana iddiası ("davet kapanınca sır silinmiyor") yanlış; açık kalan yalnız `employee_create_commands.invitation_token` düz metin — madde metni yeniden yazılmalı.
- BL-662: Employees yarısı bayat; EKRAN-03 C2 (E3-37) eşlemesinden çıkarılabilir.
- BL-746'nın metni web'de değil, katalog satırında (`20260821100000_schedule_requests.sql:4`); sahibi `nf-db`.
- BL-494: kararı var (2026-10-01), BE-1 veri hattına devretti, iş açılmadı; DB-4'e eklenmesi önerildi.
- BL-768 (KK-174) ve BL-771 (Q1) kararları KARARLAR'da yok; yalnız BACKLOG / görev dosyasında.
- BL-183'ün kapanış kanıtı eskimiş (`notify_owner_time_off_open_shifts` kalktı, yerine `app_private.time_off_notify_shifts_opened`).
- Kısmi kapanışlar (madde açık, parçası kapandı): BL-282 (CSV formülü), BL-694 (veri), BL-702 (ad sızıntısı), BL-168 (web yarısı), BL-280 (4).
