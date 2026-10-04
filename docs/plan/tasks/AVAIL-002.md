# AVAIL-002 Müsaitlik kapanışı — her zaman uyarı, not hatırlatması, preflight, mod çevirisi, yazma yolları çekirdeğe
Status: draft — 2026-10-04 (`nf-planlama`, koordinatör `local_10a5177a…`'ın görevi). Mert'in onayı ve açık soruların (S1–S5) cevabı bekleniyor.
Session: -   Branch: task/avail-002-<dilim>   Worktree: newfork-wt/avail-002-<dilim>   DB: A1, A2 `db.lock` ile
Reviewer: `nf-guvenlik` zorunlu (R3: yetki çekirdeği, tek yazma kapısı `guard_schedule_assignment_availability`, tablo/kolon silme) — A1+A2 bir ONAY, B ayrı ONAY; `nf-gorsel-qa` (C1, C2: Schedule, Settings, My availability değişiyor); ultrareview önerisi yalnız A2 için tek satır (yetki + tablo silme; ücretsiz hak bittiyse açılış penceresindeki dolar tutarıyla; ILKELER P06: Mert iki kez "iki inceleme yeter" dedi).
Risk sınıfı: **R3** (yetki, RLS dışı yazma kapısı, veri silme). Puan: **26** (ILERLEME "Büyüklük ölçütü"; dilim tablosu aşağıda).

Kaynaklar: KARARLAR "Müsaitlik (kullanıcı kararları 2026-10-04)" M1–M13 (`KARARLAR.md:126-141`); prensip `docs/plan/research/MUSAITLIK-calisma-prensibi-2026-10-04.md` ("Sonra"); tasarım seçimleri (Mert, 2026-10-04, koordinatörün penceresi; besleme `.newfork-inbox/kayit-besleme-avail-tasarim-2026-10-04.md`): **S1 A+C, S2 B, S3 B, S4 E, S5 B** ve dört cevap; tasarım dalı `task/avail-design` @`8066c66a`, Artifact https://claude.ai/artifact/DzdPU3Nhep6mo4nPMZUHDu, rapor `.newfork-inbox/done/20261004T113539-isci-avail-design-avail-tasarim.md`. FB-6.4 sınırı: `docs/plan/tasks/FB-6.4.md` Out of scope 6.

## Tazelik 2026-10-04 (`origin/main` `18f07860`; yerel DB son migration `20261006030000` = main'in son dosyası — ölçüldü)
| # | İddia (görev mesajı, main `475c63ca` ölçümü) | Hüküm | Kanıt (bugün) |
|---|---|---|---|
| T1 | Mod değişikliği `weekly_preference_settings_save_service` + `weekly_preference_convert` | geçerli | son tanım `supabase/migrations/20260924204854_old_availability_is_gone.sql:1165-1231`; çevirici yalnız `20260922180000_changing_the_entry_mode_converts_every_saved_week.sql:20-58` |
| T2 | Çeviri gece yarısını geçen tipte ve tipler arası boşlukta kayıplı | geçerli | tipten saate tek aralık, boşluk "unavailable" sayılıyor (`20260922180000…:13-14`, `:41-43` `min/max`), gece yarısını geçen tip 24:00'te kesiliyor (`:16-17`, `:35`, `:43`); saatten tipe 1 dakika değen tip bütün işaretleniyor (`:10-11`, `:36-37`) |
| T3 | "Check your availability" yalnız haftası çevrilene gidiyor | geçerli | alıcılar yalnız modu farklı kaydı olanlar (`20260924204854…:1201-1204`); kaydı hiç olmayan çalışana gitmiyor |
| T4 | Mod çevirisinin geçmiş kaydında aktör yanlış | **bayat** | `source` sütunu kişiyi değil kaydı söylüyor (`'employee'` = çalışanın haftası, `'manager'` = not haftası; `20260909041800_weekly_preferences_commands.sql:10`); `actor_user_id` doğru (değiştiren owner, `20260924204854…:1207,1215`). Geçmiş tablosunu okuyan ekran ya da servis yok (yalnız pgTAP). İş açılmaz. |
| T5 | Keep/cancel: `weekly_preferences_save_service` + web `WeeklyCommitmentReview` | değişmiş | servis `20260926130000_manager_note_is_about_employees.sql:311-` (zorunlu karar `:333-340`, iptal döngüsü `:342-`); web'de pencereyi `WeeklyPreferencesForm.tsx:12,110-134,395-399` açıyor (görev mesajındaki `WeeklyPreferencesPanel.tsx` yalnız tekrar anahtarını kuruyor, `:55-59`). Ek ikiz: önizleme ucu yalnız bu pencere için var — `weekly_preferences_preview_service` (`20260909041800…:139-144`), API `availability-service.ts:67-68,79`, shared `weekly-preferences.ts:170,191`. Yerel DB: `weekly_preference_commitment_conflicts` + `weekly_preference_commitments` 2 fonksiyon var. |
| T6 | `assess_weekly_shift_availability` müsaitliği hep 'warn' sayıyor | geçerli | son tanım `20261005000000_closed_days_reach_the_shifts.sql:1123-1349`; `when 'availability' then 'warn'` `:1299`, müsaitlik şiddete hiç katılmıyor `:1307`; not (`source 'reminder'`) aynı "unavailable" kümesinde `:1205-1210` |
| T7 | Conflict kuralı silinmiş; web satırı yok | geçerli | `20260926220000_availability_is_a_preference.sql:29-37` (kısıt ve varsayılan); yerel DB 395 workspace'te `availability` anahtarı yok; shared şema anahtarı reddediyor (`packages/shared/src/availability-assessment.ts:6-8`); web liste `apps/web/src/settings/ConflictHandlingSettingsPage.tsx:24-46`, sabit cümle `:163` |
| T8 | Publish onayı zorunlu | geçerli | `20261003034000_publish_notes_time_off_waiting_for_a_decision.sql:69-80` (bulgu `warning_policy 'confirm'`), `:132-136` ("Acknowledge the availability warnings before publishing"), `:143` "Previously accepted"; web `apps/web/src/schedule/components/PublishPreflightPanel.tsx:16,21,50-66` |
| T9 | `availability_changed_after_publish` onaylı izni de sayıyor; web'de çizilmiyor | geçerli + ek | `20261005000000…:1535-1537` ve `:1555` `(week.unavailable + week.leave)`; ölçü son yayının anlık görüntüsü (`availability_snapshot`), ilk yayın değil → unpublish/republish yazıyı siler (M11'e aykırı). Web'de alan yalnız şemada (`packages/shared/src/index.ts:1480`), çizen yok. |
| T10 | Otomatik doldurma notu engel sayıyor | geçerli | `preview_schedule_auto_fill_service` son tanım `20260926220000…:735-`, `:763` `has_availability_conflict` olanı atlıyor; not o kümede (T6) |
| T11 | Çalışanın kendi kaydı ham üyelik; mod ayarı eski yardımcı | geçerli | `own_record` ham `workspace_memberships` (`20260926130000…:268`); ayar `service_actor_has_permission(...,'settings.schedule_rules.manage')` (`20260924204854…:1108`). Sınıflama satırları çekirdek eylemi söylüyor ama gövde sormuyor (`supabase/tests/authorization_coverage.test.sql:271-275`). Eski yardımcının çağıranı yerel DB'de **11** (biri `weekly_preference_settings_read_service`; tavan `authz_catalog.test.sql:137-150`). Yönetici tarafı zaten çekirdekte (`weekly_preference_manager_scope` → `authz_reason`, `20260926130000…:242-252`). |
| T12 | Kaydedilmemiş değişiklik sorulmadan kayboluyor | geçerli | Availability paneli `AvailabilityDraftScope` dışında (`apps/web/src/views/EmployeeHubPage.tsx:237-241`; izin tarafı içinde); `WeeklyPreferencesForm.tsx:64` `dirty` var, koruma yok. Ortak koruma hazır: `availability/availability-navigation.tsx:85` `useAvailabilityNavigationGuard` (5 ekranda kullanılıyor). |
| T13 | Dashboard `#availability` bağlantısı ölü | geçerli | `apps/web/src/employee-hub/EmployeeDashboard.tsx:234,319`; `id="availability"` hiçbir yerde yok (yalnız `my-availability-tab/panel`, `EmployeeHubPage.tsx:224-236`) |
| T14 | M3 "All day" kendiliğinden — yok | geçerli | `apps/web/src/availability/WeeklyUnavailableEditor.tsx:150-175` tip düğmesi yalnız listeye ekliyor |
| T15 | Not Takvim'de sürekli görünüyor (M12'ye aykırı) | geçerli | `apps/web/src/schedule/lib/scheduleAvailabilityMark.ts:61-65` notu turuncu pencere olarak çiziyor |
| T16 | Warn her yazmada kutu açmıyor (M8'e aykırı) | geçerli | `ShiftQuickEditor.tsx:408` "it never asks", `schedule-conflicts.ts:16` |
| T17 | Çalışan metni Hard block'ta yanlış olur | **bayat** (2026-10-04, besleme #148: Hard block kalktı; S5 Mert "Bugünkü kalsın") | `WeeklyPreferencesForm.tsx:280` "a manager can still schedule you…" — cümle doğru kalır |

Backlog'a dokunan hükümler (BACKLOG.md'ye işlenmesi kayıt oturumunun):
| Madde | Hüküm | Bu işte |
|---|---|---|
| BL-206 BL-186 sonrası ölü kod | geçerli — `apps/api/src/schedule/schedule-routes.ts:1422`, yerel DB'de `list_schedule_draft_availability_conflicts_service` var, shared `missing_reason` `packages/shared/src/index.ts:2010` | evet (A1 + B; preflight aynı yerde değişiyor) |
| BL-174 yayın tetikleyicisi kabulü korurken her nedeni atlıyor | geçerli (ölçülmedi, tetikleyici yerel DB'de var) | kısmen: A1 tetikleyicinin müsaitlik yolunu ölçer ve testler (müsaitlik hiçbir yazmayı reddetmez; Hard block 2026-10-04'te kalktı), izin yolu BL-174'te kalır |
| BL-135 "Manager note" Takvim'de not işareti | **değişmiş** — M12 (2026-10-04) notu Takvim'den kaldırıyor; Takvim yarısı bayat, "Last edited by" yarısı geçerli | hayır (kayıt oturumu maddeyi daraltır) |

Goal: Müsaitlik 2026-10-04 prensibine (M3, M4, M5, M7–M12) ve Mert'in tasarım seçimlerine göre çalışır; iki yazma yolu yetki çekirdeğine taşınır. Örnek: KadıköyGarson1 Salı 18:00 sonrasını "unavailable" işaretlemiş. Settings'te müsaitlik ayarı yoktur; KadıköyMüdür1 Schedule'da Salı 19:00 vardiyasını KadıköyGarson1'e yazarken her seferinde "Scheduling rule" kutusu açılır (Cancel / Place shift); Place shift ile yazılır, müsaitlik hiçbir zaman çakışma (conflict) üretmez ve engellemez; Auto-fill onu seçmez. KadıköyMüdür1'in KadıköyGarson1 için "School mornings" notu Takvim'de görünmez; Çarşamba 09:00 vardiyası yazılınca hücrenin altında not kartı çıkar ve onay ister. Publish → Pre-flight müsaitlik bölümünü tek katlanır satırda listeler, onay istemez. KadıköyGarson1 Perşembe vardiyası yayınlandıktan sonra Perşembeyi işaretlerse kartın "!" balonunda "Changed after publishing" yazar; onaylı izni bunu yazdırmaz.

## In scope
- **A1 — değerlendirme, yazma kapısı, yayın** (`nf-db`; R3):
  1. ~~`conflict_rules`'a `availability` anahtarı~~ — **düştü** (2026-10-04, Mert: "availibility hiçbir zaman hard block olmasın. settingsten kaldıralım. her zaman için warn olsun. hiç bir zaman da conflict oluşturmasın"; besleme #148): ayar yok, migration yok; T7'deki bugünkü hâl (anahtar yok) doğru.
  2. `assess_weekly_shift_availability` (`20261005000000…:1123`): çalışanın işareti her yazmada onay (Warn kutusu) üretir; hiçbir zaman `blocked` ya da Schedule çakışması (conflict) üretmez (M8); not (`reminder`) şiddete, `has_availability_conflict`'e ve parmak izine **girmez**, ayrı `note` gerekçesi olarak döner (M12). 16 okuyucu yerinde kalır (FB-6.4 Out of scope 1: taşıma rafta; burada yalnız fonksiyonun içi değişir).
  3. Tek yazma kapısı `guard_schedule_assignment_availability`: müsaitlik yüzünden hiçbir yazmayı (taslak, yayın kopyası, onaylı takas) reddetmez; bugün bir müsaitlik reddi yolu varsa kalkar (`nf-db` ölçer). Hard block ve S1 düştü (besleme #148).
  4. Auto-fill (`preview_schedule_auto_fill_service`, `20260926220000…:763`): çalışanın işareti her iki ayarda dışarıda (D3), not hesaba katılmaz.
  5. Preflight (`weekly_schedule_publication_preflight`, `weekly_publication_decisions`, `20261003034000…:69-144`): müsaitlik bulgusu `tier 'note'` (onay yok), `acknowledged_by_*` ve "Previously accepted" dalları silinir (koordinatör kararı, besleme) — yalnız müsaitliğe ait olanlar; önceki yayında kabul edilmiş öteki çakışmanın "retained" kaydı kalır (KK-132); "Acknowledge the availability warnings" hatası kalkar; not preflight'a girmez (M12). BL-206'nın DB yarısı (`list_schedule_draft_availability_conflicts_service`) silinir → `retired_objects_stay_gone`.
  6. "Changed after publishing" (M11): ölçü vardiyanın **ilk** yayınındaki değerlendirme (D8); onaylı izin sayılmaz (`:1555`'ten `week.leave` çıkar); unpublish → republish değiştirmez.
  7. Okuma projeksiyonu: not aralıkları ızgaranın turuncu işaretinden ayrılır (yalnız yazarken görünen not kartı için ayrı alan, `availability.note_read` ile).
- **A2 — yazma yolları ve mod çevirisi** (`nf-db`; R3; A1 ile aynı dal olabilir, ayrı commit):
  1. M5: keep/cancel kalkar — `weekly_preferences_save_service`'ten karar döngüsü (`20260926130000…:333-`), `weekly_preferences_preview_service`, `weekly_preference_commitment_conflicts`, `weekly_preference_commitments`, `weekly_preference_commitment_decisions` tablosu ve `weekly_preference_events.decisions` kolonu silinir (D7) → `retired_objects_stay_gone`; `authorization_coverage.test.sql:273` satırı silinir. Bekleyen takas isteği hiçbir kayıtta değişmez.
  2. M4: çeviri düzeltilir — tipten saate kayıpsız, günde birden çok aralık (saat modu kaydı `range` → `ranges`, KK-131), gece yarısını geçen kısım ertesi güne (S2 a); saatten tipe kısmen değen tip işaretlenir (S3 a, bugünkü gibi; çalışan bildirimle düzeltir); sağlama pgTAP'te her gün için "önce unavailable dakikalar → sonra" karşılaştırmasıyla (gece yarısını geçen tip, iki tip arası boşluk, arşivlenmiş tip, all_day, boş gün hücreleri); bildirim D4'teki alıcılara.
  3. M3 sunucu tarafı: shift type modunda o günün bütün seçilebilir tipleri işaretliyse kayıt `all_day=true`, tip listesi boş olarak normalize edilir (D6).
  4. Yetki çekirdeği (CLAUDE.md §9): `weekly_preferences_read/save_service`'in kendi-kayıt dalı `app_private.authorize(…'availability.own'…)`; `weekly_preference_settings_read/save_service` `settings.availability.read/write` ile; ham üyelik ve `service_actor_has_permission` çağrısı kalkar (eski yardımcının çağıranı 11 → 10). "Hayır" 42501 + `authz.*` hint. M13: kendi kaydını yalnız employee rolü yazar (bugünkü kural, çekirdekte matris hücresi).
- **B — API, shared, web veri katmanı** (`nf-backend`; A1+A2 main'e girdikten sonra):
  1. Shared: `scheduleConflictRulesSchema`'ya müsaitlik anahtarı eklenmez (ayar yok); `availability-assessment.ts:6-8` "refused" yorumu ve reddi kalkar; preflight bulgusunda onay alanları kalkar; okuma modelinde not alanı ve `availability_changed_after_publish` yeni anlamıyla; `weeklyCommitment*` şemaları ve `decisions` silinir.
  2. API: önizleme ucu (`availability-service.ts:67-68,79`, `weekly-preferences-routes.ts:19`) silinir; BL-206'nın API ucu (`schedule-routes.ts:1422`) silinir; hayır sözleşmesi (üye olmayan 404, diğer `authz.*` 403).
  3. Web veri: `schedule-conflicts.ts` müsaitliği her yazmada uyarı kuralı olarak okur (kutu açılır, çakışma sayılmaz); not kartı verisi; anahtar durumu `schedule/store/scheduleUiStore.ts`'in mevcut kişiye özel deposunda (D5); `PublishScheduleDialog` `reasons`/`missing_reason` ölü kodu (BL-206 web yarısı).
- **C1 — Schedule ekranı** (`nf-arayuz`; B main'e girdikten sonra, yeni `origin/main`'den; tasarımlar `task/avail-design` @`8066c66a` `apps/web/src/dev/avail/`):
  1. S1 A+C: düzenleme şeridinde "Availability" aç/kapa ("Paste mode" biçimi) + Settings menüsünde aynı ayarın satırı (her zaman çalışır); kapalıyken turuncu tarama **ve kartlardaki turuncu "!"** gizlenir (Mert'in cevabı; M10'u genişletir), onaylı izin kırmızısı kalır; Warn kutusu ve preflight sürer.
  2. Warn kutusu (`ScheduleConflictSheet`): müsaitlik + not aynı vardiyaya düşerse tek kutu iki satır; not satırı her zaman görünür.
  3. S2 B: yalnız not varsa hücrenin altında not kartı, onay ister; geçilince iz kalmaz.
  4. S3 B: Pre-flight'ta müsaitlik bölümü tek katlanır satır, üstte "Ready to publish"; onay kutusu, "Previously accepted", "Acknowledged by" yok.
  5. "!" balonunda "Changed after publishing" C3 üçüncü tur A "Tinted header" ile (KARARLAR `:455`).
- **C2 — Settings ve müsaitlik girişi** (`nf-arayuz`; C1 ile aynı dal olabilir):
  1. ~~Settings → Conflict handling müsaitlik satırı~~ — **düştü** (Hard block yok, satır eklenmez; besleme #148); `:163`'teki "Availability is a preference…" cümlesi kalır (2026-09-26 kuralı geri geldi).
  2. M3 istemci: bütün seçilebilir tipler işaretlenince "All day" kendiliğinden açılır (onboarding adımı, My availability, Employees çekmecesi — M2 aynı bileşen).
  3. Kaydedilmemiş değişikliği My availability ve onboarding adımı sorar ("Discard unsaved changes?"), Employees çekmecesi sormaz (S4, koordinatör kararı; ILKELER P26 + K7) (`useAvailabilityNavigationGuard`).
  4. Dashboard bağlantısı (`EmployeeDashboard.tsx:234,319`) gerçek sekmeye (`?section=availability`, ölü `#availability` kalkar).
  5. ~~`WeeklyPreferencesForm.tsx:280` cümlesi~~ — **düştü**: S5 Mert "Bugünkü kalsın"; cümle doğru (Hard block yok).
  6. `WeeklyCommitmentReview.tsx` ve formdaki çağrısı silinir.
  7. S2 (a): saat modunda günde birden çok aralık — My availability, onboarding adımı ve Employees çekmecesindeki saat düzenleyicisi "Add hours" ile birden çok aralık alır (M2 aynı bileşen; M4).
- **D — e2e** (`nf-test`; C ile aynı pencere, `db.lock`): `e2e/flows/schedule-availability-warning.spec.ts` yeni kurala göre yeniden yazılır: (a) Warn: yazmada kutu, Place shift ile yazılır; (b) Auto-fill işaretli çalışanı seçmez, hiçbir yazma müsaitlik yüzünden reddedilmez; (c) not kartı onayla yazılır, Takvim'de not izi yok; (d) Pre-flight onaysız yayınlar; (e) yayından sonra işaret → "Changed after publishing", izin → yazmaz; (f) owner modu değiştirir, kaydı olmayan çalışan da "Check your availability" alır, takas isteği açık kalır.

## Out of scope
1. **Takas tarafı (M6):** aday listesi, kabulde S4-E "emin misin?" (günün çizelgesi), onayda S5-B "IF APPROVED" rıza satırı — FB-6.4 (A1.6, B.4). Takas KABULÜ de S4-E'yi kullanır (koordinatör kararı) — FB-6.4'te. D2 düştü (Hard block yok; tetikleyici takası da engellemez).
2. M1, M2, M7, M13: bugünkü gibi; yeni iş yok (M13 yalnız çekirdekte hücre).
3. `assess_weekly_shift_availability`'nin 16 okuyucusunun motora taşınması (FB-6.4 Out of scope 1, rafta).
4. BL-174'ün izin yolu; BL-135'in "Last edited by" yarısı; bildirim platformu (ILKELER P13).
5. Tasarımdaki yan bulgu (Shift Hub "Availability conflict" etiketinde simge yazıya yapışık, `shift-exchanges.css:209` / `:253`): FB-6.4 B kapsamındaki BL-397 ile aynı yer; burada dokunulmaz.
6. Geçmiş kaydındaki "yanlış aktör" (T4 bayat).

## Kararlar (dayanaklı; Mert'e gösterilir — CLAUDE.md §13)
- **D1** ~~Hard block yayını engellemez~~ — düştü (Hard block yok, besleme #148); müsaitlik yayını engellemez, işaretli saatteki vardiya kalır, Pre-flight listeler (M7 + M9).
- **D2** ~~Onaylı takasın atama yazması Hard block'tan muaftır~~ — düştü (besleme #148).
- **D3** Auto-fill çalışanın işaretini seçmez; notu hesaba katmaz. Dayanak: KARARLAR `:149` (BL-186 S3) + M12.
- **D4** "Check your availability" bildirimi workspace'teki employee rolündeki her aktif ve aktivasyon bekleyen kişiye gider (haftası olsun olmasın); not haftası çevrilen yöneticiye gitmez. Dayanak: KARARLAR M4 + M13 + ILKELER A anti-hedef "bildirim gürültüsü".
- **D5** Aç/kapa anahtarı kişiye ve cihaza özel, mevcut `scheduleUiStore` deposunda; varsayılan açık. Dayanak: M10 "kişiye özel ve hatırlanır" (koordinatör kararı) + P19 (en az bakım: mevcut depo).
- **D6** M3'te "bütün tipler" = o gün seçilebilir aktif tipler ("Previous" etiketli arşiv tipleri hariç); kayıt `all_day=true` biçiminde. Dayanak: M3 + P19.
- **D7** Keep/cancel'ın bütün parçaları silinir, ikiz bırakılmaz. Dayanak: M5 + CLAUDE.md §9 + P01.
- **D8** "Changed after publishing" ölçüsü vardiyanın ilk yayınındaki değerlendirmedir; saklama biçimi `nf-db`'nin teknik kararı. Dayanak: M11 + P19.
- **D9** Warn kutusu toplu işlemde (yapıştırma, kopyalama, şablon) bugünkü onaylı kuralların kutusuyla aynı davranır. Dayanak: M8 ("mevcut Scheduling rule kutusu").

## Sorular (§13 şablonu; cevaplandı 2026-10-04 ~13:45Z, koordinatörün penceresinde — besleme #148)
**S1 — Hard block'ta, işaretli saatte zaten duran vardiya düzenlenebilir mi?**
**Cevap: düştü.** Mert seçenek dışı yazdı: "availibility hiçbir zaman hard block olmasın. settingsten kaldıralım. her zaman için warn olsun. hiç bir zaman da conflict oluşturmasın" — KARARLAR M8 yeniden yazıldı.
Bugün: Schedule → hücre → vardiya kartı → saatini değiştir. Örnek: KadıköyMüdür1, KadıköyGarson1'in Salı 18:00–23:00 taslak vardiyasını, ayar Warn iken yazdı; owner ayarı Hard block yaptı; KadıköyMüdür1 bitişi 22:00'ye çekmek istiyor (vardiya hâlâ işaretli saatte).
- (a) **(Önerilen)** Saat ya da kişi değişince yeni yazma sayılır ve engellenir; dokunulmayan vardiya kalır ve yayınlanır. Kime görünür: KadıköyMüdür1 kırmızı kutuyu görür; vardiyayı silebilir ya da başkasına verebilir. Dayanak: KARARLAR M8 ("o hücreye yazamaz") + M7.
- (b) Mevcut vardiyanın düzenlenmesi serbest, yalnız yeni atama engellenir. Sonuç: işaretli saate düşen vardiya küçük adımlarla taşınabilir.
- (c) Ayar Hard block'a geçince işaretli saatteki taslak vardiyalar listelenir, owner'a gösterilir; düzenleme (a) gibi.
- Kaçış: Claude karar versin / Backlog'a yaz / Önce sohbette konuşalım.

**S2 — Tipten saate çevirirken iki tip arası boşluk ve gece yarısını geçen tip.**
**Cevap: (a)** kayıpsız, çok aralık (Mert, önerilen) — KARARLAR M4.
Bugün: Settings → Scheduling → Availability → Entry mode "Shift type" → "Time range". Örnek: KadıköyGarson1 Pazartesi Open (09–14) ve Dinner (17–02) tiplerini işaretlemiş. Bugün kayıt 09:00–24:00 olur: 14–17 arası müsait saati "unavailable"a düşer, Salı 00–02 kaybolur.
- (a) **(Önerilen)** Saat modunda gün başına birden çok aralık; gece yarısını geçen kısım ertesi güne yazılır. Sonuç kayıpsız; My availability, onboarding ve çekmecedeki saat düzenleyicisi birden çok aralık alır (C2'ye ~2 puan). Dayanak: KARARLAR M4 (kaybın kendisi değişikliğin nedeni) + ILKELER P11.
- (b) Tek aralık kalır; boşluk "unavailable" sayılır, gece yarısı sonrası ertesi günün başına eklenir. Sonuç: boşluk kaybı sürer, gece kaybı kalkar.
- (c) Bugünkü gibi; çalışan bildirimle düzeltir.
- Kaçış: Claude karar versin / Önce sohbette konuşalım.

**S3 — Saatten tipe çevirirken bir tipe kısmen değen işaret.**
**Cevap: (a)** değen tip işaretlenir (Mert, önerilen) — KARARLAR M4.
Bugün: aynı ekran, "Time range" → "Shift type". Örnek: KadıköyGarson1 Pazartesi 14:00–16:00 unavailable; Open 09–15, Dinner 15–23. Bugün ikisi de işaretlenir: Pazartesi 09–23 unavailable olur.
- (a) **(Önerilen)** Değen tip işaretlenir (bugünkü gibi), çalışan "Check your availability" bildirimiyle düzeltir. Sonuç: kimse işaretlediği saatte yazılmaz; fazla işaret çalışanın elinde. Dayanak: KARARLAR M4 (bildirim bu düzeltme için) + ILKELER P24 (çalışan kendi kısıtının sahibi).
- (b) Yalnız tamamen kapsanan tip işaretlenir. Sonuç: 14–16 hiç işaretlenmez, KadıköyGarson1 o saatte yazılabilir.
- (c) Kısmen değen tip varsa o gün işaretsiz kalır ve çalışana ayrıca söylenir.
- Kaçış: Claude karar versin / Önce sohbette konuşalım.

**S4 — Müsaitlik haftasında kaydedilmemiş değişiklik: hangi ekran sorar?**
**Cevap: (a)** — koordinatör kararı (dayanak ILKELER P26 + KARARLAR K7); KARARLAR Ekran kararları → Employee Hub.
Bugün: hiçbiri sormaz. Örnek: KadıköyGarson1 telefonda My availability'de beş günü işaretler, kaydetmeden Shift Hub'a geçer; işaretler kaybolur.
- (a) **(Önerilen)** My availability ve onboarding adımı sorar ("Discard unsaved changes?"), Employees çekmecesi sormaz. Dayanak: ILKELER P26 (kayıp büyükse sorulur) + K7 (Employees çekmecesi sormaz).
- (b) Üçü de sorar.
- (c) Hiçbiri sormaz (P26 "kısa form").
- Kaçış: Claude karar versin / Backlog'a yaz.

**S5 — Hard block'ta çalışanın My availability'deki açıklama cümlesi.**
**Cevap: (c) bugünkü kalsın** (Mert; önerilen (a) — ters seçim; Hard block kalktığı için cümle zaten doğru).
Bugün: Employee Hub → My availability → Availability'de "Availability is a preference, not a guarantee: a manager can still schedule you…" yazar; Hard block'ta bu yanlış olur.
- (a) **(Önerilen)** Cümle ayara göre: Warn'da bugünkü, Hard block'ta "Managers can't schedule you during hours you mark unavailable." Kime görünür: yalnız çalışan. Dayanak: ILKELER P11 (doğru veri) + P21 (tek cümle).
- (b) Cümle her iki ayarda kalkar.
- (c) Bugünkü cümle kalır.
- Kaçış: Claude karar versin.

## Dilimler, sıra ve puan
| Dilim | Rol | İçerik | Puan |
|---|---|---|---|
| A1 | `nf-db` | değerlendirme (her zaman uyarı), tetikleyici ölçümü, Auto-fill, preflight, ilk yayın, not ayrımı (ayar düştü) | 4 |
| A2 | `nf-db` | keep/cancel silme, çeviri + sağlama + bildirim, M3 normalize, yetki çekirdeği | 5 |
| B | `nf-backend` | shared + API + web veri (ayar şeması düştü) | 4 |
| C1 | `nf-arayuz` | Schedule (anahtar, kutu, not kartı, preflight, C3 yazısı) | 5 |
| C2 | `nf-arayuz` | All day, kaydedilmemiş soru, bağlantı, silme, çok aralıklı saat düzenleyicisi (S2 a); Settings satırı ve metin düştü | 4 |
| D | `nf-test` | e2e (a)–(f) | 3 |
Toplam 25 puan (önce 26; besleme #148: A1 5 → 4, B 5 → 4, C2 3 → 4). Sıra: (sorular cevaplandı) A1 → A2 (aynı dal olabilir) → main (+ canlıya migration, CLAUDE.md §8) → B → main → C1 + C2 → D → main. **FB-6.4 ile:** iki iş de `nf-db` test dosyalarına dokunuyor (`authorization_matrix`, `authorization_coverage`, `authz_catalog`, `retired_objects_stay_gone`, `ci-green.txt`); aynı anda değil, sırayla (CLAUDE.md §4). FB-6.4'ün "Hard block'ta rıza geçer" hücresi düştü (besleme #148). **Güncelleme (besleme #149):** Mert ~14:25Z: AVAIL-002 FB-6.4'ten önce başlar (takas aday listesi yeni müsaitlik biçimini okur; dayanak CLAUDE.md §9 + P01). A (A1+A2) main'e B'siz girmez; B A'nın dalından açılır, ikisi aynı pencerede main'e (KK-131). A1+A2 işçisi `local_91ac4f8d…`, dal `task/avail-002-a`, worktree `newfork-wt/avail-002-a`.

## Done when
1. Yerel DB: `conflict_rules`'ta `availability` anahtarı yok ve Settings → Conflict handling'de müsaitlik satırı yok (bugünkü hâl; Hard block kalktı, besleme #148).
2. pgTAP (yeni `supabase/tests/availability_always_warns.test.sql`, `ci-green.txt`'te): yönetici yazması onayla geçer; taslak, yayın kopyası ve onaylı takas yazmasında müsaitlik yüzünden hiçbir ret (23514) ve çakışma yok; not uyarı üretmez; Auto-fill notu olanı seçer, işareti olanı seçmez (D3).
3. Preflight: müsaitlik bulgusu onay istemiyor; `weekly_publication_decisions`'ta "Acknowledge the availability warnings" ve "Previously accepted" dalı yok (`prosrc` sayımı 0); `list_schedule_draft_availability_conflicts_service` yok ve `retired_objects_stay_gone`'da. Sayım yalnız müsaitlik metinlerine uygulanır (KK-132).
4. `availability_changed_after_publish`: ilk yayından sonra gelen işarette `true`; taslakta girilen işarette, onaylı izinde ve unpublish→republish sonrasında beklenen değer (pgTAP, üç hücre).
5. Keep/cancel: `weekly_preferences_preview_service`, `weekly_preference_commitment_conflicts`, `weekly_preference_commitments`, `weekly_preference_commitment_decisions` yok ve `retired_objects_stay_gone`'da; bekleyen takas isteği müsaitlik kaydından sonra aynı durumda (pgTAP); `grep -rn "WeeklyCommitmentReview\|weeklyCommitment" apps packages` 0.
6. Mod çevirisi: S2 (a) / S3 (a) sağlama hücreleri `weekly_preference_mode_conversion.test.sql`'de yeşil (gece yarısını geçen tip, boşluk, all_day, boş gün, arşiv tipi); bildirim kaydı olmayan employee'ye de gidiyor, yöneticiye gitmiyor (D4).
7. Yetki: dört servis `app_private.authorize` soruyor; ham `workspace_memberships` dalı ve `service_actor_has_permission` çağrısı yok; eski yardımcının çağıranı 11 → 10 (`authz_catalog` tavanı buna iner); manager/admin/owner kendi kaydını yazamaz (M13), kısıtlı kişi ve üye olmayan "hayır" + `authz.*` hint (pgTAP); API 404/403 (vitest). `availability.own` yalnız employee rolünde, aktivasyon bekleyen dahil; kısıtlı müdür / admin kendi kaydına "hayır" (KK-133).
8. M3: bütün seçilebilir tipler işaretlenince "All day" açılıyor (web vitest) ve sunucu kaydı `all_day=true` (pgTAP).
9. Ekran (C1, C2): S1 A+C, S2 B, S3 B ve dört cevap Mert'in seçtiği hâliyle; anahtar kapalıyken turuncu tarama ve "!" yok, kırmızı izin var; `nf-gorsel-qa` ONAY; masaüstü + telefon ekran görüntüsü `artifacts/nf-arayuz/avail-002/`.
10. Dashboard "Update availability" ve "My availability" bağlantıları sekmeyi açıyor (web vitest); S4: My availability ve onboarding soruyor, Employees çekmecesi sormuyor (vitest).
11. e2e (a)–(f) main CI e2e'de yeşil.
12. Schedule ızgara okuması ≤ 50 ms (`schedule_grid_read_budget`, CI `db`).
13. Tam kapı (lint, typecheck, test, build) + `test:db` yeşil; main CI yeşil.

## Touches
- A1, A2 `nf-db`: `supabase/migrations/**` (yeni), `supabase/tests/availability_warn_or_block.test.sql` (yeni), `availability_is_a_preference`, `weekly_preference_mode_conversion`, `weekly_preferences_commands`, `weekly_preference_settings`, `weekly_shift_availability_assessment`, `schedule_week_availability`, `authorization_matrix`, `authorization_coverage`, `authz_catalog`, `retired_objects_stay_gone` test dosyaları, `ci-green.txt`; gerekirse `supabase/test-support/builder.sql`.
- B `nf-backend`: `packages/shared/src/availability-assessment.ts`, `weekly-preferences.ts`, `index.ts` (preflight, okuma modeli); `apps/api/src/availability/**`, `apps/api/src/settings/organization-settings-service.ts`, `apps/api/src/schedule/schedule-routes.ts`; `apps/web/src/schedule/schedule-conflicts.ts`, `schedule/store/scheduleUiStore.ts`, `availability/availability-data.ts`, `PublishScheduleDialog.tsx` (veri).
- C1, C2 `nf-arayuz`: `apps/web/src/schedule/components/{ScheduleConflictSheet,ShiftQuickEditor,PublishPreflightPanel}.tsx`, `schedule/lib/scheduleAvailabilityMark.ts`, `views/SchedulePage.tsx` (şerit, menü), `settings/ConflictHandlingSettingsPage.tsx`, `availability/{WeeklyUnavailableEditor,WeeklyPreferencesForm,WeeklyCommitmentReview}.tsx`, `views/EmployeeHubPage.tsx`, `employee-hub/EmployeeDashboard.tsx`, ilgili CSS.
- D `nf-test`: `e2e/flows/schedule-availability-warning.spec.ts` (+ yeni senaryolar `e2e/flows/`).
- Aynı dosyada iki rol aynı anda yok: `ShiftQuickEditor`, `SchedulePage`, `PublishScheduleDialog` B'de yalnız veri, C1'de görünüm — sırayla.

## Test plan
- A: önce kırmızı pgTAP (superpowers:test-driven-development); migration tek transaction + rollback denemesi (CLAUDE.md §7); `test:db` `db.lock` ile; supabase:supabase-postgres-best-practices (tetikleyici ve `assess` sıcak yol; ≤ 50 ms).
- B: API vitest (silinen uç 404, Conflict handling şeması, hayır sözleşmesi), shared vitest, web vitest; tam kapı.
- C: web vitest + gerçek uygulamada masaüstü + telefon ekran görüntüsü + `nf-gorsel-qa`.
- D: `pnpm.cmd e2e` (`db.lock`), sonra main CI.

## Risk
- **Tek yazma kapısı:** `guard_schedule_assignment_availability` taslak, yayın ve takasın her yazmasını görüyor (BL-186 notu). Hard block kalktı (besleme #148); risk, tetikleyicide müsaitlik yüzünden bir ret yolunun kalması → Done when 2 hücreleri her yazma yolunu dener.
- **Silinen tablo:** `weekly_preference_commitment_decisions` ve `decisions` kolonu canlıda satır taşıyorsa canlıya gönderim Mert'e sorulur (CLAUDE.md §8: canlıda gerçek veri silme yetki dışı). Önce canlıda `count(*)` SELECT.
- **`assess` 16 okuyucuya yayılıyor:** not ayrımı parmak izini değiştirir; eski yayınların anlık görüntüsü yeni parmak iziyle eşleşmez → "Changed after publishing" yanlış `true` verebilir. Eski veri korunmaz (CLAUDE.md §9) ama yerel fixture'da bir kez ölçülür.
- **FB-6.4 ile çakışma:** aynı test dosyaları; sıra yukarıda.
- Pre-mortem (3 ay sonra neden başarısız olur): (1) müsaitlik bir yolda yine engel ya da çakışma üretir (eski ret kalıntısı) — Done when 2 testi; (2) çalışan çeviri sonrası haftasını tanımaz — S2 (a) / S3 (a) + D4 bildirimi; (3) anahtar kapalı unutulur, müdür turuncuyu hiç görmez — Warn kutusu ve preflight sürdüğü için kabul edilen risk (M10).
- Geri alınabilirlik: ayar yok, davranış tek (her zaman uyarı); silinen keep/cancel geri gelmez (M5 bilerek).

## Notes / Result

- 2026-10-04 14:28Z (besleme #148, kayıt-19): sorular cevaplandı (S1 düştü — Hard block kalktı, KARARLAR M8 yeniden; S2 (a), S3 (a), S4 (a) koordinatör, S5 (c) bugünkü kalsın); dilimler ve Done when buna göre yeniden yazıldı; puan 26 → 25 (A1 5 → 4, B 5 → 4, C2 3 → 4). AVAIL-002 FOUNDATION-B puanına dahil değil (`FOUNDATION-B.md`'de AVAIL yok — ölçüldü).
- 2026-10-04 14:38Z (besleme #149, kayıt-19): A1+A2 başladı (işçi `local_91ac4f8d…`, dal `task/avail-002-a`); Mert: AVAIL-002 FB-6.4'ten önce; KK-131 (`ranges`, A + B aynı pencerede main'e), KK-132 (yalnız müsaitlik onay dalları silinir, "retained" kalır), KK-133 (`availability.own` yalnız employee).