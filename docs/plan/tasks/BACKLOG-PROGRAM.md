# BACKLOG-PROGRAM Backlog programı — gruplar ve iş sırası
Status: draft (2026-09-29; `nf-planlama`, koordinatör görevi; tazelik yalnız ilk 3 grupta; GK önerileri ve G0 yapıldı)
Session: -   Branch: task/backlog-program-2 (önceki `task/backlog-program-planlama` main'de)   Worktree: -   DB: -
Reviewer: koordinatör (plan); her grup kendi DELEGASYON sınıfına göre incelenir.

Kaynak: kullanıcı kararı 2026-09-29 (koordinatör aktardı): backlog önem sırasına ve birbirine yakınlığa göre gruplanıp sırayla düzeltilecek; her maddenin tazeliği kontrol edilecek; işe başlamadan plan; aynı anda en çok 2 iş, çakışmasız; testler toplu; biten iş kayda geçer. FB-6.2.1 bu program boyunca park (kullanıcı kararı).

Goal: `docs/plan/BACKLOG.md`'deki bütün açık maddeleri gruplara bölmek, grupları önem ve maliyete göre sıralamak, aynı anda koşabilecek ikilileri ve toplu test turlarını belirlemek. Koordinatör işleri bu sırayla dağıtır.

In scope: açık maddelerin ("Kapanan maddeler" başlığının üstü, numarasızlar dahil) gruplanması; sıra ve gerekçe; karar bekleyenlerin soruları; bayat görünenlerin işaretlenmesi; ilk 3 grubun tazeliği (BACKLOG.md'de maddelerin altında); toplu test turları; BL-332 ve BL-333.

Out of scope: kod değişikliği; madde düzeltme; G4 ve sonrasının tazeliği (sırası gelince); CLAUDE.md.

Done when:
1. Her açık madde tam bir grupta (sayım aşağıda, betikle doğrulandı).
2. İlk 3 grubun (G1, G2, G3) tazelik hükümleri BACKLOG.md'de maddelerin altında.
3. BL-332 ve BL-333 BACKLOG.md'de.
4. ILERLEME-PLANI.md'de "Backlog programı (2026-09-29)" bölümü.

Touches: yalnız `docs/plan/**`.

Test plan: kod yok. Sayım betikle yapıldı: açık madde listesi `BACKLOG.md` satır 1–414'ten çıkarıldı, her madde kimliği gruplarda bir kez sayıldı (kopya 0, eksik 0, fazla 0).

Risk:
- **Stil B ile çakışma — çözüldü (KK-4).** G1 ve G14, stil B mockup dalının (`task/schedule-dialog-mockups`) pencerelerine dokunuyor; o dal yalnız yerel DEV mockup, seçilen stil B zaten main'de (`228ff3b7`). G1 ve G14 o dalı beklemez, sıra aynı.
- **G7 ile FB-6.2 örtüşmesi — çözüldü (KK-5).** G7 ayrı iş olarak açılmaz: sırası gelince FB-6.2.1'in görev dosyası açılır, G7'nin 17 maddesi onun kapsamına girer (`nf-db`, R3, `nf-guvenlik` zorunlu).
- **Bayat maddeler sırada yer tutar.** Tazelik yalnız ilk 3 grupta yapıldı; sonraki gruplarda bir kısmı bayat çıkabilir (aşağıdaki "Bayat görünenler"). Her grup başlamadan önce ölçülür (CLAUDE.md §5 adım 0).

## Sayım (2026-09-29, `origin/main` `3a31d625`)
- Açık madde: **286** (numaralı 220, numarasız 66) + yeni BL-332, BL-333, BL-334, BL-335 = **290**.
- Gruplardaki madde toplamı: **290**. Kopya 0, eksik 0, fazla 0.
- Numarasız maddelere bu dosyada `U01`…`U66` takma adı verildi (BACKLOG.md'deki sırayla, açık bölümde yukarıdan aşağı). Kalıcı numara verilmedi; G0 onları ya kapatır ya numaralar.
- İki numara açık bölümde iki kez geçiyor: BL-070 (satır 116 madde, satır 194 bağlantı notu) ve BL-091 (satır 136 kapanmış satır, satır 195 bağlantı notu). İkisi de ayrı satır olarak sayıldı; notlar G0'da.

## İş sırası
**Önce Account yeniden tasarımı (koordinatör kararı KK-1, 2026-09-29):** programda şu an tek iş Account yeniden tasarımı (Account → Profile, Security, Preferences, Notifications, Workspaces, Documents; `task/account-redesign`, `nf-arayuz`). Aşağıdaki grupların kod işleri o iş main'e girince başlar; bu plan (yalnız `docs/plan`) bu sırada hazırlanır. Etkisi: G16 ile BL-335 (iki telefon), BL-072 (iki avatar), BL-149 (Workspaces listesi bayat), BL-287, BL-331 ve BL-147 Account ekranlarına dokunuyor; tasarım main'e girince tazelikleri yeniden ölçülür.

**Açık sorulara koordinatör cevabı (2026-09-29):** KK-4 — G1 ve G14 stil B mockup dalını beklemez (stil B main'de, `228ff3b7`), sıra aynı. KK-5 — G7 FB-6.2.1'in kapsamı olarak yürür; ayrı G7 işi açılmaz, sıra 7'de FB-6.2.1 görev dosyası açılır.

Sıralama kuralı: önce en yüksek "leave" (critical yok; high); aynı önemde ucuz ve güvenli (do: safe) öne; bağımlılık korunur. Karar bekleyen, FOUNDATION-B'ye bağlı, yol haritası ve MVP sonrası grupları sıraya girmez (aşağıda). G0 sıradan bağımsızdır, her an paralel koşar.

| Sıra | Grup | Tema | Maddeler | En yüksek leave / do | Risk sınıfı | Yazacak rol | Süre (tahmin) |
|---|---|---|---|---|---|---|---|
| 0 | **GA** | Account ardı: telefonun tek kaynağı hesap (KK-7) | BL-335 | low / moderate | R3 (kullanıcı adına kiracı tablosuna yazan tetikleyici) | `nf-db` | 0,5–1 gün |
| 1 | **G1** | Schedule taslak ve yayın pencereleri — davranış hataları | BL-299 BL-300 BL-301 BL-302 BL-303 BL-306 BL-310 BL-323 BL-181 BL-329 BL-313 BL-108 BL-309 | high / safe | R1 (BL-302 ekranda izin gösterimi; veri sözleşmesi değişmez) | `nf-arayuz` | 1 gün |
| 2 | **G2** | Schedule hızlı düzenleyici — alanlar ve klavye odağı | BL-293 BL-290 BL-294 BL-295 BL-291 | high / safe | R1 | `nf-arayuz` | 0,5 gün — **bitti** (dal `task/g2-quick-editor`, R1 onaylı, toplu turu bekliyor; KK-15, KK-18) |
| 3 | **G3** | Bayat ekranlar ve ekran önbelleği | BL-271 BL-273 BL-278 BL-149 BL-152 | high / safe | R2 (birden çok ekranın veri katmanı; BL-271 oturum) | `nf-backend` | 1 gün |
| 4 | **G4** | Zamanlanmış dışa aktarma ve e-posta teslimatı | BL-101 BL-272 BL-225 BL-163 U63 (BL-157 bayat, kapandı) BL-330 | high / moderate | R3 (BL-101 yetki çekirdeğine dokunuyor; belirsiz → üst sınıf) | `nf-backend` + `nf-db` | 1–1,5 gün — **bitti** (dal `task/g4-scheduled-export`, `nf-guvenlik` incelemesi sürüyor; saatlik cron kullanıcıda, KK-16, KK-18) |
| 5 | **G5** | Parola, oturum ve hesap güvenliği | BL-283 BL-162 BL-161 BL-279 (high, KK-11: kurtarma bağlantısı) | high / moderate | R3 (parola/oturum) | `nf-db` + `nf-backend` | 1,5 gün — **başladı** (G4 işçisi, dal G4'ün üstünde; KK-18) |
| 6 | **G6** | Bildirim teslimi | BL-099 BL-119 BL-342 BL-343 (BL-342/BL-343 KK-17 ile G6'ya eklendi) | high / moderate | R3 (bildirim `*_service`) | `nf-db` | 0,5 gün — **bitti** (dal `task/g6-notification-delivery`, + BL-342/BL-343; `nf-guvenlik` incelemesi @`62782c12`; KK-16, KK-17) |
| 7 | **G7** | FB-6.2.1 kapsamı: yetki çekirdeği ailesi A'nın Çalışanlar dilimine düşen kısmı (KK-5, KK-12) | BL-129 BL-270 BL-317 BL-242 BL-130 BL-155 BL-133 BL-176 BL-243 BL-276 (BL-133, BL-176, BL-276 kısmen; + BL-099'un yetki kısmı, KK-11) | high / risky | R3 | `nf-db` (+ `nf-backend` BL-176/BL-243) | 2–3 gün |
| 8 | **G8** | Silinmiş ve arşivli kayıtlar | BL-254 BL-132 (BL-188 bayat, kapandı) | medium / moderate | R3 (BL-132 `scope_set`) | `nf-db` (+ `nf-backend` okuma modeli) | 1 gün |
| 9 | **G9** | İzin, takas ve kapsam kuralları | BL-127 BL-182 BL-220 BL-247 BL-200 BL-110 BL-109 (BL-183, BL-185 bayat, kapandı) | high / risky | R3 | `nf-db` (+ `nf-backend` BL-200, `nf-arayuz` BL-110 metinleri) | 2 gün — **başladı** (G6 işçisinde, G6'dan sonra) |
| 10 | **G10** | Schedule kayıt ve yayın kuralları (veri) | BL-174 BL-191 BL-326 BL-325 BL-167 BL-228 BL-229 BL-292 BL-298 BL-236 BL-211 BL-238 (BL-190, BL-164 bayat, kapandı) | medium / moderate | R3 (`*_service` sözleşmesi, BL-292) | `nf-db` (+ `nf-backend` BL-298 shared şema) | 2 gün |
| 11 | **G11** | Hata sözleşmesi ve hata görünürlüğü | BL-134 BL-223 BL-172 BL-145 BL-156 BL-193 BL-213 BL-331 BL-324 BL-076 U37 U51 U42 (kalan kalemler) (U31, U26, U55 bayat, kapandı) | medium / moderate | R2 | `nf-backend` | 2 gün |
| 12 | **G12** | Yerel veritabanına dayanıklı pgTAP | BL-209 BL-217 BL-227 BL-245 BL-262 BL-288 BL-296 BL-173 BL-105 BL-226 BL-253 BL-248 BL-094 BL-070 BL-096 U32 BL-344 | medium / safe (BL-070 high, bayat görünüyor) | R0 (yalnız test) | `nf-test` | 1,5 gün |
| 13 | **G13** | Web ve e2e test kararlılığı, CI bekçileri | BL-120 BL-175 BL-321 BL-322 BL-195 BL-202 BL-203 BL-210 BL-328 BL-281 BL-196 BL-337 U12 U16 U18 U19 BL-350 (U36 bayat, kapandı) | medium / safe | R0 (test, CI) | `nf-test` | 1,5 gün |
| 14 | **G14** | Schedule üst çubuk, menüler ve pencereler — görsel | BL-305 BL-308 BL-311 BL-312 BL-319 BL-320 BL-327 BL-333 BL-233 BL-204 BL-332 U08 BL-121 BL-318 (BL-307 bayat, kapandı) BL-345 BL-347 | medium / safe | R1/R2 (birden çok Schedule yüzeyi) | `nf-arayuz` | 1 gün |
| 15 | **G15** | Görsel tutarlılık: ham hex, beyaz düğme, onay pencereleri | BL-256 BL-257 BL-258 BL-259 BL-260 BL-194 BL-287 BL-215 BL-241 BL-249 BL-334 U21 U29 U30 U39 U40 U41 BL-255 BL-147 BL-169 BL-340 BL-349 (BL-154 bayat, kapandı) | medium / moderate | R2 (birden çok ekran) | `nf-arayuz` | 2 gün |
| 16 | **G16** | Giriş öncesi, hesap ve workspace ekranları | BL-285 BL-289 BL-286 BL-144 BL-151 BL-122 BL-072 BL-284 BL-336 BL-339 U48 U49 U53 U54 U56 U57 U58 BL-348 | medium / safe | R1 (BL-284, K24 cevabına göre R3 olabilir) | `nf-arayuz` (+ `nf-backend` U56/U57/BL-284) | 1,5 gün |
| 17 | **G17** | Çalışanlar ve kişi kaydı | BL-314 BL-315 BL-244 BL-079 BL-153 BL-338 | medium / risky | R3 (BL-079 görünen adın tek kaynağı) | `nf-db` + `nf-backend` | 1,5 gün |
| 18 | **G18** | Belgeler (Documents) | U59 U60 U43 U44 BL-118 BL-341 | medium / moderate | R2 | `nf-backend` + `nf-arayuz` | 1 gün |
| 19 | **G19** | Zaman ve tarih | BL-277 | medium / safe | R2 | `nf-backend` | 0,5 gün — **başladı** (G2 işçisi, `task/g19-today-helper`; SchedulePage/takvim ve tarayıcı-yerel saat kısmı kapsam dışı, sonraya) |
| 20 | **G20** | Performans | BL-275 U13 U20 | medium / moderate | R2 | `nf-arayuz` + `nf-backend` | 1 gün |
| 21 | **G21** | Müsaitlik | BL-135 BL-086 BL-088 (BL-343 KK-17 ile G6'ya taşındı) | medium / safe | R2 | `nf-backend` + `nf-arayuz` | 1 gün |
| 22 | **G22** | İpucu ve not köşesi | BL-207 BL-297 | low / moderate | R2 (ortak Tooltip) | `nf-arayuz` | 0,5 gün — **bitti, onaylı** (dal `task/g22-tooltip-note-corner`, R2 ONAY @`9d3791e5`; toplu turu bekliyor) |
| 23 | **G23** | Ölü kod ve ikiz yollar | BL-280 BL-282 BL-168 BL-206 (U14, U15 bayat, kapandı) BL-346 | medium / moderate | R2 | `nf-backend` | 1 gün |
| 24 | **G24** | Geliştirme ortamı ve araçlar | BL-002 BL-003 BL-083 BL-304 BL-125 U04 U17 U25 U38 U45 U47 U64 (U07 bayat, kapandı) | medium / moderate | R0/R1 | koordinatör + `nf-test` | 1 gün |
| — | **G0** | Kayıt bakımı: açık listede duran kapanmış satırlar ve notlar | U01 BL-004 BL-061 U09 U10 U22 U23 U24 U33 U34 U62 BL-081 BL-082 BL-084 BL-085 BL-087 BL-089 BL-091 BL-114 BL-116 BL-070 (satır 194) BL-091 (satır 195) BL-097 BL-137 U11 U27 U28 U35 U50 U52 U61 U65 U66 + U46, U42'nin iki P1 kalemi (GK'den bayat) | low / safe | R0 | `nf-planlama` | **bitti 2026-09-29** (`task/backlog-program-2`) |

**Satırın anlamı:** "Maddeler" o grubun iş listesi. **Aynı anda tek grup ilerler** (kullanıcı kararı 2026-09-29, koordinatör aktardı; önceki "en çok 2 paralel" kuralı geçersiz). Grup bitince sıradaki başlar.

### Dokunduğu dosyalar, bağımlılık ve sıra gerekçesi
| Grup | Dokunduğu dizin / dosyalar (GA ve G16 **tahmin**, madde metninden — Account sonrası ölçülür; diğerleri ölçüldü) | Bağımlılık | Gerekçe (tek satır) |
|---|---|---|---|
| GA | tahmin (KK-7): yeni migration (`user_profiles.phone_e164` → `employee_private_profiles.phone` SECURITY DEFINER tetikleyici; onboarding'de telefonun hesaba yazılması; bir kerelik doldurma), pgTAP | Account yeniden tasarımı (KK-1); aynı test turunda, hemen ardından (KK-3, KK-7) | Account yeniden tasarımı workspace başına telefon alanını ekrandan kaldırıyor; tek başına girerse numarayı kimse düzeltemez. |
| G1 | ölçüldü: `apps/web/src/schedule/components/{PublishScheduleDialog,UnpublishScheduleDialog,DraftDropdownMenu,SaveDraftMenu,ScheduleTemplateDialogs}.tsx`, `apps/web/src/views/SchedulePage.tsx`, `apps/web/src/schedule/lib/{draftSaveFlow,scheduleInteractionTargets}.ts` (CSS yok) | Account yeniden tasarımından sonra (KK-1); stil B mockup dalını beklemez (KK-4) | En yüksek "leave" ve ucuz: BL-299 yanlış taslağı yayınlıyor, BL-300 klavyeyle çalışmıyor; hepsi aynı beş dosyada. |
| G2 | ölçüldü: `apps/web/src/styles.css` (hızlı düzenleyici, Start/End, mola, Count, eylem düğmeleri, Save draft alanları), `apps/web/src/schedule/components/ShiftQuickEditor.tsx` | yok | BL-293 WCAG 2.4.7 ihlali (doğrulandı); beşi aynı CSS bloğunda, yarım günlük iş. |
| G3 | ölçüldü: `apps/web/src/auth/{AuthContext.tsx,tenant-query-cache.ts}`, `apps/web/src/schedule/schedule-data.ts`, `ScheduleRequestsPage.tsx`, `EmployeeDrawer.tsx`, `EmployeeDashboard.tsx`, `WorkspacePage.tsx`, `account/WorkspacesPage.tsx`, `account/AccountLayout.tsx`, `shell/AppShell.tsx`, `useExchangeRealtime.ts`, 5 Settings/Availability dosyası (BL-278 (1)), `SchedulePage.tsx` (BL-278 (5)(6)) | G1'den sonra (ikisi `SchedulePage.tsx`'e dokunuyor) | BL-271 ortak tablette öncekinin telefonunu gösteriyor (gizlilik), BL-273 izin kararından sonra Schedule eski kalıyor; ikisi ucuz. |
| G4 | ölçüldü (2026-09-29, `ade5c270`): `apps/api/src/schedule/{schedule-service.ts (:76-99, :1216-1307),schedule-export-cron.ts,schedule-export-cron-routes.ts}` + testleri, `apps/api/src/app.ts:873-885`, `packages/shared/src/{index.ts:2213-2270,timezones.ts}`, `vercel.json` (`crons`); BL-163: `invitation-service.ts`, `account-security-service.ts`, `password-reset.ts`, `account-deletion-worker.ts` + testleri; yeni migration (`authz_reason` için `public` sarmalayıcı; `list_schedule_export_cron_candidates_service`, `preview_schedule_export_service`, `record_schedule_export_schedule_failure_service`, `live_location_ids`); pgTAP `deleted_location_counts_nowhere`, `authorization_coverage`, `workspace_rls`, `authorization_core` | yok (U63: hosted e-posta anahtarı kullanıcıda); BL-163'ün dosyaları G5 ile ortak (`account-security-service.ts`, `password-reset.ts`) → sırayla, çakışmaz | Zamanlanmış dışa aktarma bugün hiç çalışmıyor (BL-101) ve tek bozuk saat dilimi herkesi durduruyor (BL-272). |
| G5 | ölçüldü (2026-09-29, `ade5c270`): `supabase/config.toml` (`:188`, `:203-215`, `:234`), `apps/api/src/auth/verify-password.ts`, `apps/api/src/account/{account-security-service,account-security-routes,workspace-account-service,workspace-account-routes,password-reset,workspace-retention-worker}.ts` + testleri, `apps/api/src/app.ts` (`:271-274`, `:822`), `apps/api/src/employees/invitation-service.ts`, `apps/web/src/lib/supabase.ts:640`, `apps/web/src/views/{ResetPasswordPage,SignInPage}.tsx`, `apps/web/src/account/{SecurityPage,AccountRecoveryPage}.tsx`, `apps/web/src/employees/employee-data.ts`; yeni migration (BL-283 sayaç tablosu; kurtarma yeniden gönderme sınırı: `prepare_account_deletion_recovery_resend_service`, `request_account_deletion_v2_service`, `mark_workspace_retention_purge_completed_service`, davet sırrı fonksiyonları); pgTAP `account_security_deletion_lifecycle`, `authorization_coverage`, `employee_create_command`, `retired_objects_stay_gone`, `workspace_rls` | BL-161'in hosted kısmı kullanıcıda; G4 (BL-163) ile ortak dosyalar, G4'ten sonra | BL-283 yayın öncesi şart (kullanıcı kararı 2026-09-28); aynı dosyalarda üç hesap güvenliği maddesi daha. |
| G6 | ölçüldü (2026-09-29, `ade5c270`): yeni migration (`request_employee_preferred_name_service` alıcılı kuyruk, `people.preferred_name.*` üretici kaydı ve gerekirse politika satırı; örnek `20260927130000_owner_time_off_tells_managers.sql`); `supabase/tests/preferred_name_approval.test.sql` (teslim + `review_required`); API imzası değişirse `apps/api/src/employees/employee-directory-{service,routes}.ts` | BL-099'un yetki kısmı (`decide_`/`list_pending_preferred_names_service` → `authorize`, `no_self`) G7 = FB-6.2.1'e (KK-5; bölme KK-11 ile onaylandı) | Tercih edilen ad bildirimi kimseye ulaşmıyor; küçük, test onu kilitler. |
| G7 | ölçüldü (2026-09-29, `7c63b997`): yeni migration(lar) — `remove_employee_access_service`, `enforce_membership_role_change`, `shift_exchanges_command_service`, üç belge servisi + `app_private.set_document_exemption`, `save_schedule_edit_session_service`/heartbeat, `enforce_role_location_scope` + presence politikaları, `mark_schedule_time_off_viewed_service`, `time_off_event_released_assignments`, `shift_exchange_schedule_recovery_service`, `list_schedule_weekly_shifts_service`, `delete_schedule_draft_service` (→ `live_location_ids`), `prepare_employee_invitation_service` (→ `can_invite_with_role`) + owner onboarding'in dört servisi, `respond_workspace_ownership_transfer_service`, `list_employees`/`get_employee_detail`/avatar (FB-6.2.3), `permissions.custom_grantable` satırları, katalog politikaları ve grant'ler (BL-232), `membership_status` (BL-071); pgTAP `authorization_matrix` (ikinci admin, rütbe hücreleri), `authz_catalog`, `authorization_coverage`, `authorization_core` (72 eylem sabit liste), `test-support/builder.sql` + belge, takas, oturum, davet, devir testleri; `packages/shared/src/{authorization.ts,authorization.test.ts,authorization-matrix.expected.json}`; web `apps/web/src/auth/{PermissionRoute,resolveLanding,can}.ts(x)`, `views/{WorkspacePage,SchedulePage,AvailabilityPage}.tsx`, `settings/{SettingsHomeRedirect,SettingsLayout,GeneralSettingsPage,organization-data}.ts(x)`, `shell/AppShell.tsx`, `employees/EmployeeDrawer.tsx`, `account/WorkspacesPage.tsx:1106`; API `employee-directory-*`, `invitation-service`, `document-lifecycle-service`, `workspace-account-service`, `shift-exchanges-service`, `settings/organization-settings-*`. Madde başına FB-6.2 eşlemesi aşağıda ("G7 ↔ FB-6.2 eşlemesi") | FB-6.2.1'in kapsamı olarak yürür (KK-5, KK-12 ile daraltıldı): sırası gelince FB-6.2.1 görev dosyası açılır; diğer dilimlere düşen maddeler GF'de. G7'de kalıp parçaları dağılanlar: BL-276'nın (1) kalemi FB-6.4, (2) FB-6.6, (3) FB-6.1; BL-133'ün `activate_…` kısmı FB-6.6; BL-176'nın Settings kısmı FB-6.8 | İki high/risky açık (admin başka admin'in erişimini kaldırıyor; eski kapı rütbeyi atlıyor). Pahalı ve riskli, bu yüzden ucuz high'lardan sonra. |
| G8 | ölçüldü (2026-09-29, `7c63b997`): yeni migration — `get_schedule_read_model_service` ve `app_private.schedule_departments_and_jobs` (`20260928070000`; ekip panosu `20260928090000` de çağırıyor), BL-132 için `scope_set`, `authz_check`, `live_location_ids`, `acquire_schedule_edit_session_service`, `apply_schedule_template_service`; `packages/shared/src/index.ts` (`scheduleReadModelSchema`, `scheduleJobSchema`) + test; web `schedule/hooks/{useScheduleBadgeMeasurements,useScheduleGridDragControllers,useCellState}`, `export-v2/snapshot.ts`, `views/SchedulePage.tsx`, `schedule/components/ShiftCard.tsx`, `settings/{organization-data,LocationsSettingsPage}.ts(x)`; pgTAP `reads_know_management_and_owner`, `schedule_one_function_per_job`, `schedule_read_model_rls`, `authorization_matrix`, `deleted_location_counts_nowhere`; `docs/plan/KARARLAR.md` (Q-C arşiv hükmü) | BL-188 kapandı, G4'e bağlılık kalktı; BL-132 ilkesi KK-13 ile verildi (arşivli = kapsam ve yazmada silinmiş gibi; tek/iki kolon `nf-db` seçer) | BL-254'ün kararı (K8) hazır; BL-132 arşivli ama silinmemiş lokasyonun çekirdekle Schedule arasında çeliştiğini gösteriyor (bugün oluşabilir). |
| G9 | ölçüldü (2026-09-29, `7c63b997`): yeni migration — `record_weekly_exchange_acceptance`, `guard_schedule_assignment_availability`, `assess_weekly_shift_availability`, `shift_exchange_preview`/`weekly_assignment_candidate_base`, `weekly_exchange_candidate_check`, `shift_exchanges_command_service`, `apply_time_off_cancellation_decision` (ortak kısaltma adayı), `reconcile_notification_platform_service`, `time_off_is_the_owners_own`/`authorize_time_off_decision`, `employee_hub_actor_service`, `shift_exchange_guard_eligibility_write`, `time_off_assignment_impact`; pgTAP `weekly_exchange_acceptance`, `weekly_exchange_changed_terms`, `shift_exchanges_v1`, `authorization_matrix`, `notification_platform_core`, `owner_time_off_*`, `time_off_cancellation_requests`; API `shift-exchanges/*`, `employee-hub/*`, `schedule/{schedule-requests-*,time-off-decision-service.test.ts}`; `packages/shared/src/{shift-exchanges,time-off,index}.ts`; web `ShiftExchangeHub.tsx`, `ScheduleRequestsPage.tsx` | FB-6.3 ile örtüşme: BL-110'un izin yarısı FB-6.3 `.6`, BL-247 doğal olarak `.3`; BL-127/BL-182 FB-6.3 kapsam dışı, P1'e göre FB-6.4 (önce BL-182) | Kararı verilmiş iki high/risky ("izni kısalt ve ata"; çalışan kendi iznini ezebilir); BL-182 düzeltmesi tek fonksiyonda kalmamalı (tetikleyici + adaylık da engel sayıyor). |
| G10 | ölçüldü (2026-09-29, `39a9faa2`): yeni migration — `guard_schedule_assignment_availability` (`20260926230000_scope_settings_read_safely`), `weekly_schedule_publication_preflight` + `publish_schedule_draft_service` (`20260927114500_approved_exchange_survives_a_stale_draft`), `weekly_publication_decisions` + `preview_schedule_auto_fill_service` (`20260926220000_availability_is_a_preference`), `apply_schedule_template_service` + `assess_weekly_shift_availability` (`20260927160000_management_and_owner_are_kept`), `apply_schedule_auto_fill_service` (`20260909012001_schedule_availability_enforcement`), `get_schedule_publication_status_service` (`20260929110000_the_publication_names_its_source_draft`), `schedule_availability_read_projection` (`20260929100000_a_saved_draft_opens_with_its_shifts`), `mutate_schedule_edit_shift_service` + `shift_exchange_schedule_recovery_service` (`20260926200000_shift_labels_come_from_the_catalog`), `shift_exchange_draft_undoes` (`20260928020000_approved_exchange_survives_unpublish`), `schedule_current_week_start_service` (`20260819010000_schedule_publication`) ve çağıranları (`20260926160000`, `20260926150000`); `packages/shared/src/{availability-assessment,index}.ts`; web `schedule/components/{ShiftQuickEditor,ShiftCard}.tsx`, `employee-hub/ShiftSheet.tsx`, `schedule/lib/templateApplyMessage.ts`; `apps/api/src/schedule/schedule-service.ts`; pgTAP `shift_note_survives_every_path`, `approved_exchange_survives_a_stale_draft`, `approved_exchange_survives_unpublish`, `shift_exchanges_v1` | G8'den sonra (aynı migration ailesi) | Sessiz veri kaybı riski (BL-292) ve yayın tetikleyicisi boşlukları; hepsi aynı servis ailesinde. |
| G11 | ölçüldü (2026-09-29, `39a9faa2`): `apps/api/src/{http-error,app}.ts`, `auth/{verify-user,workspace-context}.ts`, `account/workspace-account-routes.ts`, `employees/{employee-directory-routes,employee-directory-service,employee-create-service,onboarding-routes,onboarding-service,document-lifecycle-routes}.ts`, `settings/{organization-settings,signature-settings,document-types,roles,jobs-management}-routes.ts` + service'leri, `employee-hub/employee-hub-{routes,service}.ts`, `communications/communication-service.ts`, `notifications/notification-settings-service.ts`, `schedule/{schedule-requests-routes,schedule-requests-service,schedule-routes}.ts`, `shift-exchanges/shift-exchanges-{routes,service}.ts`, `availability/{availability-routes,availability-service,weekly-preferences-routes}.ts`; web `views/SchedulePage.tsx`, `schedule/export-v2/usePreviewSource.ts`, `schedule/components/ScheduleState.tsx`, `employee-hub/shift-exchanges/exchange-data.ts`, `employees/{InvitationRow,AcceptInvitationPage}.tsx`; migration `20260925180000_the_owner_gives_a_legal_name`, `20260926150000_one_function_per_schedule_job`; U42 kalemleri için `packages/shared/src/index.ts`, `vercel.json`, `docs/archive/rebuild`, `App.test.tsx`, `app.test.ts`, `package.json`'lar | yok | 12 servis ham veritabanı hatası gösteriyor (BL-134 ailesi); ekranda ham zod hatası (BL-193). |
| G12 | ölçüldü (2026-09-29, `39a9faa2`): `supabase/tests/{ci-green.txt, shift_exchanges_v1, time_off_published_assignment_disposition, weekly_exchange_changed_terms, bl052_document_notifications, bl052_document_account_inbox, roles_permissions_rls, weekly_team_availability, security_audit_events, bl052_document_lifecycle, bl052_document_rehire, bl052_policy_lifecycle, bl052_policy_withdrawal, employee_termination_offboarding, time_off_cancellation_requests, time_off_partial_period_decisions, schedule_edit_sessions, owner_time_off_needs_no_documents, employee_onboarding_rls, employee_hub, schedule_publication, workspace_rls}`, `supabase/test-support/builder.sql`, `supabase/seed.sql:275`, `supabase/migrations/20260908112000_notification_outbox_relay.sql`, `.github/workflows/ci.yml` | BL-209 onarım komutu kullanıcıda | Yerel kırmızılar birleştirme penceresinde gerçek kırmızıyı gizliyor; ucuz, yalnız test. |
| G13 | ölçüldü (2026-09-29, `67c88bc0`): `apps/web/src/App.test.tsx` (BL-120, BL-175, BL-195, U12), `apps/web/src/employees/EmployeeDrawer.test.tsx` (BL-322), `apps/web/src/shell/NoAccessState{,.test}.tsx` + yeni erişim-yok e2e spec'i (BL-195), `apps/web/src/schedule/components/DefaultHoursReviewDialog{,.test}.tsx` (BL-202), `e2e/flows/{schedule-shift-note,schedule-publish,schedule-multi-location,schedule-locks,schedule-availability-warning}.spec.ts` ve `exact: true` taraması için kalan `e2e/flows/*.spec.ts` (BL-321, BL-203, BL-328), `e2e/playwright.config.ts`, `.github/workflows/ci.yml`, `supabase/tests/{ci-green.txt,time_off_cancellation_requests.test.sql,authorization_matrix.test.sql}` (BL-281, U18), `scripts/lock{,.test}.mjs` (BL-196), `apps/web/src/schedule/components/ScheduleExportSchedules.test.tsx` (U16), `apps/api/src/settings/organization-settings-routes.test.ts`, `apps/web/src/employees/EmployeeOnboardingPage.test.tsx`, `apps/web/src/views/ScheduleRequestsPage.test.tsx` + gerekirse yeni `apps/api` vitest config (U19); BL-337'nin dosyaları eslint sayımıyla belirlenir | yok | Yük altında yanlış kırmızı veren testler main'i boşuna durduruyor. |
| G14 | ölçüldü (2026-09-29, `67c88bc0`): `apps/web/src/styles.css` (`:1-50` token'lar, `:3396-3445` üst çubuk, `:3533-3572` menü panelleri, `:3813-3845` satır düğmeleri, `:3942-3966` Published paneli, `:4004-4006` Settings paneli, `:4198-4249` sağ üst düğmeler, `:4709-4722` telefonda menü, `:8299-8580` stil B pencereleri, `:9119-9361` Unpublish, `:10757-10779` telefon üst çubuğu); `apps/web/src/schedule/components/{UnpublishScheduleDialog,PublishScheduleDialog,DraftDropdownMenu,ScheduleTemplateDialogs,SaveDraftDialog,ScheduleExportWorkspaceDialog,ScheduleTopBar}.tsx`; `apps/web/src/views/SchedulePage.tsx` (`:2395-2404`, `:3109-3175`); `apps/web/src/shell/ConfirmDialog.tsx` (BL-318; dört kullanıcısı etkilenir); testler `{UnpublishScheduleDialog,PublishScheduleDialog,DraftDropdownMenu,ScheduleTemplateDialogs,PublishPreflightPanel}.test.tsx`, `App.test.tsx`; BL-121 veri gerekirse `packages/shared/src/index.ts:1794` + API önizlemesi (ölçülmedi) | Stil B main'de (`228ff3b7`), mockup dalını beklemez (KK-4); BL-332 koordinatör dalında, toplu turda girer (KK-2) | Stil B ile çakışmasın diye G1'den ayrıldı; kontrast (BL-307) ve telefonda taşma (BL-333) burada. |
| G15 | ölçüldü (2026-09-29, `67c88bc0`): `apps/web/src/styles.css` (BL-257, BL-259, BL-194, BL-287, BL-215, BL-334, BL-169, U29, U39); `views/requests-catalog.css` (BL-256, BL-255); `account/{notification-preferences,account}.css`, `account/SecurityPage.tsx` (BL-258, BL-147, U30 — Account yeniden tasarımından önceki hâl, KK-1); `settings/roles-settings.css`, `settings/RolesSettingsPage.tsx`, `packages/ui/src/components/ConfirmButton.tsx` (BL-260, U40); `settings/jobs-settings.css` + `job-secondary-button` kullanan 16 `.tsx` (BL-255); `shell/{ManagementMobileNav.tsx,management-mobile-nav.css}` (BL-241); `employee-hub/employee-dashboard.css`, `availability/weekly-team.css`, `schedule/components/schedule-topbar-filter.css` (BL-249, U21); `views/SchedulePage.tsx`, `availability/availability-navigation.tsx`, `employees/EmployeeDrawer.tsx`, `settings/JobAssignmentsDrawer.tsx` (U39, U29); `views/WorkspacePage.tsx` (U41) | K20 (BL-255) cevabı beyaz düğme kısmını etkiler | KARARLAR UI-09 ve UI-13 kuralları hazır; kural var, yalnız uygulanmamış. |
| G16 | tahmin: `apps/web/src/shell/prebiz/*`, `apps/web/src/views/{SignInPage,ForgotPasswordPage}.tsx`, `apps/web/src/account/*` | K24 (BL-284) | Kayıt olan kişinin ilk gördüğü ekranlar; küçük ve güvenli. |
| G17 | ölçüldü (2026-09-29, `12dbc741`): yeni migration — `preview_schedule_auto_fill_service` (`20260926220000_availability_is_a_preference`), `app_private.manager_note_follows_role` (`20260926130000_manager_note_is_about_employees`) + `employee_profiles.user_id` için yeni tetikleyici, BL-079 için yeni `app_private.person_display_name` ve 48 fonksiyon (33 migration dosyası; en yoğun `20260925173926_schedule_asks_the_core`, `20260922110000_a_preferred_name_is_asked_for_and_answered`, `20260925180000_the_owner_gives_a_legal_name`); web `schedule/lib/{scheduleEmployeeSort,scheduleGridViewModel}.ts`, `schedule/components/ScheduleGrid.tsx`, `employees/EmployeeDrawer.tsx` + testleri; `scripts/export-local-fixture.mjs` (seed zaten tamam); pgTAP `schedule_templates_autofill_export`, yeni owner değişmezi testi (ya da `owner_employee_record`), manager notu testi (dosya ölçülmedi) | BL-317 → G7 / FB-6.2 (KK-8), aynı ekran; BL-338 seed/fixture + pgTAP | Görünen adın iki kaynağı (BL-079) kişiyi yanlış adla gösterebilir. |
| G18 | ölçüldü (2026-09-29, `12dbc741`): `apps/web/src/documents/DocumentReviewDrawer{,.test}.tsx`, `apps/web/src/settings/{DocumentsSettingsPage,DocumentSettingsEditor}.tsx`; yeni migration — `save_employee_document_draft_file_service` (`20260915235543_bl052_document_lifecycle` + `20260916052509` guard'ı), `remove_employee_document_draft_file_service` (`20260916012830`), `defer_initial_employee_document_service` (`20260916005914`), `app_private.guard_document_definition_edit` (`20260916052509_document_publication_initial`), owner muafiyeti (`20260928040000_the_new_owner_is_asked_for_no_document`), U43 için `public.document_types` CHECK (`publication_status = 'published'` ⇒ `published_at` dolu, KK-14) + `DocumentsSettingsPage.tsx` "-" dalının silinmesi, BL-341 için `count_account_attention_service` (`20260928050000_an_invitation_needs_a_confirmed_email:254`); pgTAP `bl052_document_lifecycle`, `document_publication` + sayaç testi | yok | U59 bir hata (yükleme sonrası çekmece yeniden kuruluyor); 8 mutasyon testsiz (U60). |
| G19 | ölçüldü (2026-09-29, `12dbc741`): `apps/web/src/employee-hub/{EmployeeScheduleBoard.tsx,dashboard-model.ts,shift-exchanges/ShiftExchangeHub.tsx}`, `schedule/components/ScheduleLocationHeader.tsx`, `settings/SignatureTemplatesSettingsPage.tsx`, `employees/EmployeeOnboardingPage.tsx`, `views/EmployeeHubPage.tsx`; tarayıcı yerel saati de kapsama alınırsa `ScheduleDayHeaderCells.tsx`, `views/SchedulePage.tsx`, `settings/ImportantDatesSettingsPage.tsx`, `schedule/components/MiniCalendar.tsx` | API tarafı K19'a bağlı (BL-238); bu madde beklemez | "Bugün" üç ayrı yoldan hesaplanıyor; tek yardımcıya bağlamak ucuz. |
| G20 | ölçüldü (2026-09-29, `12dbc741`): `apps/web/src/views/SchedulePage.tsx`, `schedule/lib/scheduleEmployeeSort.ts`, `schedule/components/{ScheduleGrid,ScheduleGridBody,ScheduleGridShell,ScheduleRow,ShiftCard}.tsx`, `schedule/export-v2/{png.ts,png.test.ts,files.ts,ExportController.tsx}`; yeni `docs/plan/tasks/EXP-002.md` | G1 ve G3'ten sonra (`SchedulePage.tsx`) | Izgara her çizimde bütün modeli yeniden kuruyor (≤50 ms çıtası, CLAUDE.md §9). |
| G21 | ölçüldü (2026-09-29, `12dbc741`): `apps/web/src/availability/{WeeklyPreferencesForm,WeeklyUnavailableEditor}.tsx` (+test), `packages/shared/src/{weekly-preferences,index}.ts`, `apps/api/src/availability/availability-service.ts`, `apps/api/src/schedule/schedule-service.ts`; yeni migration — `validate_weekly_preference_command`, `weekly_preference_settings_save_service`, `weekly_preferences_read_service`, `get_schedule_read_model_service`; pgTAP `weekly_preferences_commands`, `weekly_preference_mode_conversion`; Takvim satırı için `ScheduleRow.tsx` (ölçülmedi) | yok | "Manager note" kararı hazır; ölü haftalık yollar aynı yerde. |
| G22 | ölçüldü (2026-09-29, `12dbc741`): `apps/web/src/shell/Tooltip{,.test}.tsx`, `apps/web/src/schedule/components/{ShiftNoteCorner.tsx,ShiftNoteCorner.test.ts,ShiftCard.tsx}`, yeni ortak kanca dosyası | G2'den sonra | Aynı zamanlayıcı mantığı iki kez yazılı; takılı kalan basılı durum aynı dosyada. |
| G23 | ölçüldü (2026-09-29, `12dbc741`): `apps/api/src/schedule/{schedule-routes,schedule-service,schedule-routes-gate.test,schedule-service-refusals.test,schedule-export}.ts`, `apps/api/src/app.test.ts`, `apps/api/src/employees/{onboarding-routes,employee-directory-service,document-lifecycle-service}.ts`, 4 cron rota dosyası (`account-deletion-routes`, `workspace-retention-routes`, `notification-outbox-routes`, `schedule-export-cron-routes`); web `schedule/schedule-data.ts`, `schedule/components/PublishScheduleDialog.tsx`, eski dışa aktarma arayüzünün 9 dosyası (`schedule/components/ScheduleExport{Dialog,Panel,Controls,Presets,PreviewDialog,RecentEvents,Schedules,WorkspaceDialog}`, `scheduleExportDownload`), `apps/web/vite.config.ts`; `packages/shared/src/index.ts`; yeni migration (fonksiyon silme, kova ayarı); pgTAP `authorization_matrix`, `authorization_coverage`, `schedule_draft_availability_reads`, `the_schedule_uses_the_preferred_name`, `schedule_asks_the_core`, `retired_objects_stay_gone`; BL-280 (1) Account sonrası | G11'den sonra (aynı rota dosyaları) | CLAUDE.md §9 "ikiz sistem yok"; ölü yollar yanlış güven veriyor. |
| G24 | ölçüldü (2026-09-29, `12dbc741`): `apps/web/scripts/dev-with-api.mjs`, `apps/web/vite.config.ts`, `README.md`, `CLAUDE.md` §7 (port tarifi; koordinatör), yeni `scripts/<kontrol>.mjs` + kök `package.json`, `supabase/seed.sql` (BL-083/U04/U47), `packages/{ui,shared}/package.json` + `turbo.json` (BL-304 alias), `.github/workflows/ci.yml:52,124` (U25), `apps/{web,api}/package.json` + `pnpm-lock.yaml` (U45), `vercel.json` + hosted env (U64; isteğe bağlı `lib/supabase.ts` ve 9 `*-data.ts`), `packages/shared/tsconfig.json` (U17 koruması); BL-125, U17, U38 repo dışı (dosya sistemi, yerel DB) | U17/U25 kullanıcının makinesinde | Kullanıcıyı etkilemez; geliştirici zamanını yer. Sona. |
| G0 | `docs/plan/BACKLOG.md`, `docs/plan/KARARLAR.md` | yok | **Bitti 2026-09-29**; sonuç Notes / Result'ta. |

## Toplu test turları (her grup sonrası değil; art arda biten 1–2 grup bir tur)
Her tur: `pnpm.cmd lint`, `typecheck`, `test`, `build`; turda migration varsa `test:db` (yerel taban kırmızısından büyümeden); ekranı değişen akışların e2e'si (`db.lock`). Gruplar sırayla, tek tek yapılır; tur, art arda biten 1–2 grubun birlikte test edilip birlikte main'e girmesidir.

| Tur | Art arda biten gruplar | Ek kapı |
|---|---|---|
| T0 | GA, Account yeniden tasarımıyla aynı tur (KK-3, KK-7) | `test:db` + pgTAP; `nf-guvenlik` (R3) KK-3 incelemesine eklenir |
| T1 | G1, sonra G2 (G0 docs araya girebilir) | e2e: Schedule (`e2e/flows/schedule-*.spec.ts`); ekran görüntüsü masaüstü + telefon (R1) |
| T2 | G3, sonra G4 | `test:db` (G4 migration); e2e: Schedule, Requests, Account; `nf-guvenlik` (G4 R3) |
| T3 | G5, sonra G14 | `test:db`; e2e: giriş/Account, Schedule; `nf-guvenlik` (G5 R3) |
| T4 | G6, sonra G12 | `test:db` (G12 yalnız test dosyası); `nf-guvenlik` (G6 R3) |
| T5 | G7 = FB-6.2.1 (tek başına, KK-5) | `test:db` + yetki matrisi; e2e: izin gerektiren akışlar; `nf-guvenlik` zorunlu, `/code-review` ve kullanıcıya ultrareview önerisi |
| T6 | G8, sonra G13 | `test:db`; e2e: Templates, dışa aktarma |
| T7 | G9, sonra G15 | `test:db`; e2e: izin, takas; görsel QA (G15 çok ekran) |
| T8 | G10, sonra G16 | `test:db`; e2e: Schedule kayıt/yayın, giriş |
| T9 | G11, sonra G17 | `test:db`; e2e: Employees |
| T10 | G18–G19, G20–G21, G22–G23 ikişer, en son G24 | tur başına tam kapı |

## Karar bekleyen (GK) — karara bağlandı 2026-09-29 (KK-6…KK-10); yalnız BL-073 bekliyor
| Madde | Karar | Grup |
|---|---|---|
| BL-238 | KK-6 (a), belirleyici vardiyanın lokasyonunun saat dilimi | G10 |
| BL-335 | KK-7 (a), tek kaynak hesap, sunucu tarafında kopya | GA (Account ardı) |
| BL-317 | KK-8 (a), M2'nin uygulanması | G7 / FB-6.2 |
| BL-121 | KK-9 (a), yalnız bilgi, 40 sabit | G14 |
| BL-255, BL-147, BL-169 | KK-10 (a) | G15 |
| BL-309 | KK-10 (a) | G1 |
| BL-318 | KK-10 (a) | G14 |
| BL-330 | KK-10 (a) | G4 |
| BL-088 | KK-10 (a) | G21 |
| BL-126 | KK-10 (a), MVP sonrası | GS |
| **BL-073** | **kullanıcıya kalır** (görsel; varyant hazırlanır) | GK |

Aşağıdaki öneri ve gerekçeler kararların dayanağı olarak kalır (KK-10 buraya atıf yapıyor); her maddenin kararı BACKLOG.md'de maddenin altında.

Kullanıcı yokken koordinatör karara bağlar ve `KOORDINATOR-KARARLARI.md`'ye loglar (kullanıcı talimatı 2026-09-29). Her maddede seçenekler, **Öneri** (vizyona en uygun) ve tek satır **Gerekçe**. Vizyon ölçütü: ROADMAP MVP sonucu, KARARLAR.md, SaaS mantığı; çok kiracılı, çok lokasyonlu, çok rollü; çalışan birden çok lokasyonda; yönetici hem yönetir hem vardiya alır; lokasyonlar farklı saat dilimlerinde. **KRİTİK** = uygulamanın yönünü değiştirir (şema, yetki modeli, fiyat, kapsam); koordinatör bunları alt ajanlarla tartışır. Cevap gelince madde parantezdeki gruba geçer. (2026-09-29, `nf-planlama`, `origin/main` `8b98e37d`.)

**KRİTİK dört madde:** BL-238 (zaman modeli), BL-335 (şema + kiracılar arası yazma), BL-317 (yetki: kim kimi görür), BL-121 (kapsam: ROADMAP'in "MVP sonrası" satırına değiyor).

- **BL-238 (K19) — KRİTİK (zaman modeli; bütün Schedule yazma servislerinin "geçmiş hafta" kontrolü)** — Birden çok saat dilimli workspace'te "bu hafta" ne zaman biter? Bugün sunucu UTC'ye bakıyor; Pazar akşamı Pasifik'te yönetici haftayı düzenleyemiyor.
  - (a) Her lokasyonun kendi saat dilimi — vardiyanın lokasyonunun Pazar gece yarısı (KK-6 düzeltmesi: yöneticinin değil)
  - (b) Workspace'in tek saat dilimi
  - (c) UTC kalsın, ekranda uyarı
  - **Öneri: (a).** Hafta kilidi lokasyon başına değerlendirilir: iki lokasyonlu taslakta New York'un haftası Los Angeles'ınkinden 3 saat önce kapanır, her hücre kendi lokasyonunun saatine bakar.
  - **Gerekçe:** lokasyonlar farklı saat dilimlerinde (vizyon) ve saat dilimi zaten lokasyonda tutuluyor (`public.locations.timezone`; yeni sütun gerekmez); KARARLAR'da emsal var — izin saatleri birincil lokasyonun saat dilimiyle sabitlenir (FB-6.3 S1–S3). (b) çok eyaletli zinciri tek saate zorlar, (c) hatayı yalnız görünür yapar.
  - **Tartışılacak:** taslak birden çok lokasyonu kapsarken "taslağın haftası geçmiş mi" sorusu lokasyon başına mı, en erken kapananla mı; Pazar kuralı (ILERLEME §7) bu kararla kalkar. Karar: KK-6 → G10.
- **BL-255 (K20)** — İkinci beyaz düğme sistemi (`.job-secondary-button`) ortak beyaz düğmeye birleşsin mi? 16 ekranın görünümü değişir.
  - (a) Evet, önce/sonra görüntüsüyle onaydan sonra
  - (b) Hayır, iki görünüm kalsın
  - **Öneri: (a).** **Gerekçe:** KARARLAR UI-09 "beyaz düğme tek kural, ekran bazlı ezme yazılmaz" ve CLAUDE.md §9 "ikiz sistem yok"; bugünkü kenar beyazda 1,25:1, WCAG AA'yı da düzeltir. Cevaptan sonra: G15.
- **BL-309** — Yayındaki programın hangi taslaktan geldiği web'e gelmiyor; menülerdeki kod ölü.
  - (a) Ölü dallar silinsin, menüde "Published schedule" yazsın — ucuz, R1
  - (b) API kaynak taslağı döndürsün — sözleşme + veritabanı, R3
  - **Öneri: (a).** **Gerekçe:** MVP sonucu "Schedule yayınlar" için yayındaki programı görmek yeter, kaynağı bilmek bir yöneticiye iş kazandırmıyor; ölü kod yanlış güven veriyor (CLAUDE.md §9). İhtiyaç çıkarsa (b) sonradan eklenir, geri alınabilir. Cevaptan sonra: G1.
- **BL-318** — Schedule'ın diğer pencereleri de sade stile (stil B) geçsin mi?
  - (a) Evet, tek tutarlılık işi olarak
  - (b) Hayır, yalnız dört pencere
  - **Öneri: (a), G14'te** (stil B main'de, `228ff3b7`; KK-4). **Gerekçe:** KARARLAR → Ekran kararları → Schedule "yeni sağ üst menü ya da yayın penceresi bu stilden kurulur, tutarlılık ayrı iş (BL-318)" diyor; aynı ekranda iki pencere dili CLAUDE.md §9 görsel tutarlılık kuralına aykırı. Kullanıcının seçtiği stil genişletiliyor, yeni görsel karar yok. Cevaptan sonra: G14.
- **BL-317 — KRİTİK (yetki okuma kapsamı: manager owner'ın kaydını görür mü)** — Workspace sahibi (owner) Employees listesinde görünsün mü? KARARLAR owner'ı çalışan sayıyor ama listede görünmesini açıkça söyleyen satır yok.
  - (a) Evet, listeyi görebilen herkes görür
  - (b) Yalnız owner ve admin görür
  - (c) Görünmez
  - **Öneri: (a), düzenleme kuralları aynen** (admin owner'ın kaydını düzenlemez, manager düzenlemez; KARARLAR "Çalışan kaydı").
  - **Gerekçe:** owner da vardiya alır (yönetici hem yönetir hem çalışır; KARARLAR "Owner'ın çalışan kaydı": bütün lokasyonlarda çalışabilir) ve Schedule'da zaten görünüyor; yöneticinin planladığı kişiyi Employees'te bulamaması iki ekranı çelişkili yapar. Owner bütün lokasyonlara otomatik atandığı için her lokasyonun listesinde çıkar.
  - **Tartışılacak:** owner satırının bugün filtreyle mi kapsamla (`scope_set`) mı düştüğü ölçülmedi; kapsamdansa çekirdek değişir (R3). Karar: KK-8 → G7 / FB-6.2 (kaydı olmayan owner'lar BL-338, G17).
- **BL-330** — Zamanlanmış dışa aktarma, "include notes" açıksa vardiya notlarını yöneticinin yazdığı herhangi bir e-posta adresine götürüyor.
  - (a) Zamanlanmış dışa aktarmada notlar hiç gitmesin (elle indirmede kalsın)
  - (b) Bugünkü gibi kalsın (yöneticinin kendi seçimi)
  - (c) Yalnız workspace'te yönetici olan adreslere notlu gitsin
  - **Öneri: (a).** **Gerekçe:** BL-199 kuralı "not yalnız sahibine gider"; zamanlanmış gönderim kişisel veriyi her hafta kiracının dışına, kimsenin bakmadığı bir adrese taşır. Elle indirme yöneticinin o anki bilinçli eylemi olarak kalır. (c) alıcı listesini üyelikle eşleştirmeyi gerektirir, MVP'ye değer katmaz. Cevaptan sonra: G4.
- **BL-121 — KRİTİK (kapsam)** — Yayın önizlemesinde kişi başı haftalık saat özeti ve 40 saat eşiği olsun mu?
  - (a) Evet, ayrı iş olarak — ABD'de 40 saat fazla mesai sınırı
  - (b) MVP sonrası
  - **Öneri: (a), yalnız bilgi olarak** — önizlemede kişi başı haftalık saat ve 40 saati geçen satırda uyarı; engel, ayar ve kural yok. Sınır koyma (BL-067 saat limitleri) MVP sonrasında kalır.
  - **Gerekçe:** ABD restoranında haftalık 40 saat fazla mesai eşiği (FLSA) planlamanın en sık sorusu, bordroda fark etmek pahalı; ücretli self-serve lansmanda temel beklenti. Ama ROADMAP "MVP sonrası: BL-067 saat limitleri, geniş compliance" diyor: çizgi "göster" ile "sınırla" arasında çekilmeli, bu yüzden KRİTİK.
  - **Not:** madde "FB-6.1 `.4` yayın zincirinde yer bırakmak bedava" diyordu; `.4` bitti, artık yeni migration ister. Karar: KK-9 (migration yok) → G14.
- **BL-073** — Hesap düğmesi ile workspace değiştirici tek kontrol olsun mu (canvas önerisi)?
  - (a) Ekran turunda (K7) canvas görseliyle gösterilsin, karar orada
  - (b) Hayır
  - **Öneri: (a), kullanıcıya kalır.** **Gerekçe:** saf görsel karar; görsel kararda önce kullanıcı dinlenir (CLAUDE.md §9), canvas'ta öneriyi anlatan satır bulunamadı (2026-09-26 tazeliği). Account yeniden tasarımı (KK-1) aynı kenar çubuğuna dokunuyorsa tur onun ardından. Cevaptan sonra: G16.
- **BL-088** — Müsaitlik modu dönüşümü, bekleyen istekleri işaretlesin mi?
  - (a) Evet, dönüşüm bekleyen istekleri yöneticiye işaretler
  - (b) Hayır
  - **Öneri: (a).** **Gerekçe:** KARARLAR "müsaitlik bir tercih, engel değil" (BL-186): doğru tepki engellemek değil görünür kılmak; çalışanın elle değiştirdiği hafta zaten "keep / cancel" soruyor, dönüşümün sessiz kalması iki yol arasında tutarsızlık. Cevaptan sonra: G21.
- **BL-335 — KRİTİK (şema + kiracılar arası yazma)** — Account → Profile'da iki telefon var: hesabın telefonu ve her workspace'teki çalışan kaydının telefonu. Ali hesabında değiştirince müdürün gördüğü eski kalıyor.
  - (a) Tek telefon: hesaptaki geçerli, workspace kayıtlarına yansır
  - (b) İkisi ayrı kalsın, ekranda farkı açıklansın
  - **Öneri: (a), tek kaynak hesap.** Kişi hesabını bağladıktan sonra çalışan kaydındaki telefon hesaptan okunur, çekmecede salt okunur; hesabı henüz olmayan (davet bekleyen) kişide yöneticinin girdiği numara kullanılır, katılınca hesaba taşınır.
  - **Gerekçe:** çalışan birden çok workspace'te çalışabilir (vizyon); telefon kişinin kendi verisi, işverenin değil. (a)'nın "yansır" (kopyala) biçimi Account yeniden tasarımının K-P2 desenine (acil durum kişisi: tek form, hepsine yazılır) uyar ama A workspace'indeki müdürün düzenlemesi B'dekini ezmez, yine ayrışır; tek kaynak bunu kökten kapatır.
  - **Tartışılacak:** tek kaynak şema ve yetki değişikliği (çekmecedeki telefon alanı, manager'ın "bütün kaydı düzenler" kuralının istisnası); ucuz ara adım K-P2 gibi kopyala. Account yeniden tasarımıyla (KK-1) aynı ekran: onun kararıyla birlikte. Karar: KK-7 → GA.
- **BL-126** — Taslakta lokasyonlar arası ortak çalışma daveti olsun mu?
  - (a) MVP sonrası
  - (b) Şimdi (yetki, realtime ve taslak kilidini etkiler)
  - **Öneri: (a).** **Gerekçe:** iki lokasyonu birlikte planlamak bugün admin/owner ile mümkün (M2 kapsam modeli); geçici çapraz yetki yetki modeline yeni bir kavram ekler ve MVP sonucunda yok. Bugünkü kapsamı korur, bu yüzden KRİTİK değil. Cevaptan sonra: GS.
- **BL-147** — Account alanlarında yardım satırı olan alanın yanındaki kutu ~15px kayıyor. Düzeltme ortak form hizası kuralını değiştirir.
  - (a) Hizalama kuralı yazılsın, etkilenen ekranlar listelensin, tek işte düzeltilsin
  - (b) Yalnız Account'ta düzelt
  - **Öneri: (a), Account yeniden tasarımı main'e girdikten sonra tazelikle.** **Gerekçe:** ortak değer değişince önce kural, sonra uyuşmayan ekranlar (CLAUDE.md §11.7); `.account-field` tasarımla değişmiş olabilir (KK-1). Cevaptan sonra: G15.
- **BL-169** — Ortak durum mesajları (`.form-error`, `.settings-notice`, `.request-notice`) ham renk kodu kullanıyor; token'a geçmek birçok ekranın rengini az da olsa değiştirir.
  - (a) Token'a geçilsin, önce/sonra görüntüsüyle
  - (b) Olduğu gibi kalsın
  - **Öneri: (a).** **Gerekçe:** CLAUDE.md §9 "ham hex yerine `--theme-*` token'ları"; giriş öncesi ekranlar zaten token'lı renkte, uygulamanın geri kalanı eski hex — aynı hata mesajı iki renkte. Cevaptan sonra: G15.

**GK'den çıkanlar (2026-09-29, bayat, G0'da kapandı):**
- **U42 (Kiosk ve Time Entries: sil ya da sahiplen):** karar verilmiş ve uygulanmış — `0fe755ad` (2026-09-24) "kiosk and time tracking are gone"; `apps/api/src`, `apps/web/src` içinde yalnız `PublicTrustPages.tsx:194` metni kaldı; KARARLAR "Silinenler: kiosk, zaman takibi". Denetim bloğunun kalan kalemleri (tipli hata, P2, fırsatçı) G11'e geçti.
- **U46 (`eslint-plugin-react-hooks` kurulsun mu):** `d09cf0ff` (2026-09-18) ile kuruldu, `exhaustive-deps` uyarı olarak açık (`eslint.config.mjs:25-26`). Kalan 20 uyarı BL-337 (G13).

## Bu programda yürümeyen gruplar
- **GF — FOUNDATION-B planına bağlı (bu programda yürümez):** BL-187 BL-218 BL-159. Zaten FOUNDATION-B adımlarına bağlandı; ILERLEME'den yürür. **KK-12 ile G7'den taşınanlar (ilgili dilimin sırasıyla kapanır; dilimlerin görev dosyalarına henüz yazılmadı):** BL-179 (FB-6.3 izin) BL-189 (FB-6.4 takas) BL-264 (FB-6.6 belgeler) BL-178 (FB-6.8 ayarlar) BL-232 (FB-6.8 ayarlar) BL-224 (FB-6.1 Takvim) BL-261 (FB-6.8 hesap).
- **GY — Yol haritası fazları ve duraklatılmış programlar (bu programda yürümez):** BL-007 BL-008 BL-027 BL-034 BL-038 BL-041 BL-042 BL-043 BL-044 BL-045 BL-046 BL-047 BL-048 BL-051 BL-053 BL-054 BL-055 BL-056 BL-057 BL-058 BL-059 BL-067 BL-117 U02 U03. Faz sırası kullanıcı kararı olmadan değişmez (CLAUDE.md §1).
- **GS — MVP sonrası (bu programda yürümez):** BL-009 BL-030 BL-060 BL-062 BL-050 BL-123 BL-126 (KK-10) U05 U06. **Ayrı riskli madde (KK-12):** BL-071 (bütün üyelik türlerine dokunuyor; hiçbir FOUNDATION-B dilimine girmez). Kapsam dışı (ROADMAP "Kapsam kararları").

## Bayat görünenler (sırası gelince doğrulanır; G0'dakiler hariç)
G0'da bayat diye kapananlar (BL-137, U28, U35, U42'nin iki P1 kalemi, U46, U50) "Kapanan maddeler"de.
- **BL-070 / BL-096** (pgTAP paketi, ilk fixture satırında duran dosyalar): FOUNDATION-B Aşama 1 CI kapısı ve `ci-green.txt` sonrası bayat olabilir (G12).
- **BL-190** (yayın uyarı gerekçesi ölü): metni "BL-186 kapsamına alındı, onunla birlikte kapanır" diyor; BL-186 2026-09-27'de kapandı (G10).
- **BL-154** (ghost kart kontrastı): karar 2026-09-26'da verildi, uygulama dalının adı geçiyor; birleşmiş olabilir (G15). → G15 tazeliği: bayat, kapandı (`f7beb651`).
- **U54** (kurulumu bitmemiş workspace'i Discard için yeniden kimlik doğrulama): SEC-003 ile kurulumu bitmemiş workspace parolasız kapanıyor (BL-284); şekli değişmiş olabilir (G16).

## İlk 3 grubun tazeliği (2026-09-29, `origin/main` `3a31d625`, kod okuması)
Hükümler BACKLOG.md'de maddelerin altında ("Tazelik 2026-09-29 (`3a31d625`, program G…)"). Uygulama çalıştırılmadı; klavye, iOS ve tarayıcı davranışı gereken yerler "ölçülmedi" diye yazıldı.
- **G1:** 12 maddenin 11'i geçerli, BL-303 değişmiş (yenileme artık kısmen yapılıyor; kalan hata: pencere kapandıktan sonra gelen hata görünmüyor). Bayat yok. Tazelikte ek: BL-181'in kök nedeni koddan bulundu; BL-329'daki Escape hatası Unpublish penceresinde de var.
- **G2:** 5 maddenin 5'i geçerli; eski dal satırları kaydığı için bugünkü satırlar yazıldı. Tazelikte ek: Start/End kenarı da soluk ham renk (BL-290); düzenleyici, yeşil odak kuralını taşıyan pencere işaretini (`data-schedule-quiet-dialog`) almıyor (BL-293).
- **G3:** 5 maddenin 5'i geçerli. BL-278'in 8 alt kaleminden 7'si aynen, 1'i kısmen değişmiş (Workspace sayfası hata cümlesi göstermiyor ama sayacı sessizce 0 yapıyor). Bayat yok.

## G4–G6 tazeliği (2026-09-29, `origin/main` `ade5c270`, kod okuması; üç salt okur alt ajan, `nf-planlama` her grubun kanıtını elle doğruladı)
Hükümler BACKLOG.md'de maddelerin altında ("Tazelik 2026-09-29 (`ade5c270`, BACKLOG-PROGRAM G…)"). Hosted ayar, cron'un gerçekten çağrılması ve yerel DB gövdeleri "ölçülmedi" diye yazıldı.
- **G4:** 6 maddenin 3'ü geçerli (BL-101, BL-272, BL-163), 2'si değişmiş (BL-225: risk sızıntı değil sessiz kapanma — silinmiş lokasyonlu zamanlanmış dışa aktarma 3 hatadan sonra kendini kapatır; U63: e-posta açılsa da BL-101 ve BL-272 düzelmeden çalışmaz), 1'i **bayat, kapandı** (BL-157, `6dddfeb8`). Tazelikte ek: BL-101 düzeltmesi yeni `public` servis sarmalayıcı + migration ister (`authz_reason` `app_private`'ta).
- **G5:** 4 maddenin 3'ü geçerli (BL-161, BL-162, BL-279), 1'i değişmiş (BL-283: doğrulayıcı main'de, altı yerde kullanılıyor, 429 artık 503). Tazelikte ek: hesap kurtarma yeniden gönderimi kurbanın bağlantısını sınırsız geçersiz kılabiliyor (BL-279'a yazıldı); yerel `secure_password_change = false` hosted'dan ayrışıyor (BL-161).
- **G6:** 2 maddenin 2'si geçerli. Sıra önerisi: G6 yalnız teslimi yapar; BL-099'un yetki kısmı G7 = FB-6.2.1'e (KK-5).

## G7–G9 tazeliği (2026-09-29, `7c63b997` = `origin/main` `a81154b3` + docs, kod okuması; dört salt okur alt ajan, `nf-planlama` her grubun kanıtını elle doğruladı)
Hükümler BACKLOG.md'de maddelerin altında ("Tazelik 2026-09-29 (`7c63b997`, BACKLOG-PROGRAM G…)"). `pg_proc` sayıları, yerel DB gövdeleri ve çalışan davranış "ölçülmedi".
- **G7 (18 madde):** 10 geçerli (BL-270, BL-189, BL-155, BL-242, BL-264, BL-129, BL-243, BL-178, BL-232, BL-071), 7 değişmiş (BL-276, BL-179, BL-224, BL-261, BL-130, BL-133, BL-176), BL-317 KK-8 iddialarıyla doğrulandı. Bayat yok. Önemli ekler: BL-130 eylem sayısı 60 değil 72; BL-176 `permissions.includes` 44 satır + 14 `permissions.has`; BL-224'ün çözümü artık hazır yardımcı `live_location_ids`; BL-242 fail-open'ı owner onboarding'in dört servisinde de var; `FB-6.2.md:137` ("tavan 63, değer 61") `:29`'daki 59/59 ölçümüyle çelişiyor.
- **G8 (3 madde):** BL-188 **bayat, kapandı** (`6dddfeb8`, `d58bf9be`, `d51b99ad`); BL-254 ve BL-132 değişmiş. BL-132 yeniden yazıldı: arşivli ama silinmemiş lokasyon çekirdekte kapsamda, Schedule'da yok; iki akış da (Archive, silme) bugün var; "tek kolon" hedefi Q-C ile çelişiyor — ürün kararı gerekebilir.
- **G9 (9 madde):** BL-183 ve BL-185 **bayat, kapandı** (`d1db608a`/`3b233691`; `b40c0468`); BL-110 değişmiş (Schedule yarısı kapandı); BL-247'nin bir yan iddiası yanlış (talep yolu da kapalı workspace kapısından yoksun); kalan 5 geçerli. BL-182 düzeltmesi yalnız kabul fonksiyonunda kalırsa yetmez (tetikleyici + adaylık).

### G7 ↔ FB-6.2 eşlemesi (KK-5: G7 = FB-6.2.1 kapsamı)
Ölçüm, G7'nin çoğunun FB-6.2'nin kendi dilimi değil, FOUNDATION-B'nin başka dilimlerinin (FB-6.3 İzin, FB-6.4 Takas, FB-6.6 Belgeler, FB-6.8 Ayarlar, Takvim) alanında olduğunu gösteriyor. **Karara bağlandı: KK-12, seçenek (a)** — FB-6.2.1 yalnız "FB-6.2'de zaten var" ve "yeni kapsam" sütunlarını alır; "başka dilimin alanı" sütunundakiler o dilime (program GF), BL-071 GS'ye.

| Madde | FB-6.2'de zaten var | Başka dilimin alanı | FB-6.2.1'e yeni kapsam olur |
|---|---|---|---|
| BL-129 | `.1` (`FB-6.2.md:83`, `:124`, `:142`) | — | — |
| BL-270 | `.4` (`:145`) + ikinci admin `.1` | — | fail-open (`20260914214056:319`) kırmızı hücresi |
| BL-317 | `.3` (`:144`) | — | avatar `.4`'ten `.3`'e (KK-8) |
| BL-242 | prepare kısmı `.5` (`:146`) | — | owner onboarding'in dört servisi |
| BL-276 | (4) `all_locations` `.2` (`:81`, `:127`, `:143`) | (1) FB-6.4, (2) FB-6.6, (3) Takvim | (5) hint'siz 42501 sayacı |
| BL-130 | — | — | 72 eylem sabit liste (pgTAP) |
| BL-133 | `delete_catalog_entity_service` `.6` (`:147`) | `activate_…` FB-6.6 | `.6`'ya etiket düzeltmesi |
| BL-176 | Çalışanlar'ın 12 satırı (`:85`, `:128`), `.7` (`:148`) | `SettingsHomeRedirect`/`SettingsLayout` FB-6.8 | `PermissionRoute`, `WorkspacePage`, `resolveLanding:72-74` → `.7` |
| BL-243 | — | — | `.7` (`can()` kapısı) |
| BL-155 | — | — | Done when 4 hedefi ≤46 olur |
| BL-179 | — | FB-6.3 | — |
| BL-189 | — | FB-6.4 | — |
| BL-224 | — | Takvim | — |
| BL-261 | — | hesap alanı | — |
| BL-264 | — | FB-6.6 | — |
| BL-178 | — | FB-6.8 (Settings Out of scope `:93`) | matris hücresi + `custom_grantable` migration + RLS testi |
| BL-232 | — | FB-6.8 (`FOUNDATION-B.md:419`) | en fazla kırmızı hücre |
| BL-071 | — | hiçbir dilim | önerilmez (bütün türe dokunan riskli iş) |
| BL-099 (yetki kısmı, KK-11) | — | — | `authorize` + `no_self` hücresi (G6 ölçümü) |

## G10–G12 tazeliği (2026-09-29, `39a9faa2` = `origin/main` `9adae6f8` + docs, kod okuması; üç salt okur alt ajan, `nf-planlama` bayat hükümlerini ve birer kanıtı elle doğruladı)
Hükümler BACKLOG.md'de ("Tazelik 2026-09-29 (`39a9faa2`, BACKLOG-PROGRAM G…)"). Dokunduğu dosyalar sütunu G10–G12 için "ölçüldü" (alt ajan listeleri devir notundan işlendi, `task/backlog-program-4`).
- **G10 (14):** 9 geçerli, 2 değişmiş (BL-191, BL-167), BL-211 ölçülmedi (muhtemelen bayat, API logu gerekir), **BL-190 ve BL-164 bayat, kapandı**.
- **G11 (16):** 10 geçerli, 3 değişmiş (BL-134, U51, U42 kalan kalemleri), **U31, U26, U55 bayat, kapandı**. Sayılar yeniden alındı: `throw new Error` 45 (eski 139), `message.includes` 72 (eski 93), kopya `requestError` 9.
- **G12 (16):** 8 geçerli, 8 değişmiş (BL-245, BL-226, BL-253, BL-248, BL-094, BL-070, BL-096, U32), bayat yok. Yeşil liste 140 dosyanın 125'i. Yerel kırmızılık hiçbir maddede ölçülmedi.

## G13–G15 tazeliği (2026-09-29, `origin/main` `67c88bc0`, kod okuması; üç salt okur alt ajan, `nf-planlama` üç bayat hükmü ve her gruptan bir kanıtı elle doğruladı)
Hükümler BACKLOG.md'de ("Tazelik 2026-09-29 (`67c88bc0`, BACKLOG-PROGRAM G…)"). Test, lint, e2e ve ekran koşturulmadı: kararsızlık, süre, piksel ve 20 eslint uyarısı "ölçülmedi". Elle doğrulanan kanıtlar: U36 `ci.yml:6,9` + `263f4d1d` atası; BL-120 `App.test.tsx:946` (40 sn) ve `:152` (5 sn); BL-307 `styles.css:3627-3631`, `:48` → `:20`, `:4204-4208`; BL-154 `f7beb651` diff'i (`-  opacity: 0.6;`) + `styles.css:5948-5961`.
- **G13 (17):** 12 geçerli (4'ü "geçerli (kod)": davranış ölçülmedi), 4 değişmiş (BL-120, BL-202, BL-203, BL-210), **U36 bayat, kapandı**. Önemli: BL-120'nin "20 sn sınır" teşhisi yanlış (sınır 40 sn; hata 5 sn'lik dosya genelinden); api'de vitest config yok (U19).
- **G14 (15):** 9 geçerli, 5 değişmiş (BL-305, BL-312, BL-320, BL-318; BL-305'in asıl hatası düzelmiş, ek pürüzleri kalmış), **BL-307 bayat, kapandı** (`5a92d2f2`). BL-332'nin düzeltmesi hâlâ yalnız `task/settings-view-passive` dalında. BL-319 ve BL-333 tek kök (`styles.css:10771-10773`).
- **G15 (21):** 16 geçerli, 4 değişmiş (BL-257, U21, U29, U39), **BL-154 bayat, kapandı** (`f7beb651`). Account'a değen BL-258, BL-287, U30, BL-147 main'in bugünkü (tasarım öncesi) hâliyle ölçüldü; Account main'e girince yeniden ölçülür (KK-1).

## G17–G24 tazeliği (2026-09-29, `origin/main` `12dbc741`, kod okuması; üç salt okur alt ajan, `nf-planlama` üç bayat hükmü ve her parçadan bir kanıtı elle doğruladı)
Hükümler BACKLOG.md'de ("Tazelik 2026-09-29 (`12dbc741`, BACKLOG-PROGRAM G…)"). Test, e2e, yerel DB ve kullanıcı makinesi koşturulmadı: süre, yerel veri ve makine iddiaları "ölçülmedi". G16 ve Account'a değen kalemler (BL-280 (1)) Account yeniden tasarımı main'e girince (KK-1). Elle doğrulanan kanıtlar: U07 `README.md:9-16` + `86425756` atası; U14/U15 `apps/web/src`'de `Kiosk`/`TimeEntr`/`time-tracking` yok, `App.tsx:84-85`, `EmployeeHubPage.tsx:77`; BL-338 `seed.sql:447-456` + `3355e88e`; BL-277 yedi `toISOString().slice(0, 10)` "bugün" noktası.
- **G17 (6):** 4 geçerli, 2 değişmiş (BL-315: üç temsil ikiye indi; BL-338: seed kısmı `3355e88e` ile tamam, fixture + pgTAP değişmezi kaldı). BL-079 statik sayım 48 fonksiyon / 33 migration.
- **G18 (5):** 4 geçerli (U43 kod düzeyinde), U60 değişmiş (10 mutasyondan 7'si testli; kalan download, timezone, extension).
- **G19 (1):** BL-277 geçerli; yan bulgu: "bugün"ün üçüncü biçimi tarayıcı yerel saati (4 dosya).
- **G20 (3):** 3 geçerli.
- **G21 (3):** 3 geçerli; BL-135'in bekleme nedeni kısmen kalktı (FB-6.1 işlevsel kısmı main'de).
- **G22 (2):** BL-297 geçerli, BL-207 değişmiş (kod main'de, hata duruyor; ikisi tek işte).
- **G23 (6):** 2 geçerli, 2 değişmiş (BL-280: (6) iddiası yanlış, (7) bayat, (1) Account sonrası; BL-282: kilit kalemi şekli farklı), **U14, U15 bayat, kapandı** (`0fe755ad`, `2d8ba8a7`).
- **G24 (13):** 9 geçerli (makine iddiaları ölçülmedi), 3 değişmiş (BL-083 öncülü yanlış, BL-304 belirti gitti kalıcı çözüm yok, U47), **U07 bayat, kapandı** (`86425756`).

## Sayım doğrulaması ve özet dizin
- Tam dizin: `docs/plan/research/backlog-index-2026-09-29.md` (290 satır: kimlik, satır, grup, işaret, başlık, başlıktan sonraki ilk cümle; grubu bilinmeyen 0).
- Elle sayım (bağımsız `awk`, betikten ayrı): "Schedule sağ üst taslak ve yayın düğmeleri" bölümünde 18 madde (BL-299…BL-320); betiğin dizini aynı bölüm için 18. Eşit.
- Not: gruplama ilk turda özet dizinin başlık (150 karakter) + anılan dosyalar sütunuyla yapıldı; ilk cümle koordinatörün şartından sonra dizine eklendi. İlk 3 grupta gruplar alt ajan ölçümüyle denetlendi; sonraki gruplarda her grup başlarken tazelikte denetlenir.

## HANDOFF §4 adayları (2026-09-29)
- (1) `App.test.tsx` "protects workspace routes…" zaman aşımı → **BL-120**'ye ek (aynı test; yeni numara yok), G13.
- (2) Unpublish "Week" kartı ~24px dar ve (3) Unpublish X simgesi 16/13px → **BL-305**'e ek (aynı kök: başlığın 48px boşluğu, ortak ikon düğmesi kuralı), G14.
- (4) `.icon-button` 38×36px, telefonda 44×44 altında → **BL-334** (yeni; `apps/web/src/styles.css:2974-2977`), G15.
- (5) "kullanılmayan `list_my_workspace_identities_service`" → **bayat, numara açılmadı**: Account → Profile'daki workspace görünüm bölümü kullanıyor (`apps/web/src/account/ProfilePage.tsx:278` → `:432-434` → `apps/web/src/lib/supabase.ts:355` → `GET /v1/account/workspace-identities`, `apps/api/src/account/workspace-account-routes.ts:420` → `workspace-account-service.ts:299`).
- (6) Account'ta iki telefon alanı → **BL-335** (yeni, veri kararı), GK.

## Notes / Result
- 2026-09-29 (`task/backlog-program-5`, taban `8526fac0`): G22 onaylı (R2 ONAY @`9d3791e5`), toplu turu bekliyor. İncelemenin engel olmayan iki notu BL-350 (G13) → açık madde 255 → **256**.
- 2026-09-29 (`task/backlog-program-5`, taban `f1f6a46e`): G22 bitti (inceleme sürüyor), G19 başladı (tarayıcı-yerel saat kısmı sonraya, BL-277'ye not). BL-349 (Shift types bilgi baloncuğu ortak Tooltip dışında, G15) açıldı → açık madde 254 → **255**.
- 2026-09-29 (`task/backlog-program-5`, taban `23f734bf`): G6 bitti (inceleme @`62782c12`), G9 başladı (G6 işçisi). KK-17 program satırlarına işlendi: BL-343 G21'den G6'ya, BL-342'nin "G6 ardı" notu kalktı. BL-348 (tercih edilen ad onay bildirimi `/app`'e gidiyor, `/app/account/profile` → `/account/profile` yönlendirmesi, G16) açıldı → açık madde 253 → **254**.
- 2026-09-29 (`task/backlog-program-5`, taban `198a602c`): KK-15…18 durumu grup satırlarına (G2, G4, G6 bitti; G5, G22 başladı). İşçi kayıtları: BL-345 (çip kenarı, G14), BL-346 (ölü `.schedule-shift-drawer` CSS'i, G23), BL-347 (Export penceresi not uyarısı, G14); BL-318'e `#c7d0cc`, BL-101'e cron notu; BL-101 ve U63 "hosted bekleyen". Açık madde 250 → **253**.
- 2026-09-29 (`task/backlog-program-4`, taban `4e980348`): G6 işçisinin kayıtları (koordinatör aktardı): BL-099'a G7 notu (owner'ın kendi ad talebi `no_self` ile takılır); BL-342 (onayda bildirim, G6 ardı), BL-343 (`availability.status_changed` üretici kaydı silinmiş, G21), BL-344 (kararsız `bl052_document_onboarding` hücresi, G12) açıldı → açık madde 247 → **250**.
- 2026-09-29 (`task/backlog-program-4`, taban `12dbc741`): G17–G24 tazeliği ölçüldü (yukarıdaki bölüm), dokunduğu dosyalar G17–G24 için "ölçüldü"; tahminde yalnız GA ve G16 kaldı (Account sonrası). U07, U14, U15 bayat, kapandı → açık madde 249 → **246**. Koordinatör eki: BL-341 (Documents sayacı onboarding adımlarını sayıyor, G18) açıldı → **247**. KK-14: U43 kapanmaz, işi "yayımlanmış belgede `published_at` zorunlu" CHECK'i oldu (G18, `nf-db`).
- 2026-09-29 (`task/backlog-program-4`, taban `67c88bc0`): G10–G12 dokunduğu dosyalar işlendi (devir notu listeleri). G13–G15 tazeliği ölçüldü (yukarıdaki bölüm), dokunduğu dosyalar G13–G15 için "ölçüldü". U36, BL-307, BL-154 bayat, kapandı → açık madde 250 → **247**. Koordinatör eki: BL-339 (Preferences "System" biçimi, G16) ve BL-340 (pasif düğme görünümü, G15) açıldı → **249**. BACKLOG.md'de KK-7 karar satırı BL-338'in altından BL-335'in altına taşındı (main'de yanlış yerdeydi).
- 2026-09-29 (`task/backlog-program-2`, `nf-planlama` devralan oturum; taban `origin/main` `8b98e37d`):
  - **GK:** her maddeye Öneri + vizyon Gerekçesi yazıldı; dört madde KRİTİK (BL-238, BL-335, BL-317, BL-121). U42 ve U46 bayat çıktı, GK'den çıktı (kanıt GK bölümünün sonunda). GK artık 13 madde.
  - **KK-1** "İş sırası" başında ve ILERLEME §9'da; **KK-4, KK-5** Risk, İş sırası, bağımlılık tablosu ve T3/T5 satırlarında.
  - **G0 bitti:** BACKLOG.md'de 33 G0 satırından 29'u + U46 + U42'nin iki P1 kalemi "Kapanan maddeler"e taşındı (kapanış sebebi yazılı olmayanlara kanıtlı "Kapandı 2026-09-29 (G0 …)" eklendi; BL-137 işareti "kapandı; açıkken …" biçimine çevrildi). Numarasızlardan U27 → **BL-336** (koşulu gerçekleşti: hosted "Confirm email" açık, K22), U52 → **BL-337** (20 uyarı, 2026-09-29 `npx eslint apps/web/src -f json` ile yeniden sayıldı). "FOUNDATION-B bağlantıları" bölümü dağıtıldı: BL-070, BL-094, BL-096, BL-099, BL-101'in altına bağlantı satırı; kapanmış maddelerinki (BL-091, BL-097 …) düştü. U66'nın altında yetim kalan K13 kararı kapanmış BL-230'un altına bağlandı (`f187c53d`'de ana satırı taşınırken geride kalmıştı). U11 kararı (telefonda Export yok) KARARLAR → Ekran kararları → Schedule'a yazıldı.
  - **Sayım (betik + bağımsız tarama, 2026-09-29):** açık bölümde üst düzey madde **258** = 290 − 31 kapanan G0 satırı − U46 (U27, U52 numaralanıp açık kaldı; U42 kalan kalemleriyle açık). Açık bölümde "kapandı" satırı kalmadı (tek istisna BL-332 "KAPANDI-bekliyor", KK-2 ile main'e girince taşınır). BACKLOG.md 555 → 553 satır.
  - `DONE.md`'ye satır yazılmadı: G0'daki kapanışlar eski işlerin kaydı ya da bayat maddeydi; yeni iş bitmedi.
- 2026-09-29 (`task/backlog-program-3`, taban `9adae6f8`): G10–G12 tazeliği ölçüldü (yukarıdaki bölüm); 5 madde bayat, kapandı → açık madde 255 → **250**. BACKLOG.md 626 → 667 satır.
- 2026-09-29 (`task/backlog-program-3`, taban `9adae6f8`): KK-12 (G7 dilimlere bölündü; G7 = FB-6.2.1 kapsamı, 10 madde; 7'si GF'ye, BL-071 GS'ye) ve KK-13 (BL-132 ilkesi) program dosyasına ve 20 maddenin altına işlendi; `FB-6.2.md:137`/`:29` sayı çelişkisi BL-155'e not düşüldü. Sayım commit öncesi betikle doğrulandı (255, kopya 0, eksik 0, fazla 0).
- 2026-09-29 (`task/backlog-program-3`, taban `a81154b3`): KK-11 işlendi (BL-279 high, G5–G7 satırları, ILERLEME §8). G7–G9 tazeliği ölçüldü (yukarıdaki bölüm), dokunduğu dosyalar G7–G9 için "ölçüldü". BL-188, BL-183, BL-185 bayat, kapandı → açık madde 258 → **255**. BACKLOG.md 579 → 606 satır (27 tazelik satırı; 3 madde taşındı).
- 2026-09-29 (`task/backlog-program-3`, taban `b5747bd4`): GK kararları (KK-6…KK-10) gruplara taşındı, GK'de yalnız BL-073; yeni GA satırı (BL-335) ve T0 turu; BL-338 açıldı (G17). BACKLOG.md'de 13 maddenin altına karar/durum satırı. **Sayım (betik, commit öncesi):** açık madde **258** = 257 + BL-338 (211 numaralı + 47 numarasız); programdaki gruplarda (G0 hariç G1–G24, GA, GK, GF, GY, GS) 258, kopya 0, eksik 0, fazla 0. BACKLOG.md 564 → 578 satır.
- 2026-09-29 (`task/backlog-program-3`, taban `ade5c270`): G4–G6 tazeliği ölçüldü (yukarıdaki bölüm), dokunduğu dosyalar sütunu G4–G6 için "ölçüldü". BL-157 bayat, kapandı → açık madde 258 → **257**. BACKLOG.md 553 → 564 satır (11 tazelik satırı; BL-157 taşındı).
- 2026-09-29: taslak `nf-planlama`. Gruplama, BACKLOG.md'den betikle çıkarılan özet dizinden (kimlik, işaret, başlık, anılan dosyalar) ve karar içeren maddelerde ilgili cümleden yapıldı; 298 KB'lık dosya baştan sona okunmadı. İlk 3 grubun tazeliği üç salt okur alt ajanla ölçüldü; `nf-planlama` hükümleri gözden geçirip BACKLOG.md'ye yazdı.

## Ek: numarasız maddelerin takma adları
Satır numaraları `3a31d625` anındaki BACKLOG.md'ye göre; metnin başı aramak için. Tam dizin: `docs/plan/research/backlog-index-2026-09-29.md`.

| Takma ad | Satır | Grup | Metnin başı |
|---|---|---|---|
| U01 | 13 | G0 (kapandı) | BL-040 Line Up sadeleştirme. KAPANDI 2026-09-24: Line Up FOUNDATION-B 5.6'da silindi; sıfı |
| U02 | 31 | GY | OBS-001 Invite/access mutasyonları (reminder/revoke/remove access) ve provider kabulü → ta |
| U03 | 32 | GY | OBS-002 Availability save → manager → Schedule browser zinciri ve otomatik bildirim (local |
| U04 | 38 | G24 | Genel seed/SQL replay hataları (release öncesi). |
| U05 | 47 | GS | Export iyileştirme fikirleri: somut kullanıcı feedback'i bekleniyor. |
| U06 | 48 | GS | Eski toplu fikir grupları (BL-010..025: dashboard'lar, raporlar, mobil, enterprise, termin |
| U07 | 51 | G24 (kapandı) | README.md eski içerik taşıyor (payroll/kiosk fazları); rescue'da silinmişti, geri tutuldu. |
| U08 | 52 | G14 | Schedule topbar dar pane'de (936px) iki satıra sarıyor; taşma yok, polish (F5). |
| U09 | 53 | G0 (kapandı) | Schedule topbar filtre çipleri Settings dropdown'ının üstünde render ediliyor (z-index) →  |
| U10 | 54 | G0 (kapandı) | Light tema token seti → tasks/THEME-002. KAPANDI 2026-09-16 (THEME-002). |
| U11 | 55 | G0 (kapandı) | ≤760px'te Schedule Export erişilemiyor → KARAR (2026-09-16): mobilde export yok; mevcut da |
| U12 | 56 | G13 | App.test.tsx schedule-data mock'u scheduleReadKey'i gerçek koddan farklı (view dahil) üret |
| U13 | 57 | G20 | Export PNG önizlemesi her sayfayı 2.5x ölçekte render ediyor; çok sayfalı haftalarda yavaş |
| U14 | 58 | G23 (kapandı) | Prod build'e erişilemeyen lazy chunk'lar giriyor (ScheduleShiftBadgeLab, Kiosk, TimeEntrie |
| U15 | 59 | G23 (kapandı) | EmployeeHubPage pageCopy'de time-tracking metni ve independentPage mantığı duruyor (BL-057 |
| U16 | 60 | G13 | ScheduleExportSchedules.test.tsx makine TZ'sine bağlı; testte TZ'yi mock'la (CI şu an TZ p |
| U17 | 61 | G24 | Kullanıcı dizinindeki C:/Users/TheWe/node_modules (ör. @types/node 25.5) repo bağımlılıkla |
| U18 | 62 | G13 | CI test adımı 7dk (concurrency=1); ileride concurrency=2 denensin. |
| U19 | 63 | G13 | Tam local pnpm test'te yük altında flaky testler: api organization-settings-routes, web Em |
| U20 | 64 | G20 | EXP-002: export çıktı görünümünün kalanı (PNG önizleme ölçeği + kullanıcı geri bildirimi); |
| U21 | 65 | G15 | (leave: low / do: moderate) THEME-003 (MVP-PLAN F5): (1) yakın renk tonlarını (ΔE<4) THEME |
| U22 | 66 | G0 (kapandı) | THEME-002 açıkları → tasks/THEME-004 (sayfa CSS token'ları, on-accent, employee AA). Yakın |
| U23 | 67 | G0 (kapandı) | Owner onboarding'de lokasyon short name önerisi ve phone alanı yok → tasks/LOC-002. KAPAND |
| U24 | 68 | G0 (kapandı) | Hosted'a location_phone migration'ı → tasks/LOC-002 (publication migration'ı UI-DOC-001 so |
| U25 | 69 | G24 | Supabase CLI v2.109 → v2.117 güncellemesi (db push sırasında pg-delta sertifika ENOENT gür |
| U26 | 70 | G11 (kapandı) | /v1/invitations/pending |
| U27 | 71 | G16 | → **BL-336** (G0'da numaralandı): davet token'ı e-posta onayı boyunca saklanmıyor |
| U28 | 72 | G0 (kapandı) | Vercel Authentication (newfork-clean-api, Production) smoke bitince yeniden açılacak (memo |
| U29 | 73 | G15 | .employee-remove-access { color: #9b3442 } (styles.css 2359) ölü kural: "Remove access" kı |
| U30 | 74 | G15 | SecurityPage "Cancel change" butonu kırmızı (danger) görünüyor; iptal eylemi için doğru to |
| U31 | 75 | G11 (kapandı) | Onboarding getter geçersiz ya da erişilemeyen workspaceId için "unavailable" (P0002) veriy |
| U32 | 76 | G12 | pgTAP borcu: BL-052 sonrası üç onboarding/document test dosyası kırmızı; employee_onboardi |
| U33 | 77 | G0 (kapandı) | .workspace-row capitalize hatası KAPANDI: kural UI-PRE-001 D1'de silindi (6d9f0e7). |
| U34 | 78 | G0 (kapandı) | Pending başlığının yüklenirken görünmesi KAPANDI: kit yükleme durumunda "Checking your acc |
| U35 | 79 | G0 (kapandı) | main CI THEME-004'ten beri kırmızıydı: MainNavigationHeaderContract.test.ts eski --lu-mute |
| U36 | 80 | G13 (kapandı) | CI: .github/workflows/ci.yml yalnız docs/** değişen push'larda tetiklenmesin (paths-ignore |
| U37 | 81 | G11 | POST /owner-onboarding/invitation-intents body'yi yetkiden önce doğruluyor (yetkisiz + geç |
| U38 | 82 | G24 | Local DB kalıntısı (AUTH-UX-001 fixture'ları, 2026-09-17 kısmi temizlik): "AUTH-UX Bistro" |
| U39 | 83 | G15 | (leave: low / do: moderate) Uygulamada kendi elle yazılmış onay pencereleri hâlâ var; orta |
| U40 | 84 | G15 | (leave: low / do: moderate) Roles > rol silme hâlâ kendi iki tık kopyasını kullanıyor (Rol |
| U41 | 85 | G15 | (leave: low / do: safe) Workspace ana sayfasındaki "Customize" ve "Add" butonları secondar |
| U42 | 86 | G11 | Teknik borç denetimi: Kiosk/Time Entries ve CI pgTAP kalemleri kapandı (G0); kalan kalemler G11 |
| U43 | 92 | G18 | Documents: migration öncesi published kayıtların published_at'i null; listede "-" görünüyo |
| U44 | 93 | G18 | Documents: DB trigger'ı published tanımın düzenlenmesini reddediyor; drawer bu yüzden salt |
| U45 | 94 | G24 | exceljs@4.4.0 > uuid@8.3.2 moderate advisory: exceljs yalnız uuid.v4 kullandığı için istis |
| U46 | 95 | G0 | `eslint-plugin-react-hooks` kurulumu — bayat, kapandı (G0; `d09cf0ff`) |
| U47 | 96 | G24 | supabase/seed.sql:143 "Pending Demo" üyeliği pending_activation ama employee_onboarding_ca |
| U48 | 97 | G16 | UI-PRE-001 backlog'u (aynı tasarım diliyle, sonra): /sign-in kayıt modu ve sonlanan oturum |
| U49 | 98 | G16 | Yeni taslak business'ın varsayılan adı "New organization" (CreateOrganizationButton.tsx:15 |
| U50 | 99 | G0 (kapandı) | Proje CLAUDE.md yeniden yazılmayacak (kullanıcı kararı 2026-09-18: "kurallara gerek yok"). |
| U51 | 100 | G11 | Tipli hata göçü: kullanıcı kararı "önce riskli modüller" (auth, hesap, davet, workspace).  |
| U52 | 101 | G13 | → **BL-337** (G0'da numaralandı): 20 `exhaustive-deps` uyarısı, 2026-09-29'da yeniden sayıldı |
| U53 | 102 | G16 | Workspaces listesinde SON satırın "…" menüsü kırpılıyor: .workspace-list { overflow: hidde |
| U54 | 103 | G16 | Kurulumu bitmemiş business'ı "Discard" etmek 10 dakikadan eski oturumda API tarafından red |
| U55 | 104 | G11 (kapandı) | AcceptInvitationPage "yanlış hesap" durumu sunucunun İngilizce cümlesine bağlı; API artık  |
| U56 | 105 | G16 | Pending sayfası, kurulumu bitmemiş bir business'ı o business'ın SAHİBİ OLMAYAN üyesine hâl |
| U57 | 106 | G16 | finalizeActivation reddedilirse employee onboarding sayfası asılı kalabiliyor; yalnız askı |
| U58 | 107 | G16 | Workspaces sayfasının satır DIŞI metinleri hâlâ eski dilde ("Workspaces" başlığı, açıklama |
| U59 | 108 | G18 | HATA (uygulama içi DocumentReviewDrawer): dosya yükleme, taslak dosya silme ve erteleme li |
| U60 | 109 | G18 | DocumentReviewDrawer'ın 10 mutation'ından 8'i hiç test edilmiyor (acknowledge, withdraw, d |
| U61 | 110 | G0 (kapandı) | KARAR (kullanıcı, 2026-09-18): uygulama içi EmployeeDrawer da aynı mantığı alacak. |
| U62 | 111 | G0 (kapandı) | Üç cron endpoint'i tetiklenmiyor KAPANDI 2026-09-19: dördü de pg_cron'da (OPS-014, b7052f6 |
| U63 | 112 | G4 | Zamanlanmış export işi hosted'da 503 "Email delivery is not configured" dönüyor: job ve ye |
| U64 | 113 | G24 | Hosted'da VITE_API_URL tanımlı değil; web aynı alan adına relative istek atıyor. Bugün doğ |
| U65 | 114 | G0 (kapandı) | 2026-09-19 kullanıcı kararı: katılım zinciri (davet, onboarding, çakışmalar, business kapa |
| U66 | 290 | G0 (kapandı) | Gözlem (madde değil): 2026-09-27 yerel e2e koşusunda Chrome bir kez 0xE0000008 ile çöktü,  |
