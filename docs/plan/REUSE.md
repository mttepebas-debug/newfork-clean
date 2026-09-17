# Reuse haritası

Yeni UI ya da akış yazmadan önce buradaki girdiye bak. Ölçü ve CSS değerlerini buraya kopyalama; kaynak dosyayı aç. `(rescue)` işaretli kaynaklar RESCUE-001 tamamlanana kadar yalnızca `wip/rescue-2026-09-16` branch'inde bulunur.

| ID | Ne zaman | Kaynak | Sınır |
|---|---|---|---|
| UI-01 | Liste sayfası header ve toolbar (status, filter, search) | `apps/web/src/views/CatalogPageHeader.tsx`, `styles.css` içinde `.catalog-page-header`, `.catalog-toolbar*` | Status üst satırda, filter ve search alt satırda. Sayfaya özel margin varyantı yok. |
| UI-02 | Tablo kolon sıralama | `apps/web/src/views/CatalogSortButton.tsx` | İkon yalnızca hover veya focus halinde görünür. Sıralama mantığı bileşeni kullanan sayfadadır. |
| UI-03 | Settings sayfa header'ı ve sağ üst CTA | `settings/GeneralSettingsPage.tsx` içinde `SettingsHeader`, `.settings-page` altındaki `--settings-header-*` token'ları | Sayfa CSS'inde header ya da action için offset/align override yazma. |
| UI-04 | Account layout ve header | `account/AccountLayout.tsx`, `account/components.tsx` içinde `AccountPageHeader` | Her sayfaya ayrı offset ekleme. |
| UI-05 | Tema: yalnızca light; renkler `--theme-*` token'larından | `styles.css` `:root` (THEME-002): page, surface(-soft/-muted), text(-body), muted, border(-subtle/-strong), accent(-strong), selected, focus, action(-hover), danger/warning/success(-soft), current. `--schedule-*` bunlara alias. `src/light-theme.test.ts` dark kuralını engeller. | Sabit hex yerine token kullan. Öneksiz `--surface/--border/--text` tanımlama (mevcut fallback'leri değiştirir). Dark kuralı yazma. Açık zeminde metin AA ≥4.5; ikincil metin için `--theme-muted`. |
| UI-06 | Schedule haftalık lokasyon genişliği | `schedule/lib/scheduleGridLayout.ts`, `hooks/useScheduleBadgeMeasurements.tsx` | Günlük görünümde minimum genişlik korunur. |
| UI-07 | Gruplu checkbox filtre menüsü | `schedule/components/ScheduleTopBarFilter.tsx` + `schedule-topbar-filter.css` (rescue) | Diğer dropdown'ları kullanıcı kararı olmadan bu tasarıma geçirme. Documents hedeflemesinde gruplar AND ile birleşir. |
| UI-08 | Documents yönlendirmeli editör | `settings/DocumentSettingsEditor.tsx`, `documents/DocumentLifecycleFields.tsx` (rescue) | Yalnızca final Save kalıcı yazar. Legacy OR/named kayıtları sessizce dönüştürülmez. |
| UI-09 | Silme onayı | Templates ve Announcements'taki iki tık deseni ("Click again to delete") | Ayrı onay paneli açma. |
| UI-10 | Toast | `@newfork/ui` toast facade (dedupeKey, süreler, en fazla 3 görünür) | Notification center ile karıştırma. |
| DATA-01 | Notification kataloğu sürümleri | `settings/NotificationSettingsPage.tsx` | `type_key` başına en yüksek `schema_version` kullanılır. React key'e version ekleyerek duplicate'i gizleme. |
| DATA-02 | Schedule RPC review hatası | migration `20260915075033_bl064_schedule_conflict_result.sql`, `api/src/schedule/schedule-routes.ts` | İş kuralı reddi PT409 döner; 40001 kullanma (PostgREST 40001'i yeniden dener). |
| DATA-03 | Schedule export ve async save | `schedule/export-v2/*` (rescue), `SchedulePage` içindeki mutationContext | Badge metni için ShiftCard'daki `formatShiftLabelDisplay` kullanılır; ikinci bir label motoru ya da save motoru yazma. |
| DATA-04 | Edit-session lease | migration `20260915112516_bl069_resume_edit_session_lease.sql` | Aynı sahip session'ı yeniden alırsa lease yenilenir, revision korunur. |
