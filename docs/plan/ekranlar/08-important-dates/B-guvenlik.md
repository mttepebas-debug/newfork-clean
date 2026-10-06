DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 1, düşük 1). Ölçülen commit `20332d46` (`origin/main`, plan-e08 worktree'si). Yerel DB'ye uygulanan son migration `20261007130000`, repo ile aynı. Canlı fonksiyon tanımları `pg_get_functiondef` ile okundu. Yalnız SELECT çalıştı, test koşulmadı, dosya yazılmadı.

# B — Important Dates: güvenlik ve kod incelemesi (EKRAN-08, 2026-10-06, `20332d46`)

**DENETİM SONUCU: BULGU VAR (kritik 0, yüksek 0, orta 1, düşük 1).**

- **Başka workspace'e giden yol yok.** Başka bir workspace'in önemli tarihine, lokasyonuna ya da vardiyasına ulaşan bir yol bulmadım. Kapalı gün de başka workspace'in ya da kaydın dışındaki bir lokasyonun vardiyasına dokunmuyor.
- **Müdür yalnız kendi lokasyonunun tarihini yazabiliyor (M2).**
  - Tek lokasyonlu kayıt lokasyon kapsamıyla soruluyor.
  - Çok lokasyonlu ve workspace geneli kayıt yalnız admin ve owner'ın (K1).
  - Başka lokasyonun müdürü o lokasyonun tarihini görmüyor (K3, K6).
- **Rütbe kuralı tutuyor ve kapalı yönde çalışıyor (K2).** Bilgi eksikse izin verilmiyor:
  - Ayrılan admin ya da owner'ın kaydını yalnız admin ve owner değiştirebiliyor.
  - Yazarı silinmiş (`created_by` boş) kayıt da öyle.
  - Ayrılan müdürün kaydı son rolüyle (müdür) sayılıyor.
- **Orta bulgu bir tane (B1).** Kapalı gün yüzünden vardiyası düşen kişinin "your shift was removed" bildirimi, tarih sonradan düzenlenince, yayından kaldırılınca ya da arşivlenince geri çekiliyor. Vardiya ise geri gelmiyor (K15). Kişi vardiyasının neden kalktığını bir daha göremiyor.
- **Ekranın main'deki hâli, sunucunun hazır olduğu iki parçayı hiç çağırmıyor.** Bunlar K13 vardiya listesi ve History. Güvenlik açığı değil, kapı kapalı kalıyor. "Sınırda" bölümünde yazılı (S1).

## Kapsam ve sınır
- **İçeride:**
  - Settings → Important Dates (`/app/important-dates`, `apps/web/src/settings/ImportantDatesSettingsPage.tsx`) ve rota kapısı (`App.tsx:399-401`).
  - Yaz, düzenle, Unpublish, Republish, Archive, Restore, History ve kapalı gün önizlemesi.
  - API uçları (`apps/api/src/settings/important-dates-routes.ts`, `important-dates-service.ts`; okuma `settings-reads-service.ts:15`).
  - 5 `public` servis ve 20 `app_private` yardımcısı (`important_date_*`, `communication_*`).
  - Tablolar `important_dates`, `important_date_changes`, `important_date_shift_releases`, görünüm `schedule_closures`.
  - Bildirim yolu (`notification_outbox`) ve kapalı günün `shift-exchanges:<workspace>` canlı kanalı.
- **Sınırda:**
  - Schedule'ın önemli tarih okuması (`schedule-service.ts:480-520`).
  - Notifications gelen kutusu.
  - Kapalı günün Schedule'da verdiği uyarı (K10, K17).
- **Dışarıda:** görsel tasarım, sayfalama (BL-787), Announcements ekranı (EKRAN-07 B'de incelendi; ortak `communication_*` çekirdeği orada da temiz çıktı).

## Temiz olanlar (kanıtlı)
- **Tablolar kapalı.**
  - Üç tabloda da satır erişimi (RLS) açık, hiç politika yok.
  - Tarayıcı oturumunun (`anon` / `authenticated`) hiçbir izni yok (`pg_class.relacl`).
  - `service_role`: `important_dates`'te okuma var (Schedule için), öteki ikisinde okuma bile yok.
  - `schedule_closures` görünümü `security_invoker=true`, yalnız `service_role` okuyor.
  - Bu tablolardan hiçbiri canlı yayında (realtime) değil; yayındaki tek tablo `account_notification_items`.
- **Fonksiyonlar kapalı.**
  - 5 servisin hepsi SECURITY DEFINER, arama yolu boş (`search_path=""`), yalnız `service_role` çalıştırabiliyor.
  - `app_private` yardımcılarını yalnız `postgres` çalıştırabiliyor.
  - Hiçbirinde `auth.uid()`, `request.jwt` ya da eski kapı yok (SELECT: 0 satır).
  - Önemli tarihte `_base` / `_vN` / `_legacy` adlı fonksiyon yok.
- **Kapı çekirdekte.**
  - Her servis önce `app_private.authorize(..., 'settings.important_dates.read')`'i çağırıyor, sonra yazma kararını `communication_authorize` → `authz_check` veriyor (`important_date.write` lokasyon kapsamlı, `.write_wide` org).
  - M2 kurallarında müdürün org yazma kapsamı `none`. Bu yüzden müdür, iki lokasyonunu birden seçse de reddediliyor (K1).
  - Çalışanın sayfaya erişimi yok (`settings.important_dates.read` çalışana `missing_permission` veriyor).
- **API'de yerel kapı yok.** Beş uçta yalnız `resolveActor` ve zod var. Hayır cevabı `rpcFailure` ile 404 (`not_member`) ya da 403/409'a çevriliyor (`important-dates-routes.ts:26-29`).
- **Katalogda sınıflı, ikiz yok.**
  - 5 servis `authorization_coverage.test.sql`'de sınıflı (`:149`, `:170`, `:174`, `:213`, `:237`).
  - Eski `can_manage_important_date`, `audit_important_date_change` ve `normalize_important_date_locations` `retired_objects_stay_gone.test.sql:319`'da.
- **Tenant izolasyonu tutuyor.**
  - Her okuma `id + workspace_id` ile.
  - Yabancı ya da arşivli lokasyon kimliği `communication_authorize`'daki canlı lokasyon kontrolünde `authz.out_of_scope` ile düşüyor.
  - Kapalı günün etkisi `closure_days(w, …, location_ids)` ile yalnız kaydın kendi lokasyonlarına ve bu haftadan sonrasına iniyor.
- **Kapalı gün vardiya kaybına karşı korumalı.**
  - Liste parmak iziyle (fingerprint) bağlı. Eski listeyle kayıt 409 `important_date.closure_changed` alıyor.
  - Her vardiya `employee_id` eşitliğiyle güncelleniyor; arada değişen vardiyada işlem geri dönüyor.
  - Başlamış vardiyaya dokunulmuyor (`shift_time_range > now()`).
  - Vardiya açılmadan önce `schedule.edit` o lokasyonlarda ayrıca soruluyor.
  - Önizlemede görmediğin lokasyonun vardiyası yalnız sayı olarak dönüyor (`hidden_shift_count`).
  - pgTAP bunları kilitliyor (`closed_days_reach_the_shifts.test.sql:101-125`).
- **Görünürlük ve geçmiş (K6) tutuyor.**
  - History'de müdür, yönetmediği lokasyondaki sürümü `{"hidden": true}` olarak alıyor; o satırın saati ve kim olduğu da boş geliyor.
  - Owner ve admin her şeyi görüyor.
  - Testi var: `announcements_and_dates_edge_cases.test.sql:260-307`, `announcements_and_dates_follow_k1_k6.test.sql:233-279`.
- **"Hayır" sözleşmesi tutuyor.** Bilinmeyen tarih de kapsam dışı tarih de aynı `42501 authz.out_of_scope`'u alıyor. Görünürlük, sürüm kontrolünden önce soruluyor.
- **Web düğmeleri sunucuya soruyor.** `can_manage`, `can_target_workspace`, `can_edit`, `can_unpublish` ve öteki bayraklar sunucudan geliyor. Ekranda `permissions.includes` yok. Rota kapısı (`PermissionRoute`) yalnız menü kolaylığı.
- **Canlı kanal yükü zararsız.**
  - Kapalı gün `shift-exchanges:<workspace>` kanalına `{workspace_id, important_date_id}` gönderiyor (`20261007120000_…:637`).
  - Kanal özel, `rls_can(..., 'exchange.offer_own')` ile korunuyor.
  - Kimliği alan çalışanın o kimlikle okuyabileceği bir uç yok; hepsi `settings.important_dates.read` istiyor.

## Bulgular

### B1 — Orta — "Your shift was removed" bildirimi sonradan geri çekiliyor, vardiya ise geri gelmiyor
- **Ekranda nerede:** Settings → Important Dates → "Closed day" kaydı → sonra aynı kayıtta Edit (başlık ya da not değişir), Unpublish ya da Archive.
- **İsimli örnek:**
  1. Ayşe 24 Ekim'i Kadıköy için kapatıyor; Ali'nin vardiyası open'a düşüyor. Ali "Kadıköy is closed on Oct 24 — your shift was removed" bildirimini alıyor (K14).
  2. Ayşe ertesi gün yalnız notu düzeltiyor. Ali'nin bildirimi gelen kutusundan kalkıyor; yerine yalnız "Inventory closed · Oct 24" geliyor.
  3. Ayşe kaydı Unpublish ya da Archive ederse Ali'ye hiçbir şey kalmıyor.
  4. Vardiya ise K15 gereği geri gelmiyor. Bildirimini açmamış Ali, Pazartesi vardiyasının neden kalktığını hiçbir yerde göremiyor.
- **Kanıt:**
  - Kaldırma bildirimi genel tarih bildirimiyle aynı türde ve aynı konuda yazılıyor (`schedule.important_date.available`, `important_date`, `<id>`) (`supabase/migrations/20261005000000_closed_days_reach_the_shifts.sql:313-365`, `important_date_tell_removed`).
  - İçerik değişince o konudaki bütün bildirimler kişi süzülmeden geri çekiliyor (`:583`, `communication_withdraw(..., 'superseded')`, `people` boş). `communication_withdraw` o konudaki bütün outbox satırlarını dolaşıp gelen kutusu satırlarını `visibility_state='superseded'` yapıyor. Gelen kutusu yalnız `visible` olanı gösteriyor (`get_notification_inbox_v2_service`).
  - Aynı düzenlemede `removed` boş dönüyor, çünkü gün zaten kapalı ve `impact.shifts` yeni gün bulmuyor. Ali `told` listesine düşüyor ve yalnız genel bildirimi alıyor (`:586-590`).
  - Unpublish ve Archive da aynı geri çekmeyi `'cancelled'` ile yapıyor (`:677`).
  - Test boşluğu: `closed_days_reach_the_shifts.test.sql:163-165` arşivden sonra yalnız vardiyanın geri gelmediğini kontrol ediyor; bildirimin durduğunu kontrol eden test yok.
- **Ne beklenirdi:** K14 ve K15 birlikte okununca kaldırma bildirimi vardiyanın kendisi gibi kalıcı olmalı. Ya ayrı bir konu ile yazılmalı ya da geri çekme `important_date_shift_releases`'teki kişileri dışarıda bırakmalı. ILKELER P09: veri sessizce düşmez.
- **Önem gerekçesi:** yetki ya da tenant sızıntısı değil, kişinin vardiyasıyla ilgili bilgi kaybı. Ürün kararı da olabilir: "Unpublish edilen kapanışın kaldırma bildirimi kalsın mı?" sorusu KARARLAR'da cevaplı değil.
- **leave: medium / do: moderate** (bildirim konusu ya da geri çekme süzgeci değişir; pgTAP eklenir).
- **BL:** YENİ (BL-539 aynı geri çekme fonksiyonunda başka bir yarış).

### B2 — Düşük — History, gizli değişikliğin türünü de söylüyor
- **Ekranda nerede:** Settings → Important Dates → tarih → History. Main'de ekran bunu henüz çizmiyor (S1); sunucu cevabında var.
- **İsimli örnek:**
  1. Owner Zeynep "Inventory" tarihini önce yalnız Beşiktaş'a açıyor ve Unpublish ediyor.
  2. Sonra tarihi Kadıköy'e taşıyor.
  3. Kadıköy müdürü Ayşe History'yi açınca iki gizli satır alıyor: `action: "created"` ve `action: "unpublished"`. Bunlardan kaydın önce başka bir lokasyonda açılıp yayından kaldırıldığını öğreniyor.
- **Kanıt:** `read_important_date_history_service` `'action', change.action`'ı koşulsuz döndürüyor (`supabase/migrations/20261004000000_announcements_and_dates_ask_the_core.sql:1496`). Yalnız saat, kişi ve sürümler gizleniyor.
- **Neden düşük:** KARARLAR (satır 561, B3-A) yalnız "gizli satırın sırası zaman ipucu verir" sınırını kabul etmiş. Test bu alanı bilerek kullanıyor (`announcements_and_dates_edge_cases.test.sql:263`, `:295` `where c ->> 'action' = 'created'`). Bu yüzden kasıtlı olabilir; kabul KARARLAR'a yazılmamış.
- **leave: low / do: safe** (ya kabul satırına "tür de görünür" eklenir, ya gizli satırda `action` boşaltılıp testler `id` ile eşlenir).
- **BL:** YENİ.

## Sınırda (bulgu sayılmadı)
- **S1 — Main'deki ekran K13 listesini ve History'yi çağırmıyor (bilinen: FB-6.7 B).**
  - Ne var: `previewImportantDateClosure` ve `getImportantDateHistory` veri katmanında duruyor (`apps/web/src/settings/organization-data.ts:421`, `:486`). Ama `ImportantDatesSettingsPage.tsx` ikisini de çağırmıyor (grep: 0). Bu iki parçayı ekrana koyan kod yalnız `task/fb-6.7-ui` dalında, main'e girmemiş.
  - Sonuç: yayınlanmış ve atanmış vardiyası olan bir güne Closed day kaydetmek ya da öyle bir kaydı Republish etmek ekrandan hep reddediliyor. Kişi "Review the shifts on this closed day again." cümlesini görüyor ve listeyi açacak yeri yok.
  - Güvenlik açısından kapı kapalı kalıyor (fail-closed), veri düşmüyor. Davranış ve ürün tarafı A/D raporlarının konusu (`docs/plan/tasks/FB-6.7.md:39`, `:60`).
- **S2 — Schedule önemli tarihleri `service_role` ile okuyup lokasyon süzgecini API'de yapıyor.** Kanıt `schedule-service.ts:480-520`. Bugün doğru süzülüyor: yalnız yayında ve arşivsiz kayıt, izinli lokasyonlar. Madde zaten **BL-701**.
- **S3 — Önemli tarihle ilgili açık maddeler (bu ekrana dokunuyor, güvenlik değil):**
  - BL-547: K11 ile bölünen geçmiş kopyanın History satırı yok.
  - BL-548: kapalı gün önizlemesinde saat dilimi karışık.
  - BL-549: arşivden dönen lokasyona kapalı gün listesiz uygulanıyor.
  - BL-550: hiçbir şey değişmeden kaydetmek sürümü artırıyor.
  - BL-551: `important_date_shift_releases`'in yabancı anahtarları indekssiz.
  - BL-544: kapalı gün ile onaylı izin vardiya düşürmeyi iki yerde yapıyor.
  - BL-546: yıllık çok günlü tarih kendi günlerinde düzenlenirse o yılın tekrarı eski kayıtta kalıyor.
  - BL-595: Archive iki tık kırmızı değil.
  - BL-676: geçmiş tarih okumak için bile açılmıyor.
- **S4 — Notifications ekranına ait, yolda görüldü:**
  - `public.get_notification_inbox_v2_service`'in iki ayrı tanımı var (overload).
  - `act_on_notification_inbox_workspace_base` adlı `_base` fonksiyonu duruyor.
  - İkisi de Notifications ekranının turunda tazelenmeli; BL-533 / KK-179 ile ilişkili olabilir. Bu ekrana dokunmuyor.
- **S5 — Test boşluğu:** Important Dates için Playwright senaryosu yok (`e2e/` grep: 0). Kapalı gün, yayından kaldırma ve geri getirme akışları yalnız pgTAP ve vitest ile korunuyor.

## Öneriler
1. **B1 için önce tek satırlık ürün sorusu.** "Kapanış kaydı düzenlenince ya da yayından kalkınca, vardiyası düşen kişinin 'your shift was removed' bildirimi kalsın mı?" Önerim "kalsın", dayanak K15 + P09. Sonra `nf-db` kaldırma bildirimini geri çekmenin dışında bırakır ve pgTAP'a üç vaka ekler: düzenleme, Unpublish, Archive.
2. **B2:** KARARLAR satır 561'deki kabule "değişikliğin türü de görünür" eklenmesi en ucuz yol. Kabul edilmezse gizli satırda `action` boşaltılır.
3. **S1:** `task/fb-6.7-ui` main'e alınırken K13 listesinin `keep_shift_ids` ve `expected_fingerprint`'i gerçekten gönderdiğini e2e ile kanıtlamak. Bugün bu yolu yalnız pgTAP sınıyor.

## Kanıt (çalıştırılan komutlar)
- `git log --oneline -1` → `20332d46`. `select version from supabase_migrations.schema_migrations order by version desc limit 1` → `20261007130000`.
- `pg_proc` listesi (`proname ~ 'important_date|closed_day|communication'`): 5 servis `secdef=true`, `search_path=""`, `acl={postgres,service_role}`; yardımcılar `acl={postgres}`.
- `pg_class` (`important_date*`): `relrowsecurity=t`, 0 politika, `anon` / `authenticated` yok. `pg_publication_tables`: yalnız `account_notification_items`.
- `pg_proc.prosrc ~ 'auth\.uid|request\.jwt|service_actor_has_permission'` (önemli tarih + communication) → 0. Önemli tarihte `_base` / `_vN` / `_legacy` → yok.
- `app_private.authz_actions` (`important_date.write` place + `outranked_no`, `.write_wide` org, `settings.important_dates.read` org/read) ve `authz_scope_rules` M2 (org/write manager → `none`).
- `pg_policy` on `realtime.messages`: `shift-exchanges:<uuid>` → `rls_can(..., 'exchange.offer_own')`.
- Canlı tanımlar `pg_get_functiondef` ile okundu: `save_`, `set_…_state_`, `read_…_history_`, `preview_…_closure_`, `read_settings_important_dates_service`, `important_date_close_shifts`, `_closure_impact`, `_tell_removed`, `_deliver`, `communication_withdraw`, `authz_check`.
- `pg_constraint` on `important_dates`: `created_by` → `ON DELETE SET NULL`, `status` varsayılanı `published`.
- Repo: `grep` testlerde (`authorization_coverage`, `retired_objects_stay_gone`, `closed_days_reach_the_shifts`, `announcements_and_dates_*`); web'de önizleme ve History çağrıları (0); `git grep` `task/fb-6.7-ui` (ekran kodu yalnız orada).
