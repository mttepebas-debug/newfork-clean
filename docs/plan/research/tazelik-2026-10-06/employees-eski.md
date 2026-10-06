## Employees backlog tazeliği: `origin/main` `9146ba6b`

**Ne ölçtüm:** 77 maddeyi bugünkü `origin/main` `9146ba6b` üstünde yeniden ölçtüm. Tazelemeden sonra gelen 8 commit'in koda dokunanı yalnız bir Schedule Undo migration'ı; Employees'e değen kod yok. Yerel DB main'le aynı (437 migration, son `20261007130000`). Yalnız kod okudum, git ve SELECT çalıştırdım; test koşmadım, dosya yazmadım.

**Sonuç:** 1 madde bayat (BL-042), 6 madde değişmiş, 70 madde geçerli. Hiçbir madde tamamen kapanmış değil, ama üç maddenin bir parçası artık kapalı (aşağıda).

**Eski satır numaraları:** Employees'in web ve API dosyaları 2026-10-04'ten (`6326f23a`) bu yana değişmedi. O tarihten sonra yazılmış satır numaraları hâlâ doğru; daha eskiler kayık ve tabloda yeniden ölçüldü.

**Elle doğrulama:** BL-338'de sayının fazla düzgün olup olmadığına baktım. 77 kişiden 4'ünü tek tek açtım: Employee Demo, Pending Demo ve Suspended Demo'nun owner'ı `b0000000-…-0001` ile "New workspace"in owner'ı. Dördünün de çalışan kaydı 0; ölçüm doğru.

| BL | hüküm | kanıt | sınıf | sahip | görünür | dilim | not |
|---|---|---|---|---|---|---|---|
| 042 | bayat | ölçülecek bir iddia yok ("drawer UI polish"); işi EKRAN-03 C2 ve ayrı BL'ler aldı | — | — | — | — | kapatılması öneriliyor |
| 071 | geçerli | `enum_range(membership_status)` = `{active,invited,…}`; `status='invited'` olan satır 0 | (a) teknik borç, karar gerekmez | nf-db | hayır | düşük liste | risky |
| 079 | geçerli | `person_display_name` yok (0); `first_name` okuyan 46 fonksiyon, `preferred_name` okuyan 33 (pg_proc) | (a) | nf-db | evet | A4 | sayılar 43/34'ten değişti |
| 153 | değişmiş | tetikleyicinin adı artık `availability_follows_role` (`20261007010000:571-620`); yine yalnız `workspace_memberships`'e bakıyor, `employee_profiles.user_id` yolu açık | (a) KARARLAR M14 | nf-db | hayır | dışarıda: Availability | |
| 244 | geçerli | uyarı yalnız `props.creating`'de (`EmployeeDrawer.tsx:1156`) | (a) açık hata | nf-backend | evet | düşük liste | |
| 259 | geçerli | `#cbd2ce` hâlâ `styles.css:1970` ve `:2640`'ta | (a) UI-09 | nf-arayuz | evet | C1+C2 | |
| 282 | değişmiş | CSV düzelmiş (`schedule-export.ts:451` formül başına `'` ekliyor); Employees listesi hâlâ `page_limit: 100` (`employee-directory-service.ts:226`); cron `!==` 4 kopya duruyor | (a) KARARLAR Genel :302 sayfalama | nf-db + nf-backend + nf-arayuz | evet | A4+B1+C1 | yalnız Employees kalemi bu ekranın işi |
| 315 | değişmiş | çekmece ve `primaryScheduleJobId` artık kümeyi yeniden kurmuyor; kalan: `rank` her modda kuruluyor (`scheduleEmployeeSort.ts:36-41`), ızgara modeli `useMemo` dışında (`ScheduleGrid.tsx:206`) | (a) temizlik | nf-arayuz | hayır | dışarıda: Schedule | |
| 336 | geçerli (kod) | `emailRedirectTo` yok, token saklayan `sessionStorage` yazımı yok (apps/web/src/auth) | (a) P10 | nf-backend + nf-arayuz | evet | dışarıda: Onboarding (16) | hosted akış ölçülmedi |
| 338 | geçerli | 464 aktif owner'ın 77'sinin arşivsiz kaydı yok (SELECT, 4'ü elle doğrulandı); "her owner'ın kaydı var" pgTAP değişmezi yok | (a) "eski veri korunmaz" | nf-db + nf-test | evet | A4 | |
| 351 | geçerli | `?token=` hâlâ `invitation-service.ts:108,173`, `employee-create-service.ts:54`, `account-security-service.ts:226`'da | (a) güvenlik | nf-backend | hayır | dışarıda: Onboarding (16) | |
| 352 | değişmiş | teslim sırrı temizliği 2026-09-09'dan beri var (tetikleyici `20260909180000:190-209`; bekleyen olmayan davetin sırrı 0); `employee_create_commands.invitation_token` düz metin, 1833 satır | (a) | nf-db | hayır | düşük liste | |
| 366 | geçerli | taslak `useState(emptyDraft)` ile başlıyor, `setDraft(baseline)` effect'te (`EmployeeDrawer.tsx:160`, `:307`) | (a) veri kaybı hatası | nf-arayuz | evet | düşük liste | B2 ile aynı dosya |
| 382 | geçerli | SSN rotası `onboarding-routes.ts:68`; Privacy sayfasında SSN cümlesi `PublicTrustPages.tsx:98`; tablo duruyor | (a) ROADMAP "SSN yok" | nf-db + nf-backend | evet | dışarıda: Onboarding (16) | Privacy metni R0 |
| 383 | geçerli | gövde doğrulaması yetkiden önce (`employee-directory-routes.ts:462-467` → `resolveActor` sonra) | (a) CLAUDE.md §9 "hayır" sözleşmesi | nf-backend | hayır | B1 | |
| 388 | geçerli | iki servisin prosrc'unda `at time zone` var, `time_timezone` ve taslak tablosu yok | (a) saat dilimi + (b) taslak kuralı | nf-db | evet | A1+B2 | taslak yarısı karar ister |
| 389 | geçerli | `InvitationRow.tsx:21-24` `account-attention`'ı yenilemiyor | (a) açık hata | nf-backend | evet | dışarıda: Workspaces hub | |
| 401 | geçerli | prosrc sırası: `42501 authz.rank`, sonra `P0002` | (a) §9 (bilinmeyen ve kapsam dışı aynı cevap) | nf-db | evet | B1+A1 | |
| 402 | geçerli | sol sütun koşulsuz (`EmployeeDrawer.tsx:936`), erişim-yok dalı `:1087` | (a) açık hata | nf-arayuz | evet | düşük liste | |
| 403 | geçerli | ad düğmesi kapı almıyor (`ScheduleEmployeeCard.tsx:62-72`); Availability'de pasif (`AvailabilityPage.tsx:248`) | (a) görsel tutarlılık | nf-arayuz | evet | dışarıda: Schedule | |
| 407 | geçerli | telefonda gizli: `styles.css:2745-2747` `display: none` | (a) KARARLAR :376 | nf-arayuz | evet | C2 | |
| 408 | geçerli | "Profile photo removal" her durumda (`EmployeeDrawer.tsx:2677`); salt okunurda düğme "Cancel" (`:1297`) | (a) K10 | nf-arayuz | evet | C2 | |
| 419 | geçerli | davet rotası `app.ts:544` ve `prepare_employee_invitation_service`'te kurulum kontrolü yok | (a) Mert 2026-10-01 "kurulum bitmeden davet yok" | nf-db | hayır | A3 | |
| 420 | geçerli | her hata `invitation_unavailable` oluyor (`employee-data.ts:528`) | (a) §9 403 sözleşmesi | nf-backend | evet | düşük liste | BL-401 ile |
| 425 | geçerli (kod) | telefon alt çubuk kuralı `styles.css:2741-2747` | (b) görsel varyant | nf-arayuz | evet | düşük liste | 390 px ekranda bakılmadı |
| 428 | geçerli | hücre `primary_location_name ?? "Unassigned"` + `+N` (`EmployeeLocationParts.tsx:115-117`) | (a) G3 "Kadikoy +1" | nf-db + nf-arayuz | evet | A4+C1 | |
| 429 | değişmiş | neden artık ekran okuyucuya bağlı (`EmployeeLocationParts.tsx:69`); düğme `disabled` olduğu için klavye odağı almıyor (`:67`) | (a) WCAG klavye | nf-arayuz | evet | C1+C2 | |
| 430 | geçerli | seçici yalnız `assignableRoles.length === 0` iken pasif (`EmployeeDrawer.tsx:2501`) | (b) küçük görsel seçim | nf-arayuz | evet | C2 | |
| 434 | geçerli | yalnız "I already have an account" yolu var (`invite.spec.ts:88`) | (a) test boşluğu | nf-test | hayır | dışarıda: Onboarding (16) | |
| 436 | geçerli | süzgeç `primary_location_id` ile eşliyor (`EmployeesPage.tsx:205-222`) | (a) K6 | nf-db + nf-backend | evet | A4+C1 | |
| 438 | geçerli | `getByLabel("E-mail")` `invite.spec.ts:75` ve `employee-onboarding.spec.ts:71`'de; "Emergency e-mail" `EmployeeDrawer.tsx:2104` | (a) test | nf-test | hayır | D | iki spec'te |
| 439 | geçerli (kod) | durum simgesi alanın içinde (`EmployeeDrawer.tsx:2942`) | (b) görsel | nf-arayuz | evet | düşük liste | piksel ölçülmedi |
| 452 | geçerli | `keep_manager_at_a_location` yalnız 4 yerden çağrılıyor; lokasyon silme/arşivleme yolu yok | (a) K4 (KARARLAR :84) | nf-db | evet | dışarıda: Settings | |
| 456 | geçerli | aynı çağrı listesi; davet kabulü ve `set_employee_archived_service` çağırmıyor | (a) K4 | nf-db | evet | A1+A3 | |
| 459 | geçerli | cümle alt çubukta (`EmployeeDrawer.tsx:1241-1243`) | (b) yerleşim | nf-arayuz | evet | düşük liste | |
| 460 | geçerli | `clearAllMocks` yalnız `EmployeeDrawer.test.tsx:562`; yama notları `:1264`, `:2133`, `:2488` | (a) test | nf-test | hayır | düşük liste | |
| 462 | geçerli | form kayıtlı role bakıyor: `managerRecord` `role_id`'den (`EmployeeDrawer.tsx:192-193`) | (a) açık hata | nf-backend | evet | düşük liste | |
| 463 | geçerli | `setRolePicked(null)` okumadan bağımsız (`:463`), düğme "Done" (`:1459`) | (a) açık hata | nf-backend | evet | düşük liste | |
| 464 | geçerli | 50 ms sabit bekleme `EmployeeDrawer.create.test.tsx:319` | (a) test | nf-test | hayır | düşük liste | (a) ve (b) yeniden ölçülmedi |
| 465 | geçerli | `if (!busy) props.onClose()` (`:723`); fetch'te `signal` yok | (b) çare seçilmedi | nf-backend | evet | düşük liste | |
| 472 | geçerli | üç yazı `:2606`, `:2677`, `:2694` | (b) metin | nf-arayuz | evet | düşük liste | |
| 473 | geçerli | `disabled={!hasAvatar…}`, nedeni söyleyen metin yok | (b) metin | nf-arayuz | evet | düşük liste | |
| 474 | geçerli | `primary_job_required` yalnız `save_employee_service`'te (pg_proc) | (a) KARARLAR :84 | nf-db | evet | dışarıda: Settings | |
| 477 | geçerli | bildirim yalnız lokasyondan çıkarmada (`:615`) | (b) yeni geri bildirim | nf-backend | evet | düşük liste | |
| 478 | geçerli | Tab tuzağı yalnız create kipinde (`:902`) | (a) WCAG 2.4.3 | nf-arayuz | evet | C2 | |
| 479 | geçerli | kapanınca odak açan satıra dönüyor ama satır gitmiş (`:729`) | (a) WCAG odak | nf-arayuz | evet | düşük liste | |
| 482 | geçerli | Jobs'ta `required` owner'a bakmıyor (`:2267`) | (a) KARARLAR :84 owner istisnası | nf-arayuz | evet | düşük liste | |
| 483 | geçerli | `employee-location-parts.css:26` `data-locked` | (b) görsel seçim | nf-arayuz | evet | düşük liste | `data-locked-reason` kuralı CSS'te bulunmadı |
| 484 | geçerli (kod) | ≤720 px'te `min-height: 40px` (`employee-location-parts.css:19-21`) | (a) görsel tutarlılık | nf-arayuz | evet | düşük liste | piksel ölçülmedi |
| 485 | geçerli | `<label title={reason}>` (`EmployeeDrawer.tsx:3059`), kutucuk `disabled` | (a) WCAG klavye | nf-arayuz | evet | düşük liste | |
| 487 | geçerli | tetikleyici `a_owner_job_and_management_primary` var; `employee.management_primary` 1 fonksiyonda | (a) ad temizliği | nf-db + nf-backend | hayır | düşük liste | |
| 488 | geçerli | "Valid employee details required" `employee-directory-routes.ts:79`, `:467`, `:495` | (a) G11 | nf-backend | hayır | düşük liste | |
| 492 | geçerli | `management_owner_job.test.sql`'de "yalnız Owner işiyle kayıt" için `lives_ok` hücresi yok | (a) test | nf-test | hayır | düşük liste | |
| 493 | geçerli | `remove_employee_from_location_service` arşivli lokasyonu ayırmıyor (prosrc'ta `archived_at` yok) | (b) kural | nf-db | evet | düşük liste | |
| 503 | geçerli | e-posta tekil indeksi yok; aynı workspace'te 2 yinelenen çift (SELECT); telefon ipucu `ProfilePage.tsx:523` | (a) KARARLAR "Form ve girdi kuralları" | nf-db + nf-backend | evet | A2+B2 | |
| 554 | geçerli | "Named people" `DocumentLifecycleFields.tsx:377`; tek kullanım `DocumentSettingsEditor.tsx:304` | (a) ölü kod | nf-arayuz | hayır | dışarıda: Documents | |
| 557 | geçerli | API `exemption_locked`'a bakıyor (`document-lifecycle-service.ts:318`), DB `owner_excused`'a (`20261006000000:1764`) | (a) açık hata | nf-db + nf-backend | evet | dışarıda: Documents | |
| 560 | geçerli | 465 Manager rolünün hepsinde yalnız `employee_onboarding.review`; `role_default_permissions`'ta belge izni yok | (a) KARARLAR M2 | nf-db | evet | dışarıda: Documents | risky |
| 561 | geçerli (kısmen ölçüldü) | "Decision saved" çekmecenin kendi durumunda (`DocumentReviewDrawer.tsx:245`), kart kapanınca gidiyor (çıkarım) | (a) açık hata | nf-arayuz | evet | dışarıda: Documents | çalıştırılmadı |
| 585 | geçerli | "exemptions remain in effect" `DocumentLifecycleFields.tsx:400`; muafları soran önizleme yok | (b) davranış | nf-arayuz | evet | dışarıda: Documents | |
| 586 | geçerli (kod) | Inter yüklü (`styles.css:5`); "No app access" `EmployeesPage.tsx:666` | (b) telefon listesi kararına (G2) bağlı | nf-arayuz | evet | C1 (G2) | piksel ölçülmedi |
| 588 | geçerli (kod) | "Manage logo" `GeneralSettingsPage.tsx:142` | (b) G2 (Employees yarısı) | nf-arayuz | evet | Employees: C1 (G2) / Settings: dışarıda | piksel ölçülmedi |
| 599 | geçerli | `.notification-table { min-width: 720px }` (`styles.css:13861`) | (b) Employees için G2 açık | nf-arayuz | evet | C1 (G2) | genel kart satırı kararı var |
| 620 | geçerli | ham `new Error(error.message)` `organization-data.ts:57`; "Failed to fetch" `EmployeeOnboardingPage.tsx:1145` | (a) G11, P21 | nf-backend | evet | B1 (Employees yarısı) | onboarding yarısı dışarıda |
| 621 | geçerli | ham zod mesajı `EmployeeOnboardingPage.tsx:591`, `WeeklyPreferencesForm.tsx:118-121` | (a) G11, P21 | nf-backend | evet | B1 (Employees yarısı) | |
| 622 | geçerli | etiket 750/700 (`styles.css:11220`, `:833`), alan `font: inherit` (`:860`) | (a) görsel tutarlılık | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 624 | geçerli | hazır workspace varsa davet atlanıyor (`resolveLanding.ts:118-123`) | (a) KARARLAR "Katılım" | nf-backend | evet | dışarıda: Onboarding (16) | |
| 631 | geçerli | yükleniyor dalı yok, yedek metin (`AcceptInvitationPage.tsx:52-53`) | (a) açık hata | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 645 | geçerli | metin `EmployeeOnboardingPage.tsx:918`; satırlarda "Needs changes" yok | (a) açık hata | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 646 | geçerli | `awaiting_review` tamam sayılıyor (`:244`, `:900`) | (b) maddenin kendisi "karar gerekir" diyor | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 647 | geçerli | `ready` yalnız `required` öğeye bakıyor (`:896-901`) | (a) açık hata | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 648 | geçerli | "Continue" her zaman açık, `onDone` (`OnboardingDocumentStep.tsx:255`) | (a) açık hata | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 649 | geçerli | `textarea` kuralı yok; ikon yalnız profilde | (a) görsel tutarlılık | nf-arayuz | evet | dışarıda: Onboarding (16) | |
| 662 | değişmiş | Employees doğru söylüyor: "No archived employees" / "No matching employees" (`EmployeesPage.tsx:443-454`); Locations (`LocationsSettingsPage.tsx:382`, arama var) ve Acknowledgements (`:1387`) geçerli | (a) P21 | nf-arayuz | evet | dışarıda: Settings | Employees yarısı bayat; C2 eşlemesinden çıkmalı |
| 669 | geçerli | "Onboarding in progress" `EmployeeDrawer.tsx:2449` (dosya `6326f23a`'dan beri değişmedi) | (a) K9 + prototip AC4, E10 | nf-backend + nf-arayuz | evet | B2+C2 | |
| 670 | geçerli | `EmployeesPage.tsx`'te `Escape` geçmiyor (0); seçenekler yalnız birincil lokasyondan (`:205`) | (a) K6 + prototip L7, L11 | nf-arayuz | evet | C1 | |
| 673 | geçerli | servis süresi dolmuş belgeyi reddediyor (prosrc'ta `expired`); Approve koşulsuz (`DocumentReviewDrawer.tsx:922`) | (a) açık hata | nf-arayuz | evet | dışarıda: Documents | |

**DONE.md için etki cümlesi önerisi:**
- **BL-042:** "Employee drawer polish" genel maddesi kapatıldı; somut parçaları EKRAN-03 C2'de ve ayrı numaralı maddelerde izleniyor. Ekranda değişen bir şey yok.
- **Madde açık kalan ama parçası kapanmış üç durum:** bunları maddenin altına not olarak yazmak daha doğru, DONE.md'ye satır olarak değil.
  - **BL-282:** CSV formül enjeksiyonu kapanmış: `schedule-export.ts:451` hücre başına `'` ekliyor.
  - **BL-352:** davet kapanınca teslim sırrı zaten siliniyor (tetikleyici 2026-09-09'dan beri). Açık kalan: `invitation_token` düz metin.
  - **BL-662:** Employees'in boş hâli doğru metni gösteriyor ("No archived employees" / "No matching employees"). Açık kalan: Settings'teki iki sayfa.

**Ölçülemeyenler:**
- **Piksel ölçümü:** BL-425, 439, 484, 586, 588, 599. Koda baktım, ekran görüntüsü almadım.
- **Hiç çalıştırılmadı:** BL-561 (bildirim kaybı zamanlamaya bağlı, kod okumasından çıkarım) ve BL-336 (hosted e-posta onay akışı).
- **Yeniden ölçülmedi:** BL-464'ün (a) ve (b) yarıları; BL-282'nin "140 indekssiz yabancı anahtar" ve "ölü RLS" kalemleri.

**Koordinatörün bilmesi gereken üç düzeltme:**
- **BL-662:** EKRAN-03 görev dosyasında C2 dilimine (E3-37) bağlı. Employees yarısı bayat olduğu için oradan çıkarılabilir.
- **BL-352:** maddenin ana iddiası ("davet kapanınca silinmiyor") yanlış; madde metni yeniden yazılmalı.
- **BL-438:** aynı seçici tuzağı ikinci bir spec dosyasında da var: `employee-onboarding.spec.ts:71`.
