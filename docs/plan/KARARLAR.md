# Kararlar

Kullanıcının kararları ve ortak parçalar tek yerde. Eski adı `REUSE.md` (2026-09-29'a kadar); kodda, migration'larda ve eski belgelerde geçen "REUSE" bu dosyadır.

**Kaynak okuma (KARAR-001, 2026-09-30):**
- "kullanıcı kararı <tarih>" Mert'in kararıdır. Dayanak sırasında ilk sıradadır (`docs/plan/ILKELER.md`).
- "koordinatör kararı KK-xx" Mert yokken verildi ve Mert onaylayana kadar onaysızdır. Durumu
  `KOORDINATOR-KARARLARI.md`'deki "Mert:" satırındadır; bu kararlar dayanak sırasında ILKELER'in
  altındadır. "Ürün kuralları" başlığındaki "Kullanıcı kararları" ifadesi bu işaretli maddeleri
  kapsamaz.

**Yeni madde biçimi:**
- Kaynak ve tarih.
- Kural.
- Neden: Mert'in gerekçesi ya da sözü.
- Reddedilen seçenek: neyin yerine seçildi.
- Gerekiyorsa isimli örnek.

Mert'in seçenek dışı cevabı aynı oturumda buraya yazılır (CLAUDE.md §13).

Yeni UI ya da akış yazmadan önce buradaki girdiye bak. Ölçü ve CSS değerlerini buraya kopyalama; kaynak dosyayı aç. `(rescue)` işaretli kaynaklar RESCUE-001 tamamlanana kadar yalnızca `wip/rescue-2026-09-16` branch'inde bulunur.

| ID | Ne zaman | Kaynak | Sınır |
|---|---|---|---|
| UI-01 | Liste sayfası header ve toolbar (status, filter, search) | `apps/web/src/views/CatalogPageHeader.tsx`, `styles.css` içinde `.catalog-page-header`, `.catalog-toolbar*` | Status üst satırda, filter ve search alt satırda. Sayfaya özel margin varyantı yok. |
| UI-02 | Tablo kolon sıralama | `apps/web/src/views/CatalogSortButton.tsx` | İkon yalnızca hover veya focus halinde görünür. Sıralama mantığı bileşeni kullanan sayfadadır. |
| UI-03 | Settings sayfa header'ı ve sağ üst CTA | `settings/GeneralSettingsPage.tsx` içinde `SettingsHeader`, `.settings-page` altındaki `--settings-header-*` token'ları | Sayfa CSS'inde header ya da action için offset/align override yazma. |
| UI-04 | Account layout ve header | `account/AccountLayout.tsx`, `account/components.tsx` içinde `AccountPageHeader` | Her sayfaya ayrı offset ekleme. |
| UI-05 | Tema: yalnızca light; renkler `--theme-*` token'larından | `styles.css` `:root` (THEME-002): page, surface(-soft/-muted), text(-body), muted, border(-subtle/-strong), accent(-strong), selected, focus, action(-hover), danger/warning/success(-soft), current. `--schedule-*` bunlara alias. `src/light-theme.test.ts` dark kuralını engeller. | Sabit hex yerine token kullan. Öneksiz `--surface/--border/--text` tanımlama (mevcut fallback'leri değiştirir). Dark kuralı yazma. Açık zeminde metin AA ≥4.5; ikincil metin için `--theme-muted`, renkli zeminde `--theme-muted-strong`. Accent/action/koyu zemin üstündeki beyaz metin için `--theme-on-accent`; uyarı metni için `--theme-warning`. **`--theme-border` (kutu kenarı) ile `--theme-border-subtle` (liste içi ayırıcı) ayrı basamaktır;** ayırıcı bilinçli olarak bir ton açık, birleştirilmez (kullanıcı kararı 2026-09-28, BL-216). BL-216'da silinen ikiz token'lar (`text-tertiary`, `text-soft`, `surface-group`, `surface-hover`, `divider`, `divider-soft`) yeniden tanımlanmaz. **Yayın tonları ve renk örneği yedeği (G14 dilim a, `9d0d2578`, 2026-09-30):** `--theme-published` `#087f5b` / `--theme-published-hover` `#0b6f53` (tam yayın) ve `--theme-published-partial` `#b45309` / `--theme-published-partial-hover` `#92400e` (kısmi yayın): Schedule üst çubuğundaki Publish / Published düğmesinin tonları (`styles.css:46-49`). `--theme-swatch-fallback` `#64748b` ve `--theme-swatch-fallback-soft` `#cbd5e1`: rengi olmayan lokasyon ya da durumun renk örneği (Publish ve Unpublish pencereleri, taslak menüsü; `styles.css:51-52`). Bu yüzeylerde ham hex yazılmaz. **Denetim kenarı (G14 dilim b, `f4f0114f`, 2026-09-30):** `--theme-border-control` `#aeb9b4` — Schedule üst çubuğundaki denetimlerin ortak kenarı (`styles.css:51`, kural `:3500-3519`); beyazda 2,0:1, 3:1'e çekmek BL-450. |
| UI-06 | Schedule haftalık lokasyon genişliği | `schedule/lib/scheduleGridLayout.ts`, `hooks/useScheduleBadgeMeasurements.tsx` | Günlük görünümde minimum genişlik korunur. |
| UI-07 | Gruplu checkbox filtre menüsü | `schedule/components/ScheduleTopBarFilter.tsx` + `schedule-topbar-filter.css` (rescue) | Diğer dropdown'ları kullanıcı kararı olmadan bu tasarıma geçirme. Documents hedeflemesinde gruplar AND ile birleşir. |
| UI-08 | Documents yönlendirmeli editör | `settings/DocumentSettingsEditor.tsx`, `documents/DocumentLifecycleFields.tsx` (rescue) | Yalnızca final Save kalıcı yazar. Legacy OR/named kayıtları sessizce dönüştürülmez. |
| UI-09 | Buton rolü (renk) | `@newfork/ui` `Button` = yeşil aksiyon (sınıf yok); `className="secondary-button"` = beyaz vazgeçme (Cancel, Discard, Back, Keep editing); `danger-button` = kırmızı yıkıcı. Kural sırası `styles.css`te `.secondary-button` bloğu `.nf-button`tan sonra | `secondary-button`ı aksiyon butonuna (Upload, Resend, Send reminder, Copy, Save…) verme; `danger-button` ile birlikte hiç verme: vazgeçme rengi kırmızının yazı rengini ezer. **Beyaz düğme kenarı = form alanı kenarı token'ı (`--theme-muted`; kullanıcı kararı 2026-09-28, BL-214):** `.secondary-button` kenarı, yanındaki giriş alanıyla aynı koyulukta (Account → Profile'da "Discard" ile "Display name" alanı gibi). **Beyaz düğme tek kural (BL-214 kapandı 2026-09-28, `7127bd96`):** kenar = form alanı kenarı = `--theme-muted`; yazı `--theme-accent-deep`; hover zemini `--theme-surface-muted` (`styles.css:2753-2759`). **Ekran bazlı ezme yazılmaz** (renk, kenar, yazı kalınlığı). Kurala henüz uymayanlar: `.job-secondary-button` ikinci sistemi (BL-255), Roles'taki kalınlık ezmesi (BL-260), Employees çekmecesi ve Publish penceresi alanları (BL-259, BL-257). |
| UI-10 | Toast | `@newfork/ui` toast facade (dedupeKey, süreler, en fazla 3 görünür) | Notification center ile karıştırma. |
| UI-11 | Business öncesi ekranların çerçevesi ve satırı (sign-in sonrası, business'a bağlanana kadar) | `apps/web/src/shell/prebiz/PreBiz.tsx` + `prebiz.css`: iki panelli çerçeve, hesap bloğu + Sign out, `BusinessRow` (rol · durum, duruma göre sabit eylem seti), durum rozeti, bölüm listesi, `.pb-btn` | Yeni ekran bu kit'le yazılır; `.sign-in-panel` ailesi yalnız sign-in, suspended ve ProtectedRoute'ta kalır. Yıkıcı eylem `ConfirmButton` (`@newfork/ui`), `window.confirm` yok. Kullanıcı metninde "workspace"/"team" (kullanıcı kararı 2026-09-20); "business"/"organization" yok. |
| UI-12 | İki tık onay (yıkıcı eylem) | `packages/ui` `ConfirmButton` / `useConfirmClick`: ilk tık silahlar, 3,2 sn / blur / Escape söndürür, `role="status"` ile duyurulur, çift tıklamanın ikinci tıkı yutulur. Silahlı yazı her yerde "Confirm <fiil>" (Confirm delete, Confirm remove, Confirm decline…). Kendi görünümü olan buton `unstyled`, yalnız ikonlu buton `confirmName` alır; tıklanabilir satırın içinde `onClick={(e) => e.stopPropagation()}`; başka yerden silahlı açılan akış `useConfirmClick(fn, true)` | Ad hoc kopya yazma; kalan tek eski kopya Roles (bağımlılık uyarısı silahlı halde kalıyor). Etki listesi ya da parola adımı gereken onaylarda kullanma; oralarda diyalog kalır. |
| UI-13 | Onay ya da kısa not isteyen pencere (tarayıcının `confirm`/`prompt` kutusu yerine) | `apps/web/src/shell/ConfirmDialog.tsx`: `ConfirmDialog` (kontrollü, `children` ile not alanı, `.app-confirm-field`) ve `useConfirmDialog()` (`await confirm({...})` true/false). Uyarı ikonu + başlık + açıklama; Cancel beyaz, yıkıcı cevap kırmızı, diğeri yeşil; Escape ve dışarı tıklama Cancel, Tab içeride döner, kapanınca odak geri gelir | `window.confirm`/`prompt`/`alert` yazma (kullanıcı kararı 2026-09-23). Bare onay tek butonsa önce UI-12 iki tık düşün; açıklama ya da not gerekiyorsa bu pencere. |
| UI-14 | Telefon düzeni kırılımı (sol menü gizlenir, alt çubuk çıkar) | Tek eşik **720px** (`@media (max-width: 720px)`): `styles.css` `.app-sidebar` gizleme, `shell/management-mobile-nav.css` (yönetim alt çubuğu, BL-192), `employee-hub/employee-dashboard.css` (Employee Hub alt çubuğu; BL-239 ile 760'tan 720'ye iner). Kullanıcı kararı 2026-09-28 (BL-239). | Telefon/masaüstü geçişi için başka eşik yazma; sayfa içi küçük düzen kırılımları (ör. form sütunu) bu kural değil. **Tek eşik yalnız kabuk (menü) içindir; sayfa içi sıkıştırma kendi eşiğini taşıyabilir** (ör. `employee-dashboard.css:1155` 760px, "all caught up" kartı) — koordinatör kararı 2026-09-28. **Alt çubuk odak halkası iki çubukta aynı:** 3px `--theme-focus`, 2px dışarıda (`employee-dashboard.css:43-45`, `management-mobile-nav.css:66-67`; BL-250). |
| DATA-01 | Notification kataloğu sürümleri | `settings/NotificationSettingsPage.tsx` | `type_key` başına en yüksek `schema_version` kullanılır. React key'e version ekleyerek duplicate'i gizleme. |
| DATA-02 | Schedule RPC review hatası | migration `20260915075033_bl064_schedule_conflict_result.sql`, `api/src/schedule/schedule-routes.ts` | İş kuralı reddi PT409 döner; 40001 kullanma (PostgREST 40001'i yeniden dener). |
| DATA-03 | Schedule export ve async save | `schedule/export-v2/*` (rescue), `SchedulePage` içindeki mutationContext | Badge metni için ShiftCard'daki `formatShiftLabelDisplay` kullanılır; ikinci bir label motoru ya da save motoru yazma. |
| DATA-04 | Edit-session lease | migration `20260915112516_bl069_resume_edit_session_lease.sql` | Aynı sahip session'ı yeniden alırsa lease yenilenir, revision korunur. |
| DATA-05 | Haftalık müsaitliği bir giriş modundan ötekine çevirmek | `public.weekly_preference_convert(w, preference, target_mode)`, migration `20260922180000_changing_the_entry_mode_converts_every_saved_week.sql`; çağıran yer `weekly_preference_settings_save_service` | Kural tek yerde: saatten tipe en az 1 dakika çakışan aktif tip (sınıra değmek çakışma değil), tipten saate en erken başlangıç–en geç bitiş, gece yarısını aşan tip 24:00'e kadar, boş ve tüm-gün gün olduğu gibi. İkinci bir dönüştürücü yazma. Dönüşüm kayıplı; eski hafta `weekly_preference_events`'e yazılmadan değiştirilmez. |
| DATA-06 | Saat dilimi adını doğrulamak | `app_private.timezone_name_valid(zone)`, migration `20260924142706_timezone_names_are_looked_up_not_scanned.sql` | `pg_timezone_names`'i doğrudan sorgulama: her çağrı ~1.200 dilimi diskten okur (~33 ms). Yardımcı aynı adları kabul eder, NULL için false döner. `supabase/tests/timezone_names.test.sql` yeni bir tarayanı kırmızıya düşürür; izinli liste o dosyada. |
| DATA-07 | Canlı güncelleme kanalı (Realtime) | migration `20260924223214_live_updates_use_private_channels.sql` (Shift Hub, hesap bildirimleri), Schedule kanalları için `schedule/hooks/useScheduleRealtime.ts` ve `useScheduleViewerPresence.ts`; test `live_updates_are_private`, `schedule_realtime_channels` | Hosted yalnız private kanala izin veriyor (2026-09-24). Her kanal `config: { private: true }`; sunucu private gönderir (`realtime.send(..., true)`, API'de `private: true`); her konu için `realtime.messages` üzerinde SELECT politikası, karar `app_private.rls_can` ile. Katılma, konuda bir yayını okuyabilmeyi ister; yalnız varlık (presence) ya da tablo değişikliği dinleyen kanal için de. Tarayıcı gönderemez (INSERT politikası yalnız presence için). |
| DATA-08 | Yetki çekirdeğine eylem eklemek ya da bir eylemin `effect` (read/write) alanını okuyan kod yazmak | `app_private.authz_actions.effect`; okuyan tek yer `app_private.authz_check`'in kapsam kuralı araması (`authz_scope_rules`, M2: ör. org/read → yönetici `org`); örnek istisna `workspace.todos` (yazma eylemi, `read` etiketli; KK-34, migration `20260930172000_the_todo_list_asks_the_core.sql`, FB-6.2 T5b-4) | **`effect` yalnız kapsam kuralını seçer; kısıtlı üye (`restricted_ok`) ve izin kararı onu okumaz.** "read etkili eylemleri kısıtlı üyeye aç" gibi bir genelleme yazılmaz: `workspace.todos` bir yazma eylemi olduğu hâlde `read` taşıyor, böyle bir genelleme onu sızdırır. Kısıtlı üyeye açmak eylem başına `restricted_ok` ile yapılır (ör. `employee.request_preferred_name`, KK-32 (b)). Kaynak: `nf-guvenlik` T5b-4 D2 (2026-09-30). |
| OPS-01 | CI'ı çalıştırmak, değiştirmek ya da e2e'den veritabanına bağlanmak | `.github/workflows/ci.yml` (`runs-on: &runner [self-hosted, linux, newfork-local]`), `scripts/ci-supabase-apart.sh`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`; runner'lar `newfork-local-pc`, `-pc-2`, `-pc-3` (WSL Ubuntu-24.04, kullanıcı `runner`, `~/actions-runner`, `~/actions-runner-2`, `~/actions-runner-3`, systemd, `Nice=10`) | CI kullanıcının PC'sinde; üç runner check, db ve e2e'yi aynı anda koşar (~4 dk). Yalıtım runner adından gelir: Supabase projesi `newfork-ci-pc1/2/3`, portlar 590xx/591xx/592xx, CI e2e web/api 5590/5591, 5600/5601, 5610/5611 (yerel e2e 5565/5566). Yeni runner eklenirse apart betiği adını (`-pc-N`) tanımalı, tanımazsa iş düşer. Ek runner'ların HOME'u ayrıdır (`~/ci-home-N`), çünkü pnpm kurulumu HOME'a yazar. Windows'un ayırdığı port aralıkları açılışta kayabilir: apart betiği `netsh` ile önceden kontrol eder; blok ayrılmış aralığa düşerse betikteki `589 + index` sayısını değiştir. e2e'de konteyner adı config.toml `project_id`'den alınır, `supabase_db_newfork-clean` sabit yazılmaz. `e1e9512`'den önce açılmış bir dal push edilmeden önce rebase edilir. GitHub Actions harcama limiti $0; `ubuntu-latest`'e dönmek için apart betiği de değişmeli. Ubuntu'yu tek başına `wsl --terminate`/`--shutdown` etme: Docker Desktop bağlantısı kopar, ortak yığın düşer. Başlat/durdur/durum: `cd ~/actions-runner[-N] && sudo ./svc.sh start\|stop\|status`. Kaldırma adımları BACKLOG BL-107'de; ek runner'larda `~/actions-runner-N/.env` ve `~/ci-home-N` de silinir. |
| OPS-02 | Bir şeyin ölü olduğunu göstermek (silmeden önce) | FOUNDATION-B 5.5 kaydı (`docs/plan/tasks/FOUNDATION-B.md`); korunma `supabase/tests/retired_objects_stay_gone.test.sql` | Veritabanı fonksiyonu: `pg_proc` gövdeleri, tetikleyiciler, politikalar, görünümler, varsayılanlar, kısıtlar, indeksler ve `cron.job` metinleri ile `apps`, `packages`, `e2e`, `scripts` kodundaki tanımlayıcılar (identifier) toplanır; adı bunların hiçbirinde (kendi gövdesi hariç) geçmeyen fonksiyon ölüdür, yalnız ölülerin çağırdığı da ölüdür (tekrar tekrar ayıkla). Test dosyasında geçmek canlı saymaz: o testin parçası silinen fonksiyonla birlikte gider ya da canlı yola çevrilir. Silmeyi önce geri alınan tek işlemde dene (`drop function` bağımlılık varsa düşer, `cascade` kullanma). CSS sınıfı: adı web/UI kodunda tanımlayıcı olarak geçmiyor ve kod onu sabit bir önekten (`foo-${x}`, `"foo-" + x`) kurmuyorsa ölüdür; `-w` grep `form-actions`'ı `account-form-actions` içinde bulur, tanımlayıcı olarak ara. Silinen her nesne aynı commit'te `retired_objects_stay_gone`'a yazılır. |
| OPS-03 | Paylaşılan şemaya zorunlu alan ekleyen ya da DB okumasının şeklini değiştiren bir işi main'e almak (Vercel main'i yayına alır) | Kullanıcı kararı 2026-09-28 (BL-218.3 `/code-review max` bulgusu: `system_key` zorunlu olunca canlıda migration yoksa Schedule, Employee Hub → Schedule ve Employees çekmecesi 500 verir) | Birleştirme penceresinde önce canlı gönderim: kullanıcı PC başında yedek (`db dump --linked`, şema + veri) → `db push --dry-run` → `db push` yapar; koordinatör MCP ile `list_migrations` ve `get_advisors` (security) bakar; ancak sonra main'e push. Eski kod fazla alanı yok sayar, bu yüzden migration önce gitmek güvenlidir; tersi değil. Hosted push'u ajan yapmaz (proje `.claude/settings.json` yasaklar). **Alan ya da nesne SİLEN işte sıra terstir (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`; dayanak `nf-guvenlik` E1, KK-43):** önce main (yeni kod yayına çıkar ve silinecek alanı artık okumaz), sonra canlı veritabanında silme. Neden: canlıdan önce silinirse yayındaki eski kod silinen alanı okumaya çalışır ve 500 verir. Örnek: FB-6.3.7 (izin silmeleri, BL-496'nın sıra kolonu). Reddedilen: "her seferinde sorulsun". |
| OPS-04 | İlerleme kayıtlarını güncellemek ya da "durum ne / açık işler / kullanıcıda bekleyenler" sorusuna cevap aramak | Kullanıcı kararı 2026-09-30: kalıcı rol oturumu "Rol: nf-planlama (Kayıt ve ilerleme)". Güncel pano `docs/plan/ILERLEME-PLANI.md` §0 (0a durum, 0b açık işler, 0c kullanıcıda bekleyenler). Tuttuğu kayıtlar: `BACKLOG.md`, `DONE.md`, `ROADMAP.md`, `MVP-PLAN.md`, `ILERLEME-PLANI.md`, `KARARLAR.md`, `tasks/BACKLOG-PROGRAM.md`, görev dosyalarının Notes / Result'ı | Oturuma yalnız koordinatör yazar ("BESLEME" mesajı: biten iş, karar, bulgu, başlayan, bekleyen); başka rol oturumu yazmaz, kayıt oturumu da kimseye görev vermez. Her iddia yazılmadan önce repoda ölçülür (commit main'de mi, dosya:satır duruyor mu, CI koşusu yeşil mi); ölçülemeyen "ölçülmedi" diye yazılır. Yalnız `docs/plan/**` yazar. Docs-only değişikliği main'e kendisi gönderir: `git fetch` + rebase, `git diff --name-only origin/main..HEAD` yalnız `docs/`, `main.lock`, yalnız fast-forward, force push yok; `docs/` dışına tek dosya çıkıyorsa göndermez, koordinatöre yazar. İkinci backlog ya da ikinci plan dosyası açılmaz. `HANDOFF.md` koordinatörün; `KOORDINATOR-KARARLARI.md`: koordinatör her süreç ve teknik kararını KK olarak yazar ve iş raporunda "Senin yerine verdiğim kararlar" listesinde gösterir; ürün ve ekran kararını yalnız bir KARARLAR satırı ya da onaylı bir ilke birebir kapsıyorsa verir, kapsamıyorsa sorar (`CLAUDE.md` §13; kullanıcı kararı 2026-10-01, KARAR-001 §13 ile uyum; önceki "yeni KK yalnız kullanıcı 'yokum' derse" cümlesinin yerine). Kayıt oturumu KK'yı kendisi vermez; koordinatörün kararını onun isteğiyle yazabilir (KK-69). Kuralın `CLAUDE.md`'ye girmesi kullanıcı onayı bekliyor. |
| OPS-05 | Yeni migration dosyası adlandırmak | `nf-guvenlik` E3 (EMP-001 B incelemesi, 2026-09-30): iki söküm migration'ının adı bir gün ileride (`20261001000000`, `20261001010000`) | Bundan sonraki her migration adı `20261002000000`'dan büyük olur (eşik EMP-001 C ile yükseldi, 2026-09-30; önceki eşik `20261001010000`). |

## Ürün kuralları — rol, kapsam, uygunluk

Kullanıcı kararları, 2026-09-23 (FOUNDATION-B Aşama 0). Her kural yetki matrisinin `expected()` fonksiyonunda (`supabase/tests/authorization_matrix.test.sql`) ya da uygunluk matrisinde (`supabase/tests/eligibility_matrix.test.sql`) bir satıra karşılık gelir; kural değişirse önce burası, sonra o satır değişir. Uygulandığı yer yetki çekirdeği `app_private.authorize()` / `scope_set()` (FOUNDATION-B Aşama 4) ve uygunluk motoru `app_private.eligibility()` (Aşama 6).

**Roller ve kapsam**
- Hiyerarşi owner > admin > manager > employee. Owner, admin ve manager yönetim arayüzüne girer; herkesin (kendi çalışan kaydı olan owner/admin/manager dahil) çalışan arayüzü vardır — yönetim arayüzünde "Çalışan görünümüne geç".
- Owner'a özel: billing, sahiplik devri, workspace kapatma, admin atama/kaldırma. Admin: bütün lokasyonlar ve çalışanlar (kendi lokasyon atamasından bağımsız), Settings'in geri kalanı okuma+yazma, Settings→Roles'u düzenler ama kendi izninden fazlasını veremez.
- **Kapsam modeli M2 "kişi ortak, vardiya yerel":** manager kendi lokasyonlarında çalışan herkesi bütün olarak görür (profil, müsaitlik, izin, belgeler — istisna, kullanıcı kararı 2026-10-01: **bekleyen** izin talebini yalnız ona karar verebilenler ve sahibi görür, "İzin" bölümü; onaylanmış izin M2'ye göre görünür); başka lokasyonda çalışmayanı görmez. Vardiya işlemleri (yazma, yayın, devir onayı, dışa aktarma) yalnız vardiyanın lokasyonunda. Başka lokasyonu etkileyen karar o lokasyonun onayını ya da admin/owner'ı ister.
- **Kişinin bütün lokasyon adları görünür (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`; BL-417):** Employees çekmecesi ve listesinde manager, kişinin atandığı her lokasyonun adını görür, kendi erişemediği lokasyon dahil (o lokasyonun programını görmez). Bugünkü davranış budur, kod değişmez. Örnek: Kadıköy müdürü Ayşe, Ali'nin çekmecesinde "Kadıköy, Beşiktaş" görür. Neden: M2 + ILKELER P23. Reddedilen: "görmesin".
- Manager'ın lokasyonları = çalıştığı atamalar (kullanıcı kararı 2026-09-30, EMP-001 B; main'de `bf52f5e1`): "yalnız yönetir" lokasyonu kaldırıldı, manager yalnız atandığı lokasyonları yönetir. Manager atandığı her lokasyonu yönetir; ara sıra çalışmak için atandığı lokasyon da buna dahildir. Yönetmesin isteniyorsa o lokasyona atanmaz (EMP-001 S1'in sonucu, 2026-09-30; kullanıcı teyit etti 2026-10-01 ~17:45Z, "böyle kalsın", kayıt oturumunun penceresinde; reddedilen: "çalışır ama yönetmez ayrımı geri gelsin"). Eski cümle ("ara sıra çalışmak orayı yönetmek demek değildir") "yalnız yönetir" ayrımına dayanıyordu; sökümle geçersiz.
- **Müsaitlik notu yalnız çalışan için (kullanıcı kararı, 2026-09-26; aynı günün "owner ve admin kendi notunu yazar" kararının yerine).** Team availability'deki gizli not/hatırlatma yalnız `employee` rolündeki kişi hakkında yazılır. Kişi manager, admin ya da owner ise not bölümü hiç yoktur: ekranda gösterilmez ("not available" satırı da yok), yazılamaz, okunamaz; böyle bir kişi için kayıt tutulmaz. Çalışan hakkında yazan: kişinin çalıştığı lokasyonun manager'ları, admin ve owner. Ayşe (Kadıköy müdürü) Kadıköy çalışanı Emre için yazar; Can (Kadıköy müdürü) ya da kendisi için not bölümü yok. Kişi employee'den manager/admin/owner'a geçince hakkındaki not kalıcı olarak silinir, gizlenmez; tekrar employee olursa boş başlar (kullanıcı kararı, 2026-09-26). Çekirdek: `availability.team_write` hedefi employee sınıfıyla sınırlı; uygulama BL-139.
- **Manager note (kullanıcı kararı, 2026-09-26).** Team availability'deki not kişisel değil, yöneticiler arası ortak bir nottur: bir çalışanın müsaitliği ve vardiya planıyla ilgili, çalışana hiçbir yerde görünmez. Her çalışan için tek kayıt (`manager_weekly_reminders`); o çalışanı yöneten her yönetici, admin ve owner okur ve düzenler (yalnız `employee` rolündeki kişi için; bir üst satır). Ekranda "Manager note" adıyla; Takvim'de çalışanın satırında not işareti, üzerine gelince okunur (düzenleme Team availability'de); notun altında "Last edited by <ad> · <tarih>" (`updated_by`, `updated_at`). Uygulama: BL-135.
- **Müsaitlik güncelleme bildirimi (kullanıcı kararı, 2026-09-26).** Bir kişi müsaitliğini güncelleyince o kişiyi yöneten herkese bildirim gider (rütbe şartı yok): Can (Kadıköy müdürü) güncellerse aynı lokasyondaki Ayşe, admin ve owner alıcıdır. Çekirdek: alıcı hesabı `availability.team_read` ile.
- **Müsaitlik okuma = bildirim alıcıları (kullanıcı kararı, 2026-09-26).** Müsaitlik güncelleme bildirimini alan herkes o kişinin müsaitliğini okuyabilir (Manager note yalnız çalışan için vardır, iki üst satır); bildirim tıklanınca her zaman açılır. Ayşe (Kadıköy müdürü) Kadıköy'deki müdür Can'ın, owner'ın ve admin'lerin müsaitliğini görür. Yazma kuralı değişmez (bir üst satırlar). Uygulama: BL-139.
- Başka lokasyondaki vardiya manager'ın planında ghost olarak (salt okunur) görünür: lokasyon adı, saat, iş (job), vardiya tipi ve etiketler (ör. "On call"); vardiyanın serbest metin notu görünmez (kullanıcı kararı 2026-09-26, önceki "lokasyon adı + saat" kararının yerine). Neden: "On call" gibi bir etiket kişinin o gün aranmayacağını söyler; iki lokasyonun müdürü kişiyi kendi aralarında çekmeyi buna göre konuşur. Ghost'un iki modu var (ayrım 2026-09-25, aşağıda "Taslak ve lokasyon" B4): **canlı başka lokasyon vardiyası** — manager yazarken o vardiyayla çakışma uyarısı alır (bu satırın kuralı); **yayınlanmış plan önizlemesi** (B4 anahtarı) — çakışma üretmez. Bileşen: `schedule/components/ShiftCard.tsx` `GhostShiftCard`.
- Rütbe: talepler hep bir üst kademeye gider (employee → lokasyonun manager'ı → admin → owner). Kimse kendi talebini onaylayamaz. Owner'ın talebi onay gerekmeden kaydolur, etkilenen manager'lara bildirim gider. **Karar 2026-09-26 (kullanıcı):** bu bildirim bir onay isteği değildir ("needs manager review" gitmez); alıcılar owner'ın izniyle vardiyası boşalan lokasyonların manager'larıdır, metin "owner izinde, şu vardiyalar boşaldı" anlamındadır. Uygulama: BL-183.
- Owner belgeden muaftır (`set_employee_document_exemption_service`: "an owner is not asked for the documents they ask of everyone else"). **Sahiplik devri (kullanıcı kararı 2026-09-28, BL-246):** devirle owner olan kişinin açık belge zorunlulukları devir anında muaf sayılır; belge engeli kalkar. Belge eksikliği owner'ın kendi izninin onaysız kaydını da etkilemez (K12, BL-221). **Devirde yeni owner'ın çalışan kaydı (kullanıcı kararı 2026-09-28, BL-252 S1 (a); aynı günkü "otomatik açılır / arşivden döner" kararının yerine geçer):** devir, yeni owner'ın kendisine bağlı ve arşivsiz bir çalışan kaydı olduğunu kontrol eder; yoksa reddeder (42501 + `transfer.participants_ineligible` (mevcut devir uygunluk cevabı; API eşlemesi değişmez; anahtar koordinatör kararı 2026-09-28, kullanıcı kararı devrin reddedilmesi)). Kayıt açma ya da arşivden dönüş yolu yazılmaz: bu durum ürün yoluyla kurulamıyor (katılım yalnız çalışan kaydına bağlı davetle; kaydı arşivlenen ya da kaydından ayrılan kişinin erişimi askıya alınır ve devri kabul edemez; `tasks/BL-252.md` adım 0). **Eski owner'ın muafiyetleri (kullanıcı kararı 2026-09-28, BL-252 S2 (b)):** devirde eski owner'ın owner kuralından gelen belge ve acknowledgement muafiyetleri kalkar (acknowledgement: ultrareview, kullanıcı 2026-09-28); admin olarak belgeleri tamamlar. Önceki devirlerden kalan kayıtlar için kod yok. Örnek: Mert sahipliği Deniz'e devreder; Mert'in "Food handler card" belgesi yeniden açık zorunluluk olur, Deniz'inki muaf olur.
- **Arşivli iş ve vardiya tipi adı (kullanıcı kararı 2026-09-28, K8, BL-254):** bir iş ya da vardiya tipi arşivlenince o işteki eski vardiyaların adı her yerde arşivli ad olarak görünür — Schedule kartı, dışa aktarma, Schedule'daki çakışma penceresi, başka lokasyonun soluk (ghost) vardiyaları (ör. "Line Cook"), "Shift" değil; "archived" etiketi eklenmez. Karar yalnız adı gösterir; arşivli işin yeni vardiya seçicilerinde görünmemesi bugünkü davranıştır, değişmez.
- Manager lokasyonunda çalışan herkesi (başka manager, admin, owner) vardiyaya yazabilir; onların müsaitlik/izin çakışma onayları ve talepleri üst kademeye gider. **Değişti 2026-09-26 (kullanıcı, BL-186 S1):** müsaitlik kısmı kalktı; müsaitlik uyarısını, kişinin rütbesi ne olursa olsun, yayınlayan onaylar ve onay onun adıyla kaydedilir ("Müsaitlik"). Üst kademeye giden yalnız izin talepleri.
- İşten çıkarma: manager yalnız "kendi lokasyonundan çıkar" yapar (o lokasyondaki atama ve gelecek vardiyalar biter). Tamamen işten çıkarma ve arşiv yalnız admin/owner. **Tek lokasyon (kullanıcı kararı 2026-09-27, FB-6.2 S1):** çıkarma olur, kişi lokasyonsuz çalışan kalır, Employees listesinde "No location" etiketiyle görünür, admin ve owner'a bildirim gider. **Şart:** çalışan kaydı çekmeceden lokasyonsuz kaydedilemez (en az bir lokasyon); lokasyonsuz duruma yalnız bu çıkarma komutu getirir.
- Çalışan kaydı (kullanıcı kararları, 2026-09-24): admin owner'ın kaydını düzenlemez. Manager kendi kaydını düzenlemez (talep bir üst kademeye gider), başka manager'ın, admin'in ya da owner'ın kaydını da düzenlemez. Manager, lokasyonlarından birinde çalışan birinin bütün kaydını düzenler; kişi başka lokasyonda da çalışıyor olabilir. Uygulama erişimini yalnız admin ya da owner kaldırır. Manager kendi lokasyonlarında çalışan birini employee rolleri arasında taşıyabilir. Owner ve admin kendi kayıtlarını düzenler.
- **Admin başka admin'in çalışan kaydını düzenlemez (koordinatör kararı KK-24, 2026-09-29; kullanıcı yokken, `docs/plan/KOORDINATOR-KARARLARI.md`).** Admin yalnız manager ve employee kayıtlarını ve kendi kaydını düzenler (Employees çekmecesi → Save: ad, lokasyon, iş, not); başka bir admin'in kaydını owner düzenler. "Admin: bütün lokasyonlar ve çalışanlar" bir **kapsam** kuralıdır (kimi görür), **rütbe** kuralı değil; rütbede ilke her yerde aynı: eş rütbe yönetilmez (işten çıkarma, erişim kaldırma, rol değiştirme — BL-270). Örnek: Zeynep (admin, Kadıköy) Kaan'ın (admin, Beşiktaş) işini değiştiremez; Kaan'ın kaydını owner değiştirir. Uygulama: FB-6.2 Dal A (`employee.save`, `rank_below`; matris hücresi).
- **Lokasyonu yöneten manager oraya atanır (kullanıcı kararı 2026-09-30, EMP-001 S1; main'de `bf52f5e1`):** "yalnız yönetir" lokasyonu yok. Izgarada görünmesin istenen manager kişi başına "Exclude from schedule" ile işaretlenir. 2026-09-27 FB-6.2 S2/S3 kararları ("Manages" etiketi; rol düşünce "yalnız yönetir" lokasyonlarının kalkması) 2026-09-30'da geri alındı.
- **Owner'ın çalışan kaydı (kullanıcı kararları 2026-09-27, FB-6.2 S4 + Management/Owner D1–D5):** owner bütün lokasyonlarda, ataması olmasa da çalışabilir; sonradan eklenen lokasyon owner'a otomatik atanır. İşlerde ise owner **yalnız atandığı işlerde** çalışır: sonradan eklenen iş otomatik atanmaz, çekmeceden atanır. Kaydederken birincil lokasyon ve birincil iş zorunlu değildir. Owner yalnız Management → Owner işine otomatik atanır; kurulumda ya da sonradan eklenen diğer işlere çekmeceden atanır. Lokasyonlar (kurulumda ya da sonradan) owner'a otomatik atanır, çekmecede işaretli görünür ve kaldırılamaz. Owner'ın çekmecesinde lokasyonlarda "Primary" seçeneği yoktur; kayıtlı birincil okunduğu gibi kalır (S4, kullanıcı kararı 2026-09-30, EMP-001 C; main'de `04a97650`). Owner işi birincil sayılmaz: kutucuğu işaretli ve kapalıdır, "Primary" sunmaz. **Exclude from schedule:** işaretli kişi yeni açılan taslakta görünmez; yayınlanmış vardiyaları düşmez — yayınlanmış program düzenlense, yayından kaldırılıp aynı program yeniden yayınlansa da kişi ve vardiyaları kalır. A–Z sıralamada adının baş harfine göre yer alır.
- **Management departmanı ve Owner işi (kullanıcı kararları 2026-09-27, D1–D5; 2026-09-30 S2, K2, K5 — EMP-001 C, main'de `62cfd10c`):** kurulumda otomatik oluşan korunan sistem kayıtlarıdır: silinmez, arşivlenmez, adı değiştirilebilir; kurulumdaki "en az 1 departman ve 1 iş" kuralına sayılmaz. Sayım "Management departmanının dışındaki iş"tir: Management altındaki hiçbir iş (Owner, Manager ve sonradan eklenenler) sayılmaz (K2; sihirbaz ve sunucu aynı sayar). "Owner" işi yalnız owner'a atanır, sahiplik devrinde yeni owner'a geçer. Kurulumda Management altında "Manager" işi de otomatik oluşur; var olan workspace'lere de bir kez eklendi (S2; koordinatör kararı KK-55). Manager sıradan iştir: adı değişir, arşivlenir, silinir, birincil seçilir; silinirse geri gelmez. Management'a başka işler de eklenebilir ("Assistant Manager"). Yalnız Owner işi birincil olamaz; Management'ın öteki işleri (Manager dahil) birincil seçilebilir ve "en az 1 iş" kuralına sayılır (S2; 2026-09-27'nin "Management işleri her zaman birincildir" kuralı kalktı). Çekmecede ilk işaretlenen iş birincil olur, sonra elle değiştirilir. **Yalnız Management işi olan kişi:** 2026-09-28 kuralı (BL-218 `.3b`: birincil iş olmadan kaydedilir) 2026-09-30'da geri alındı (S2): işi olan herkes birincil iş ister (ret `employee.primary_job_required`); owner istisnadır (yukarıdaki madde). En az 1 lokasyon her zaman zorunludur. "Remote" ya da "Exclude from schedule" işaretli kişinin lokasyon ve iş muafiyeti aynen kalır; lokasyon kuralı yalnız ikisi kapalıyken uygulanır (kullanıcı kararı 2026-09-28). **Manager istisnası (K4, kullanıcı kararı 2026-09-30 "Her müdür", EMP-001 B; main'de `9aa200eb`):** Remote olmayan her manager en az bir lokasyon ister; "Exclude from schedule" işareti manager'ı muaf tutmaz. İşaretli sıradan çalışan ve Remote kişi muaf kalır. Kural dört yolda uygulanır (kayıt, "Remove from <lokasyon>", rol değişikliği, müdür daveti); cümlesi "A manager needs at least one location to manage. Choose a location, or turn on Remote." Kuralın atlandığı yollar: BL-452, BL-456. Takvim: "Job/Position" sıralamasında Management'ın işleri (Owner, Manager ve eklenenler) her zaman en altta; owner tek satırdır (K5; main'de `eb97ac27`). "İki satır eştir" kuralı kalktı. "By department" sıralaması ayrı iş (BL-218 `.6`), yapılmadı. **Owner'ın iş listesindeki yeri (kullanıcı kararı 2026-09-28, BL-218 `.5`):** Employees çekmecesinin iş listesi departmanlara göre gruplanır (Schedule "By department" ile aynı düzen); Owner, Management departmanının içinde görünür ama devre dışıdır: işaretlenemez, kaldırılamaz. Management'ın öteki işleri (Manager dahil) Management altında listelenir ve seçilebilir. Görsel (EMP-001 C3; `04a97650`, `05c2625a`): Owner işinin kutucuğu işaretli ve kapalı, adı soluk; neden ekran okuyucuya ve fare ipucuna bağlı (Ekran kararları → Employees). Ayrıntı ve açık uygulama notları: `docs/plan/research/owner-management-job-2026-09-27.md` §6–7.
- Manager Settings'te katalogu salt okunur görür (job, departman, vardiya tipi/etiketi, çakışma ve takas kuralları, belge tanımları); Locations'ta yalnız kendi lokasyonları; Roles, sahiplik, billing, hesap görünmez. Manager tipi rollere organizasyon ayarı yazma izni verilemez. Duyuru ve önemli tarih yazmak kendi lokasyonları için serbest.
- **Settings, manager (kullanıcı kararları 2026-09-28, K14):** S1 varsayılan manager rolü katalog okuma izinlerini taşır (Ayşe Settings'te katalogu görür, değiştiremez). S2 manager tipi role `roles.*` izni verilemez (Roles'ta bu kutu manager rollerinde yok). S3 Acknowledgements tanımları katalogun parçası, manager salt okunur görür. S4 Important dates: manager workspace geneli tarihleri ve kendi lokasyonlarınınkileri görür; başka lokasyonun kaydı ve adı görünmez (M2).
- Kısıtlı kişi (eksik zorunlu belge ya da tamamlanmamış onboarding) yalnız kendi eksiğini tamamlar: belge yükleme, onboarding adımları, kendi profili, bildirimleri, çıkış. Program, talep ve yönetim işleri kapalı.
- **Owner belge kısıtına girmez (kullanıcı kararı 2026-10-01, FB-6.3):** owner belge son tarihlerinden ve kısıtlamalarından her zaman muaftır; belgesi eksik ya da gecikmiş olsa da kısıtlı kişi sayılmaz (kendi iznini kaydeder, oy verir, yönetir). Neden: kullanıcı kararı (serbest cevap). Reddedilen: "owner da engellensin" (2026-09-30 izin kenar durumu "Kısıtlı kişi talep gönderemez, oy veremez"in owner'a uygulanması; `nf-db` FB-6.3 (a) raporu §6 seçenek a). Owner'ın belgeden muaf olduğu satırla (K12, BL-221) aynı yönde; ILKELER P08'e istisna olarak yazıldı.
- **Owner kendi belgesini isteğe bağlı yükleyebilir (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`; BL-118):** owner muaf kalır (son tarih, kısıt, hatırlatma yok) ama Account → Documents'ta belgesini kendi isteğiyle yükleyebilir. Bugün sistem "obligation is closed" diye reddediyor (`document-lifecycle-service.ts:315`). Örnek: Mert Food Handler sertifikasını dosyada tutar. Reddedilen (önerilen): "şimdi değil, backlog'da". Uygulama: veritabanı + API + ekran (G18).

**Plan kilidi (kullanıcı kararı, 2026-09-24, seçenek A)**
- Kilit yalnız aynı taslaktadır: iki kişi aynı taslağı aynı anda düzenleyemez; farklı taslaklar ve farklı lokasyonlar birbirini kilitlemez.
- **Devralma yok (kullanıcı kararı, 2026-09-25).** Başkasının açık düzenlemesini kimse devralamaz (owner/admin dahil); kilit 4 dakika hareketsizlikte düşer, bekleyen kişi "Try again" ile girer. Kullanılmayan devralma işlemi (`POST /schedule/edit-lock/takeover`, `takeover_schedule_edit_session_service`, web `takeoverScheduleEditSession`) FB-6.1'de silinir ve `retired_objects_stay_gone`'a eklenir.
- Yayında, taslak açıldıktan sonra o lokasyonun yayını değiştiyse uyarı çıkar ("bu lokasyonun yayını sen başladıktan sonra değişti"); yayınlayan görerek karar verir.
- Nerede yaşıyor (3b, migration `20260924152910`): taslak kilidi `schedule_edit_sessions_active_draft_idx`; başlangıç noktası düzenleme ve taslakta `base_publication_ids` (`app_private.schedule_edit_starting_point`), yayınlanınca tetikleyiciyle ilerler; uyarı yayın önizlemesinde lokasyon başına `changed_since_start` (`app_private.schedule_publication_changes_since_start`).

**Taslak ve lokasyon (kullanıcı kararı, 2026-09-25)**
Kaynak: `docs/plan/research/fb61-dis-degerlendirme-2026-09-25.md` bölüm B, doğrulama bölüm E. Örnek: Ayşe = yalnız Kadıköy müdürü, Ali = Kadıköy + Beşiktaş'ta çalışan kişi, taslak T = Kadıköy + Beşiktaş. Taslağın lokasyonları `schedule_drafts.location_ids` / `schedule_edit_sessions.location_ids`'te.
- **B1 — Taslakta manager yalnız kendi lokasyonlarını görür ve düzenler.** Ayşe T'yi açınca yalnız Kadıköy ızgarası gelir; Beşiktaş ızgarası hiç gelmez. Ali'nin Beşiktaş vardiyası Ayşe'nin ızgarasında, Ali'nin satırında yalnız ghost (canlı başka lokasyon vardiyası modu) olarak görünür. Uygulama: FB-6.1 (okuma modeli `scope_set`, T3).
- **B2 — Kaydet ve yayınla lokasyon bazlıdır.** Ayşe T'yi kaydeder ya da yayınlarsa yalnız Kadıköy kaydedilir/yayınlanır; T'nin Beşiktaş kısmı dokunulmadan taslak olarak kayıtlı kalır. Yayın tarafı M2'nin sonucudur (yayın hedefi ⊆ `scope_set`, taşan lokasyon `authz.out_of_scope`; FB-6.1). Kaydetme tarafı yenidir: `save_schedule_edit_session_service` bugün lokasyon almıyor; FB-6.1b'de tasarlanır. Kilit taslak başına kalır (kullanıcı kararı, 2026-09-25, FB-6.1 K-3): Ayşe T'yi düzenlerken Beşiktaş müdürü Mehmet T'yi açamaz, bekler; lokasyon başına kilit yok.
- **B3 — Çok lokasyonlu taslağı silmek taslağın bütün lokasyonlarına sahip olmayı ister.** T'nin lokasyonlarından biri bile Ayşe'nin kapsamında değilse Ayşe T'yi kısmen bile silemez: `T.location_ids ⊆ scope_set(actor, w, 'schedule.manage')`, değilse 42501 + `authz.out_of_scope`. Admin/owner siler. M2'nin "o lokasyonun onayı ya da admin/owner" cümlesi taslak silmede daralır: onay yolu yok, yalnız bütün lokasyonlara sahip manager ya da admin/owner. Uygulama: FB-6.1 (`delete_schedule_draft_service`). **Template yeniden adlandırma ve silme aynı kurala uyar** (kullanıcı kararı, 2026-09-25, FB-6.1 K-2): template'in vardiyalarındaki lokasyonların hepsi manager'ın kapsamında değilse yalnız admin/owner yapar, aksi `authz.out_of_scope`. Template'in kendi lokasyonu yok; kontrol vardiyalarının lokasyonları üzerinden.
- **Vardiyasız yayın yayında sayılmaz (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`; BL-370):** vardiyası olmayan bir hafta yayınlanabilir ve kayıt oluşur, ama Schedule haftayı yayınlanmamış gösterir ve Unpublish sunmaz; bugünkü davranış kalır, kod değişmez. Örnek: Beşiktaş'ın 13–19 Ekim haftası boş yayınlanırsa ekran "yayınlanmamış" der. Reddedilen (önerilen): "yayında sayılsın, geri alınabilsin" (ILKELER P25); "boş yayın hiç oluşmasın".
- **B4 — Boş yeni taslakta "yayınlanmışları ghost göster" anahtarı.** Kadıköy'ün o hafta yayınlanmış planı varken Beşiktaş için yeni boş taslak açılırsa ızgarada bir aç/kapa anahtarı olur; açıkken yayınlanmış vardiyalar ghost görünür, kullanıcı düzenlemeden çıkmadan açıp kapatır. Bu mod (yayınlanmış plan önizlemesi) **çakışma üretmez**: uyarı ve engel hesaplamasına girmez. Canlı başka lokasyon vardiyası modundan (B1, yukarıdaki ghost satırı: çakışma uyarısı verir) ayrıdır. Uygulama: FB-6.1b.
- Dışa aktarma sorusu (FB-6.1 2a/Q3) bu bölümle değil M2 ile kapalıdır: dışa aktarılan lokasyonlar ⊆ `scope_set(actor, w, 'schedule.export')`, değilse `authz.out_of_scope`.
- **Q-A — Zamanlanmış dışa aktarma kayıtlarını kim görür (kullanıcı kararı, 2026-09-25).** Kaydın (`scheduled_schedule_exports.location_ids`) bütün lokasyonları manager'ın kapsamındaysa görür; değilse görmez (alıcı e-postaları dahil). Admin'in Kadıköy + Beşiktaş gönderimini yalnız Kadıköy müdürü Ayşe görmez. Son dışa aktarmalar listesi de aynı kural. ~~Kaydın bir lokasyonu sonradan silindiyse kayıt manager'a görünmez, yalnız admin/owner'a (2026-09-25 kararı)~~ — **yerine geçti 2026-09-26** (Q-C: silinmiş lokasyon sayılmaz). Lokasyon dizisi boş ya da bilinmeyen kayıt da manager'a görünmez. Düzenleme/silme zaten yalnız kişinin kendi kaydında. Uygulama: FB-6.1 `.2`.
- **Q-B — Lokasyonu sonradan silinmiş taslak ya da şablon (kullanıcı kararı, 2026-09-25).** Silinmiş lokasyon B3/K-2 hesabından düşülür; kalan lokasyonların hepsi manager'ın kapsamındaysa manager siler/yeniden adlandırır, değilse admin/owner. Örnek: Kadıköy + Beşiktaş taslağında Beşiktaş kapatıldıysa Ayşe (Kadıköy) taslağı silebilir. Uygulama: FB-6.1 `.2` / `.4`.
- **Q-C — Silinmiş lokasyon şablon ve zamanlanmış dışa aktarma yetkisinde hiçbir kuralda sayılmaz (kullanıcı kararı, 2026-09-26).** Q-B'yi okuma, listeleme ve uygulamaya genişletir; Q-A'nın silinmiş lokasyon hükmünün yerine geçer. Örnek: "Standard week" şablonu Kadıköy + Beşiktaş; Beşiktaş varken Kadıköy müdürü Ayşe şablonu görmez (bugünkü gibi); Beşiktaş silinince Ayşe şablonu görür, adını değiştirir, uygular, siler. Zamanlanmış dışa aktarma kaydı aynı: silinmiş lokasyonlar düşülür, kalanların hepsi kapsamdaysa manager görür. Arşivli lokasyon da aynı sayılır (KK-13, KK-67; G8a, main `3c07c15d`, 2026-09-30): arşivli ya da silinmiş lokasyon hiçbir kuralda canlı değildir; arşivden çıkınca geri gelir. Settings → Locations arşivli lokasyonu lokasyonları değiştirebilene gösterir (Restore için). Kural her işlemde aynı tek yerden uygulanır. Uygulama: BL-188.
- **Zamanlanmış dışa aktarma Export panelinde kurulur; kuralı kim düzenler (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`):** (1) Haftalık e-posta kuralı Schedule → Export paneline taşınır, özellik MVP'de kalır (BL-437). Reddedilen: "MVP'den çıksın, kod silinsin", "backlog'da beklesin". Neden: ILKELER P02. (2) Owner/admin her kuralı düzenler ve siler; manager yönettiği lokasyonların kurallarını, kim kurduysa, düzenler; bütün lokasyonları arşivlenmiş kuralı yalnız owner/admin düzeltir ya da siler (BL-494). Bugün kural yalnız kurana ait (`20261003000000_an_archived_location_counts_nowhere.sql:851`); bu karar onu değiştirir. Q-A'nın görme kuralı değişmez. Örnek: Ayşe izindeyken onun Moda kuralının adresini owner değiştirir; Moda arşivlenince kuralı yalnız owner ya da admin düzeltir. Reddedilen: "bugünkü gibi, yalnız kuran", "panel işinde ekranla karar". Dayanak: yok — yeni karar.

**İzin (time off)**
- İzin kişiye aittir; talep formunda lokasyon seçilmez.
- Onay (kullanıcı kararları 2026-09-30, FB-6.3 sürüm 2; önceki "o gün yayınlı vardiyası olan lokasyonlar, yoksa birincil lokasyon" kuralının yerine): çalışanın atandığı canlı lokasyonların manager'ları oy verir, kimin o gün çalıştığına bakılmaz. Gereken lokasyonlar talep anında sabitlenir; sonradan eklenen lokasyon oy istemez; arşivlenen, çalışanın çıkarıldığı ya da karar verebilecek manager'ı kalmayan lokasyon düşer; hiç lokasyon kalmazsa karar yalnız admin/owner'ındır. Tek lokasyonda bir manager'ın onayı ya da reddi kesindir; çok lokasyonda her lokasyondan en az bir onay gerekir (birden çok lokasyonu yöneten manager'ın tek oyu hepsini kapsar); tek red talebi hemen kapatır. Admin/owner tek başına onaylar ya da reddeder, karar anında geçerlidir (onay penceresi, manager'lara bildirim). Rütbe kuralı geçerli: manager'ın talebine yalnız admin/owner, admin'inkine yalnız owner karar verir. Örnek: Ali Kadıköy ve Beşiktaş'a atanmış; Kadıköy müdürü Ayşe onaylar, talep "waiting: Beşiktaş" olur; Beşiktaş müdürü Mehmet onaylayınca kesinleşir.
- **Belgesi gecikmiş manager (kullanıcı kararı 2026-10-01, FB-6.3 yeniden incelemesi; koordinatörün penceresinde):** manager belgesi geçici olarak geciktiği için karar veremiyorsa lokasyonu oylamadan düşmez; o lokasyonun kararı admin/owner'a gider. Sistemin otomatik onayı (KK-70) yalnız lokasyonda karar verebilecek manager gerçekten kalmadıysa (ör. işten çıkarıldı) işler. Örnek: Ali Kadıköy ve Beşiktaş'a atanmış; Kadıköy müdürü Ayşe onaylar; Beşiktaş müdürü Mehmet'in belgesinin son tarihi geçmiş — Beşiktaş düşmez, Ali'nin talebine admin/owner karar verir. Mehmet işten çıkarılmış olsaydı Ayşe'nin onayı yeterdi. Neden: kullanıcının seçimi (gerekçe aktarılmadı). Reddedilen: "bugünkü gibi otomatik onay" (geçici kısıtta da lokasyon düşer, talep kendiliğinden onaylanır) ve "Mehmet'i beklesin" (belgesi düzelene ya da süre dolana kadar bekler). Kodda: `8d84f278` (canlıda 2026-10-01).
- **Oylamanın ayrıntısı (kullanıcı kararları 2026-09-27 S1–S3 ve 2026-09-30):** oy talebin bütünü içindir; kısmi onay yoktur (admin/owner için de) — red notu yazılır ("yalnız 11–12'yi onaylayabilirim"), çalışan isterse yeniden talep gönderir. "Return to pending" yoktur. Oy talep açıkken değiştirilebilir. Çalışan kapanana kadar yalnız "Pending" görür; karar verenler ilerlemeyi (lokasyon lokasyon kim onayladı, kalan, son karar anı) görür. Bir lokasyonda birden çok müdür varsa lokasyonun oyunu herhangi biri verir. Talepte lokasyon yoktur; izin saatleri birincil lokasyonun saat dilimiyle (lokasyonsuz kişide cihazınki) talep anında sabitlenir. Bir talep tek ardışık tarih aralığıdır; başlangıcı geçmiş talep gönderilemez. **İptal (K10/S4, 2026-09-30):** çalışanın iptal talebi aynı oylamayla işler, beklerken izin geçerlidir. **Revoke:** çalışanın lokasyonlarından herhangi birinin manager'ı ya da admin/owner tek başına, gerekçe zorunlu; yalnız başlamamış kısım kalkar. **Süre:** workspace ayarı "izin karar süresi" (saat, varsayılan 24); son karar anı = başlangıç − süre (süre içinde gönderilen talepte başlangıç); karar çıkmazsa otomatik red (iptal talebinde: iptal reddedilir, izin kalır); oy vermemiş lokasyonların manager'larına redden 12 saat önce bir hatırlatma.
- **Bekleyen izni yalnız karar veren ve sahibi görür (kullanıcı kararı 2026-10-01, iki adımda ~16:45Z; kaynak: kullanıcı, koordinatörün penceresinde, besleme #72):** bekleyen (pending) izin talebini — talebi, ilerlemesini ve oylarını — yalnız ona karar verebilenler ve talebin sahibi görür; her rütbede aynı: Ali'nin talebini oy veren müdürleri, müdür Hande'ninkini admin/owner, admin'inkini owner görür. Örnek: Kadıköy'de Ayşe ve Hande müdür; Hande'nin bekleyen izin talebini Ayşe hiç görmez, admin/owner görür ve karar verir. Onaylanmış izin takvimde M2'ye göre görünür; yayın notu (aynı gün kararı) bekleyen izni yine haber verir, ayrıntısız. Neden: eş rütbe birbirinin talebiyle ilgilenmez (Mert: "Müdürlerin day off requestlerini adminler yada owner yanitlamasi lazim. Kendi pozisyondan arkadasin değil"); ILKELER P07. Reddedilen: "talebi görsün, ilerlemeyi değil" (koordinatörün önerisiydi), "talebi ve ilerlemeyi görsün" (bugünkü). Uygulama: `tasks/FB-6.3.md` `.8c` (henüz kodda değil).
  - **Ek (kullanıcı kararları 2026-10-01 ~18:15Z, koordinatörün penceresinde, besleme #77; üçü de önerilen; FB-6.3.8c keşfi):** (S1) Requests → Time off → Closed sekmesi de aynı kural: kapanmış izin talebini de yalnız ona karar verebilenler ve sahibi görür; onaylanmış izin takvimde M2'ye göre görünmeye devam eder. (S2) Bekleyen iptal talebi aynı kural. (S3) Belgesi eksik olduğu için şu an oy veremeyen manager talebi görür ama oy veremez. Örnek: Kadıköy'de Hande'nin belgesi gecikmiş; Ali'nin bekleyen talebini görür, "Approve" düğmesi kapalıdır.
- Onaylanan izin bütün lokasyonlarda kesin engeldir (manager bunun üstüne vardiya yazamaz; ayarı yoktur); taslaklarda çakışma görünür, yayın engellenir. Son onay anında sistem, izinle çakışan yayınlı ve başlamamış vardiyaların tamamını open shift'e düşürür (oy verenin yayın yetkisi gerekmez; başlamış ya da geçmiş vardiya açılmaz); manager'lara "onaylandı, N vardiya açık" bildirimi gider. Talep detayı etkilenecek vardiyaları lokasyon lokasyon gösterir, vardiya açacak oyda onay penceresi çıkar; bir manager'ın onayı kendi lokasyonunun o anki etkisine bağlıdır, etki değişirse oyu sıfırlanır. İzin sonradan iptal ya da revoke edilirse açılan vardiyalar açık kalır (2026-09-30).
- **Aynı turda tek izin bildirimi (kullanıcı kararı 2026-10-01; kaynak: kullanıcı, koordinatörün penceresinde, besleme #71):** süre işinin aynı turunda admin/owner'a hem "Time off waits for an admin" (lokasyonda karar verebilen kalmadı) hem "Time off waits for your decision" (son karara 12 saat) düşecekse zilde tek satır gider, ikisinin bilgisi bir arada. Örnek: Kadıköy'ün tek müdürü Hande'nin belgesi gecikmiş; Ali'nin 3 Ekim izninin son karar anına 12 saat kala owner aynı dakikada tek bildirim görür. Neden: ILKELER Anti-hedefler "Bildirim gürültüsü", P07 (admin gürültüsü yoktur). Reddedilen: "ikisi de kalsın" (bugünkü iki satır). Uygulama: `tasks/FB-6.3.md` `.8b` (henüz kodda değil).
- **Yayın notundaki bekleyen izni yayıncı görür (kullanıcı kararı 2026-10-01; kaynak: kullanıcı, koordinatörün penceresinde, besleme #71):** Schedule → Publish penceresinin bekleyen izin notu, izin taleplerini görme izni olmayan ama yayın izni olan role de görünür; talebin ayrıntısı ve oylar görünmez. Örnek: "Shift lead" Can haftayı yayınlıyor; izin taleplerini göremiyor ama notta "Ali has time off waiting for a decision on Oct 3" görür ve Ali'nin o gününe vardiya yazmadan önce düşünür. Neden: `tasks/FB-6.3.md` Kural 14 (etki şeffaflığı), ILKELER P23 (müdür, göremediği bilgi yüzünden çakışma yaratmamalı). Reddedilen: "not yalnız izin okuma izni olana". Kodda bugünkü davranış (KK-75, park paketi); değişiklik yok.
- **Son karar anı talebin saat diliminde ve dilim adıyla yazılır (kullanıcı kararı 2026-10-01 ~17:20Z; kaynak: kullanıcı, koordinatörün penceresinde, besleme #75):** Requests → Time off listesi ve talep paneli "Decide by", Employee Hub izin talebi "Decision by" talebin dilimiyle ve dilim adıyla yazılır; her cihazda aynı yazı. Örnek: Ali'nin İstanbul'daki talebi ABD'deki cihazda da "Oct 9, 5:04 AM Istanbul time". Neden: aynı satırdaki izin saatleri talebin dilimiyle yazılıyor (tutarlılık), ILKELER P23. Reddedilen: "cihaz saatiyle, dilim adıyla", "önce sohbette konuşalım". Uygulama: FB-6.3.8d.

**Müsaitlik**
- Çalışan müsait olmadığı günleri/saatleri işaretler (onboarding'de opsiyonel adım, sonra Employee Hub). Kaydettiği an geçerli, onay yok. Manager ayrıca çalışana görünmeyen bir hatırlatma notu tutabilir. Çalışan Employee Hub → Schedule'da yalnız kendi işaretlediği günleri taralı görür; manager'ın notu ona hiç görünmez.
- **Müsaitlik bir tercihtir, hiçbir zaman engel değildir (kullanıcı kararı, 2026-09-26).** Çalışanın "müsait değilim" işareti hiçbir vardiyayı engellemez ve çakışma (conflict) üretmez; yalnız yöneticiye görsel uyarıdır, yönetici görüp geçer. Kapsam: taslak, yayın, takas/pickup/cover, her yol. Taslak ve yayında manager ve admin çalışanın tercihini ezer; takas/pickup/cover'da çalışan kendi tercihini ezer. Tek davranış, ayar yok: Settings → Conflict handling'deki "Employee availability" satırı (Warn / Require confirmation / Block) tamamen kalkar. Manager'ın gizli hatırlatma notu da aynı tek davranışa katılır (eski "her zaman Yumuşak" istisnası yok): uyarı gösterir, engellemez.
  - Uyarı iki anda çıkar. (1) Schedule'da vardiya o kişinin müsait olmadığı saate yazıldığı an hücrede görsel uyarı; yazma durmaz, onay penceresi açılmaz. (2) Publish'te aynı uyarılar yeniden listelenir ve onaylanmadan yayın geçmez; onay kimin verdiği ve ne zaman ile kayıtlıdır. Onayı yayınlayan verir, uyarının ait olduğu kişinin rütbesine bakılmaz (Ayşe müdür Can'ın uyarısını kendisi onaylar). Yalnız yeni ya da değişen uyarı onay ister: vardiya değiştiyse ya da işaret son onaydan sonra değiştiyse "değişen"; önceki onaylı ve değişmemiş uyarı onaylayan ve tarihle görünür, onay istemez (kullanıcı kararları 2026-09-26, BL-186 S1/S2).
  - Uyarı metni kişinin bu vardiyaya göre durumunu söyler, değişikliği değil: ör. "Ali shows as unavailable for this shift." ("Ali's availability changed" değil.)
  - Yayından sonra gelen işaret de aynı kuralla işler: yayınlanmış vardiya düşmez, bir sonraki yayında "değişen" uyarı olarak onay ister.
  - Otomatik doldurma (Schedule → Auto-fill) müsait görünmeyen kişiyi seçmez; tercih sistemin kendi seçiminde gözetilir, yönetici elle yazarsa uyarıyla yazılır (kullanıcı kararı 2026-09-26, BL-186 S3). (Bu, 2026-09-26 sabahki BL-184 kararının "yeniden yayında bilgi notu" biçiminin yerine geçti; FB-6.1.7'nin "Sert'te yayınlanmış vardiya korunur" istisnası gereksizleşir ve silinir.)
  - Employee Hub → My availability → Availability sekmesi çalışana bunu açıkça söyler: buradaki işaret garanti değil tercihtir; manager/admin yine de vardiya yazabilir. Yazılırsa sorumluluk çalışanındır: çalışmak, vardiyayı bırakıp (release) başkasının almasını sağlamak ya da cover istemek. Tercih değil zorunluluksa time off talebi doldurulur. Yayınlanmış bir vardiya için müsait değilse time off talebi ve/veya takas/release/cover; hepsi manager onayına tabi. (Son İngilizce metin `nf-arayuz`'un.)
  - Onaylı izin (approved time off) bundan ayrıdır ve kesin engel kalır ("İzin" bölümü, FB-6.1.6). Uygulama: BL-186.
- ~~Settings'teki müsaitlik ayarı üç kademe (Uyar / Yumuşak / Sert; manager hatırlatması her zaman Yumuşak)~~ — kullanıcı kararı 2026-09-24; **yerine geçti 2026-09-26** (üst madde).

**Takas, bırakılan vardiya (pickup), cover — uygunluk**
- Zorunlu: çalışanın lokasyon ve job ataması vardiyaya uygun; aynı anda iki vardiya olmaz (takasta bırakılan vardiya hariç); sonunda manager/admin onayı.
- Çalışan kendi müsaitliğini ve kendi onaylı iznini kendi rızasıyla ezebilir; yalnız bilgilendirme onayı istenir. Müsaitlik bu süreçlerde de hiçbir zaman engel değildir (2026-09-26, "Müsaitlik"; eski Uyar/Yumuşak/Sert ayarı kalktı). İzinli günde vardiya alınırsa izin o saatler için kısalır, izni onaylayana bildirim gider. (Kullanıcı 2026-09-26'da teyit etti: kural bu, bugünkü kod engel sayıyor; düzeltme BL-182.)
- Cover talebinin aday listesi: onaylı izinli kişi hiç görünmez; müsait olmayan "müsait değil" etiketiyle görünür.
- Yol ve dinlenme süresi: Settings'te takas/pickup/cover için ayrı ayarlar; kurala uymayan değişim manager onay ekranında açıkça işaretlenir.
- Onay: pickup/cover'ı yalnız vardiyanın lokasyonu onaylar; iki lokasyonun vardiyaları birlikte el değiştirirse (takas) iki lokasyon da onaylar.
- Onay beklerken manager saat/tarih/lokasyonu değiştirirse: yeni saatler kabul edenin başka bir vardiyasıyla kesişiyorsa kabul düşer; kesişmiyorsa değişiklik bildirimi gider, kabul korunur.
- Manager'ın gizli hatırlatma notu uygunluğu etkilemez; onay ekranında manager'a gösterilir. Çalışanın müsaitlik işareti de uygunluğu etkilemez (2026-09-26).

**Bildirimler**
- Karar gerektiren bildirim karar verecek kişiye gider. Bildirim sistemi ayrı bir projede baştan tasarlanacak.

**Giriş ve hesap kurtarma (kullanıcı kararı, 2026-09-26)**
- Parolasını unutan kişi giriş ekranındaki "Forgot password?" bağlantısıyla e-postasını yazar; gelen sıfırlama bağlantısıyla yeni parola belirler ve içeri girer. Tek kullanımlık giriş bağlantısı (magic link) yolu değil.
- Bağlantı 1 saat geçerli, tek kullanımlık.
- Ekran, e-posta kayıtlı olsun olmasın aynı cevabı verir: "If an account exists for this email, we sent a reset link." Bir e-postanın Newfork'ta olup olmadığı dışarıdan anlaşılmaz.
- E-posta davetlerin gittiği yoldan (Resend) gider. Uygulama: BL-137.

**Teknik sözleşmeler (FOUNDATION-B)**
- "Hayır" tek biçim: `42501` + HINT'te makine anahtarı (`authz.*`), doğrulamadan önce. API: üyeye 403 + neden, üye olmayana 404. Bilinmeyen ve kapsam dışı hedef aynı cevap (`authz.out_of_scope`). Boş lokasyon asla "her yer" demek değildir.
- Yetki çekirdeği (Aşama 4a, migration `20260924123013_authorization_core.sql`): bir giriş noktasının ilk ifadesi `perform app_private.authorize(actor, w, '<işlem>', target_locations => ..., target_person => ...)`; okuma modeli `location_id = any (app_private.scope_set(actor, w, '<işlem>'))`; RLS `app_private.rls_can(w, '<işlem>', ...)`. Kural `app_private.authz_actions` satırında (izin, owner'a özel, rütbe, kapsam sınıfı), manager'ın erişimi `authz_scope_rules`'ta (model M2). Yeni işlem: önce `authz_actions` satırı ve matriste hücresi (`authorization_matrix.test.sql`), sonra giriş noktası. Kural TypeScript'te yeniden yazılmaz.
- Kapsam dışı bırakılanlar (sonra sıfırdan tasarlanacak): Line Up, bildirim platformu. Silinenler: kiosk, zaman takibi, eski availability sistemi, eski Requests → Shift changes takas akışı.

## Katılım ve giriş akışı

Kaynak: Mert'in 2026-09-16..30 cevapları; hepsi 2026-10-01'de "doğru aktarılmış" diye onaylandı (KARAR-001). Neden: kullanıcı zorlanmaz, niyeti sorulur, ilerlemesi kaybolmaz (ILKELER P10).

- **Girişten sonra yönlendirme.**
  - Bekleyen yeni davet her girişte ilk ekranda "Active invitation found" olarak gösterilir.
  - "Not now" denirse tek workspace varsa oraya, birden fazla varsa davetin de listelendiği seçim ekranına gidilir.
  - Tek workspace'i olan kişi doğrudan rolüne göre ilgili ekrana iner.
- **Davetin önceliği.** Hiç workspace'i olmayan ve bekleyen daveti olan kişi önce daveti kabul ya da reddeder (sert engel). Daha önce işletme kurmuş kişi bekleyen davet yüzünden durdurulmaz.
- **"Create your own business" görünürlüğü** (son açık karar 2026-09-18 10:03).
  - Yalnız 0 ya da 1 bekleyen davet varken, uygun ekranda görünür.
  - 2 bekleyen davet varsa, ya da 1 davet ve en az 1 yarım kurulum varsa gizlenir.
  - Reddedilenler: "her zaman görünsün" ve "2+ ise gizlensin" (tek başına).
- **Kendi işletmesini açma.** Owner olmadığı bir workspace'te aktif üyeliği bulunan hesap kendi işletmesini açamaz; bunun için ayrı hesap gerekir.
- **Welcome back.**
  - Owner kurulumunu yarıda bırakan kişi zorla kuruluma sokulmaz.
  - Ekran davetleri ve yarım işi listeler, "Create" ve "I am waiting for another invitation" seçeneklerini sunar, niyeti sorar.
  - Bir kez karşılanmış kişi (workspace'i kapansa, devretse ya da çıkarılsa da) yeniden "yeni" sayılmaz.
- **Kurulumdan çıkmak vazgeçmek değildir.**
  - İlerleme kaydedilir; kişi kaldığı yerden sürdürür. Yarım kurulumda "Continue setup" ve "Discard" bulunur.
  - Kaybedilecek kişi ya da veri yoksa silmek için parola istenmez. Bu eylem "start over"dan ayrıdır.
- **"Create" düğmesi** doğrudan kurulumun ilk adımını açar. Arada workspace adı penceresi ya da hesap ayarları sayfası yoktur.
- **Üyelik durumları.**
  - terminated: listeden tamamen düşer.
  - pending ya da suspended: listede görünür ama erişim vermez.
  - Aktif üyelik yoksa "no organization" ekranı açılır.
- **Çalışan kurulumunda sıfırlama (reset) yoktur.** Testler ve kod buna göre yazılır.
- **Favori workspace.** Favori ya da varsayılan işaretlenen workspace sunucuda saklanır ve cihazlar arası geçerlidir. İşaretli yoksa sistem tahmin etmez, her girişte sorar.
- **Kurulum bitmeden davet yok (kullanıcı kararı 2026-10-01 ~17:45Z, kayıt oturumunun penceresinde, çoktan seçmeli; tazelik `27d540be`; BL-419):** kurulumu bitmemiş (taslak) workspace'ten davet gönderilemez; ekranda yol zaten kapalı, API de reddeder. Bugün API'de kontrol yok (`apps/api/src/app.ts:544`). Örnek: Mert "Beyoğlu"nu kurarken 2. adımda bıraktıysa API'den Ali'ye davet atamaz. Reddedilen (önerilen): "kabul, böyle kalsın". Uygulama: davet rotasına kurulum-bitti kontrolü + test (G17).

## Form ve girdi kuralları (ABD)

Kaynak: kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001); aksanlı harf kuralı kullanıcı kararı 2026-10-01. Neden: pazar ABD (ILKELER P12), doğru veri tahminden önce gelir (P11). Kodda uygulanma durumu ölçülecek (BL-503).

- **Harfler.** Metin alanlarında Türkçeye özgü harfler yasaktır (ş, Ş, ğ, Ğ, ı, İ); tire serbesttir.
  - Öteki Latin aksanlı harfler serbesttir (é, ñ, ü, ö, ç): "José Peña" doğru yazılır.
  - Reddedilen: "yalnız A-Z".
- **Telefon.**
  - Yalnız rakam girilir; +1 sabittir. Ülke seçici ve uluslararası numara yoktur.
  - Yazarken (xxx) xxx-xxxx maskesi uygulanır; mevcut şema kullanılır.
  - Reddedilenler: "serbest metin" ve "uluslararası +E.164".
- **E-posta tekil.** Bir workspace'te e-posta tekildir; aynı e-postayla davetli ya da davetsiz ikinci bir kayıt açılamaz. Çakışma kaydederken değil, çekmeceye yazıldığı anda uyarılır.
- **Legal name.**
  - Boş kalamaz; tahminle ya da kopyayla doldurulmaz.
  - Davette employer girer; kişi zorunlu alan olarak kendisi yazar.
  - Middle name ve preferred name dışındaki bütün alanlar zorunludur.
- **Preferred name.** Workspace ayarındaki iki moddan biriyle çalışır.
  - Auto approve: anında yayınlanır, yöneticiye bildirim gider.
  - Manager approval: onay bekler; reddedilirse sessizce iptal olur.
  - Preferred name legal belgelerde asla kullanılmaz.

## MVP sınırı

Kaynak: kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001). Neden: self-serve ücretli ABD lansmanı önce (ILKELER P13).

- Compliance, payroll, time tracking ve break ile ilgili her şey MVP sonrasıdır.
- Stripe billing şimdilik yoktur; ödeme kapısı ve entitlements işine girilmez.
- Sonradan sıfırdan tasarlanacak modüle (Line Up) bugün yatırım yapılmaz.

## Ekran kararları

Yalnız koddan çıkarılamayanlar: kullanıcının bir ekran için verdiği karar ve
bilerek öyle bırakılan ya da bilinip bekletilen davranış. Kod özeti, dosya
yolu, bileşen listesi yazılmaz; kod okunur. Bir iş buradaki bir maddeyi
değiştiriyorsa madde aynı işte düzeltilir; "iş girince yazılır" notu
bırakılmaz. Ekranın maddesi yoksa başlığı da yoktur.

### Genel (her ekran)

Kaynak: kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001).

- **Erişim yönlendirme metni.** Kişi adı değil rol yazılır: owner'ın adı yerine "Admin". Kullanıcı metni geliştirici ya da sistem mesajı gibi yazılmaz.
- **Masaüstü önceliği.** Varsayılan tasarım önceliği masaüstüdür; yönetim ekranları masaüstüne, çalışan ekranları telefona göre yapılır (ILKELER A).
- **Gezinme.** Sayfa içi hub sekmeleri kaldırılır; bütün gezinme sol menüdedir. Henüz yapılmamış sayfalar menüde yer tutucu olarak durur.
- **Kaydetme.** Bir pencerede tek kaydetme noktası vardır: sağ alttaki Save. Bölüm içinde ayrı Save düğmesi olmaz.
- **Pencereyi kapatmak** (kullanıcı kararı 2026-10-01, ILKELER P26). Yalnız kayıp büyükse "Discard unsaved changes?" sorulur.

### Giriş ekranları (Sign in, Forgot password, Reset password)
- Sign in'de ikinci düğme (giriş ↔ hesap oluşturma) hiç yeşil değil, beyaz:
  ekrandan çıkışın ikinci yolu. `?from=` yalnız aynı origin'deki `/` ile
  başlayan yola gider, gerisi `/app`.
- Forgot password hesap olsun olmasın aynı metni gösterir ve sunucu her
  cevabı sabit ~1,5 sn'de verir: bir e-postanın kayıtlı olduğu ne metinden ne
  süreden anlaşılmaz. Hız sınırı e-posta başına saatte 3, IP başına 10.
  Bekleyen: sayaç bellekte, kalıcı değil (BL-162).
- Reset password belirteci bağlantının `#` parçasında taşınır (sunucuya
  gitmez, log'a düşmez) ve sayfa açılınca değil "Save password"da harcanır
  (e-posta tarayıcısının önden açması tüketmesin). Parola en az 8.
  Bekleyen: Supabase'in kendi sınırı 6, doğrudan çağıran 6 ile geçebilir
  (BL-161).

### Kurulum sihirbazı (owner onboarding)
- 3. adım "What jobs do people work?": yalnız Management departmanı varken
  "Your structure" altında "<Management adı> comes with every workspace. Add a
  department for the jobs your team works." yazar; Continue kapalıdır (kullanıcı
  kararı 2026-09-30, BL-480 varyant B, `37912a90`).
- 4. adım "Add your team" → Jobs: "Owner" işi işaretsiz, kilitli ve adı soluk;
  nedeni ekran okuyucuya okunur. Cümle ve kilit görünümü Employees
  çekmecesindekiyle aynı: Owner işini yalnız workspace owner'ı taşır (kullanıcı
  kararı 2026-09-30, BL-489, `bc7c5ebc`).

### Account
- Profile düzeni: fotoğraf en tepede, özenli tasarımla; legal name üstte. "How you appear" bölümü çıkarılır; "Who to reach" adı "Emergency contact" olur; workspace adı etiketi gösterilmez; düzen kompakttır (kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001)).
- Workspaces listesinde aktif satırın "Open" düğmesi de yeşil ve tıklanabilir kalır (kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001)).
- Profile: "Remove" fotoğrafı yalnız taslaktan kaldırır; "Save changes"e
  basılana kadar silinmez, Discard geri getirir.
- Security: bekleyen e-posta değişikliğini geri çeken düğme kırmızı ve adı
  bilerek "Cancel change" — yalnız "Cancel" pencereyi kapat gibi okunur
  (kullanıcı kararı 2026-09-22).
- Workspaces: çalışılan workspace'in satırı tonlu; ayrı "Current" rozeti yok
  (kullanıcı kararı).
- Documents, belge çekmecesi (Account → Documents, Employees → Documents, Employees çekmecesi → Documents; koordinatör kararı KK-50, G18 dilim a; `f71538ee`): çekmecede yazılan son kullanma tarihi ve ek alanlar dosya yükleyince, taslak dosya silince ve erteleme kaydedince silinmez; taslak gönderilene kadar çekmecede durur. Yazılan, taslak sürümün kimliğine bağlıdır (başka taslak gelirse onun kayıtlı değeri görünür) ve sunucuda saklanmaz: çekmece kapanınca ya da sayfa yenilenince gider; kapatırken "Discard unsaved changes?" sorulur. Kullanıcı kararı 2026-09-30 (BL-467, `e56d1989`): öteki yazılanlar da aynı kuralla korunur — ret gerekçesi, düzeltme ve dosya kararları, erteleme ve uzatma nedeni ve günleri, imzalayan adı, "okudum" işareti, saat dilimi; her biri yazıldığı şeye (belge, incelenen sürüm, politika metni, taslak) bağlıdır; komut başarılı olunca o formun alanları temizlenir.

### Employee Hub
- Shift Hub telefondaki alt çubukta "Requests" adını taşır.
- Tanınmayan alt yol (eski `lineup` bağlantıları dahil) More sayfasını açar.
- Çalışan görünümüne geçiş (kullanıcı kararı 2026-09-30, FB-6.2.8 varyant A):
  kendi çalışan kaydı olan owner, admin ve manager kenar çubuğunda Account'un
  üstünde "Employee view" satırını görür; telefonda yönetimin More menüsünde.
  Çalışan görünümü çalışanın kendi çerçevesinde açılır (Employees, Settings
  yok); dönüş aynı satırdan ("Management view") ve telefonda Hub'ın More
  sayfasından. Neden: tek satır, iki yönde aynı yer; yönetim menüsü
  kalabalıklaşmaz.

### Employees
- Lokasyondan çıkarma (kullanıcı kararı 2026-09-30, varyant A): "Remove"
  lokasyonun kendi satırında, iki tık kırmızı; sunucunun çıkarmaya izin
  verdiği lokasyonun kutucuğu kilitli, oradan çıkarmanın tek yolu Remove.
  Yöneticide "Terminate employee" gizlenmez, kilitli ve soluk durur;
  Locations'ın altında tek satır: "Only an admin or the owner can terminate
  an employee. To take <ad> off <lokasyon>, use Remove." Neden: yönetici
  çıkaramadığı kişiyi nereden alacağını ekranda görür.
- Liste, lokasyon sütunu (kullanıcı kararı 2026-09-30, varyant A; EMP-001 B'den sonra): "No location" uyarı tonunda çip; telefonda lokasyon sütunu olmadığı için çip kişinin adının altında. "Manages <lokasyon>" çipi ve çekmecedeki "Manages without working there" listesi "yalnız yönetir" ile birlikte kalktı (`bf52f5e1`, `59340aeb`).
- Çekmece başlığı (kullanıcı kararı 2026-09-30, EMP-001): sekme başlığının
  altında açıklama satırı yok; yeni sekme de eklemez.
- Profile alanları (kullanıcı kararı 2026-09-30, EMP-001): First, Middle, Last
  tek satırda (Middle dar); Preferred name ile Date of birth aynı satırda.
  Telefonda üç ad alt alta (kullanıcı, aynı gün; tek satırda "optional"
  etiketi kırılıp hizayı bozuyordu). Alanın altında yardım yazısı olmaz; yalnız
  doğrulama hatası alanın altında çıkar. Kilitli alanın nedeni ekrana
  yazılmaz; ekran okuyucuya ve fare ipucuna kalır. Salt okunur her alan aynı
  gri görünümdedir.
- E-mail durumu alanın içinde (kullanıcı kararı 2026-09-30, EMP-001 S5): bağlı
  hesapta yeşil onay ("Verified"), bekleyen davette saat ("Invitation
  pending"); davet bekliyorken e-mail ve adlar kilitli görünür. Bilerek:
  doğrulanmış e-mail de gri durur, çünkü hesap adresi çekmeceden değişmez.
  Yanlış davet adresi Access → "Revoke invitation" ile açılır.
- Jobs listesi departmana göre gruplu (EMP-001; BL-218 `.5`): departmanlar
  verilen sırada, sonra "No department", en altta Management; hiçbir iş bir
  departmanda değilse başlıksız düz liste.
- Access sekmesi (kullanıcı kararı 2026-09-30, EMP-001 A2; `a2ec3725`): "Account access" grup başlığının ve Workspace role seçicisinin altında açıklama yazısı yok. Owner'ın kilitli rolünün nedeni ("Owner access is managed separately.") yalnız ekran okuyucuya söylenir; başkasının kaydında seçici açıktır, neden yazılmaz. "Profile photo" grubunda da açıklama yazısı yok (koordinatör kararı KK-48, EMP-001 A3; `c79620f2`; kullanıcı düzeltebilir): hangi fotoğrafın gideceği ("Remove only the photo shown for this workspace.") yalnız "Remove photo" düğmesinin ekran okuyucu açıklaması ve fare ipucudur.
- Rol "Save changes" ile kaydedilir (kullanıcı kararı 2026-09-30, EMP-001 B4; `25fabe0a`): Access'te seçilen rol formda durur, hiçbir şey göndermez; "Save changes" önce kişi kaydını, sonra rolü gönderir. Yalnız rol değiştiyse kayıttan sonra Access'te kalınır. Kişi kaydı reddedilirse rol gönderilmez; rol düşerse seçim durur ve yeniden deneme yalnız rolü gönderir.
- Çekmece kapanırken sormaz (kullanıcı kararı 2026-09-30, EMP-001 K7; `25fabe0a`): var olan kişide de yeni kişi eklerken de "kaydedilmemiş değişiklik" uyarısı yok; Esc ve dışarı tıklama yazılanları atar, tarayıcı uyarısı yok. Neden: hızlı çıkış; uyarı "düzeltilecek eksik" sanılmasın. Tek tutma: yeni kişi isteği sunucudayken çıkış, cevap gelene kadar tutulur (çift kaydı önler; koordinatör kararı KK-47).
- Kişi bakanın kapsamından çıkınca çekmece kapanır (koordinatör kararı KK-46, EMP-001 B4; `25fabe0a`): lokasyondan çıkarma sonrası kayıt artık okunamıyorsa çekmece kapanır ve "Removed from <lokasyon>" bildirimi çıkar. Neden: "erişimin yok" kilidinde açık kalan çekmece hata gibi okunuyordu.
- "Terminate employee" kaydedilmemiş değişiklik varken kapalıdır (EMP-001 B4; `25fabe0a`): fare ipucu "Save your changes before terminating the employee" — "profile" demez, çünkü değişiklik rol de olabilir. Düğme gri ve kilit simgeli çizilir, imleç "yasak"; neden ekran okuyucuya bağlıdır — müdürün kilitli Terminate'iyle aynı görünüm (koordinatör kararı KK-61, EMP-001 C3; `04a97650`).
- Nedenle kilitlenen satır (koordinatör kararı KK-62, EMP-001 C3; `05c2625a`): Employment'ta bir nedenle kilitlenen kutucuğun adı da soluk yazılır (`--theme-muted-strong`; 5,55:1 — koordinatörün aktardığı ölçüm) ve satır `data-locked-reason` taşır; bugün Owner işi ve owner'ın lokasyonları. "Remove" düğmeli lokasyon satırı değişmez (yalnız `data-locked`). Ortak görünüm kuralı: nedenle kilitlenen satır = soluk ad + `data-locked-reason`; neden ekran okuyucuya ve fare ipucuna bağlı.
- Owner'ın kaydında Locations başlığında "Required" etiketi yok (koordinatör kararı KK-63, EMP-001 C3; `05c2625a`): bütün kutucuklar kilitli olduğu için; başka herkeste durur. Jobs başlığında owner için hâlâ yazıyor (BL-482).
- Listedeki iş adı (koordinatör kararı KK-56, EMP-001 C1; `362712f0`): kayıtlı birincil; yoksa Owner işi; yoksa ilk iş; hiç işi yoksa "Unassigned".
- Owner'ın kaydını sunucu söyler (koordinatör kararı KK-54, EMP-001 C1 + C2; BL-421): çekmece owner'ı rol adından değil okuma cevabındaki `is_workspace_owner`'dan tanır; rolün kilidi, Owner işinin ve lokasyonların kilidi buna bağlıdır.

### Schedule
- Şablon uygulanırken düşen ya da değişen veri için kullanıcı uyarılır; veri sessizce düşürülmez (kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001)).
- Vardiya tipinin varsayılan saatini taslaktaki vardiyalara uygulatan gizli özellik (BL-062) silinmez; görünür yapılır, test edilir, çalışır (kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001)).
- Kartta not yalnız ikonun üzerine gelince açılır; tıklama ya da sürükleme onu kapatır. Etkileşim fare odaklıdır, mobil hareket tasarlanmaz (kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001)).
- "Save as template" hem taslak ekranında hem Templates ekranında bulunur (kullanıcı kararı 2026-09 eski cevaplar, onay 2026-10-01 (KARAR-001)).
- "Job/Position" sıralaması (EMP-001 In scope madde 13, `tasks/EMP-001.md:78`; owner tek satır kuralı kullanıcı kararı K5; 2026-09-30, EMP-001 C2; `eb97ac27`): Management'ın iş grupları (Owner, Manager ve eklenenler) her zaman en altta; owner tek satır (iki grupta ayrı satır açmaz). BL-475'ten sonra da böyle kalır (kullanıcı kararı 2026-09-30, aşağıda Settings → Jobs).
- Silme ve üstüne yazma iki tık (UI-12): taslak/şablon silme, taslağın
  üstüne yazma, şablon penceresinde "Delete". Yayınlanmış taslağın satırında
  üstüne yazma düğmesi yok.
- Vardiya kartı (2026-09-26): gerçek ve hayalet kart aynı düzen; satır
  sırası tip-iş, label (düz metin, kutucuk yok), saat. Bütün hayaletler tek
  ölü gri, ince seyrek tarama, saydamlık yok (metin ≥5:1); hayaletin
  lokasyonu yalnız köşedeki iğnenin baloncuğunda. Gerçek kartta iğne yok.
  "All locations – Together" görünümünde gerçek kartta lokasyon satırı
  başlığın altında, ikonsuz kalır. Dışa aktarma lokasyonu yazıyla gösterir.
- Sağ üst pencereler "stil B" (2026-09-28): New Schedule ▾, Publish (Save
  draft menüsü), Published ▾, Publish penceresi ve Templates penceresi sade
  liste stilinde — 13px metin, gri ince çizgiler, tek yeşil aksiyon; satır
  araçları (Edit, Delete, Unpublish) yalnız hover ya da klavye odağında,
  dokunmatikte hep açık. ≤720px'te düğme satırı sarılır, kaydırılmaz
  (kaydırılan kutu menüleri kırpıyordu). Yeni bir sağ üst menü ya da yayın
  penceresi bu stilden kurulur. Export, Unpublish, Save draft penceresi ve
  onay pencereleri (UI-13) hâlâ eski ağır stilde; tutarlılık ayrı iş
  (BL-318).
- Müsaitlik bir tercih, engel değil (2026-09-26, BL-186; "Ürün kuralları →
  Müsaitlik"): hücrede taralı alan ve uyarı, onay yayınlayandan, ayar yok.
  Yayınlanmış vardiyanın uyarısı yayın anındaki kayıttan gelir; sonradan
  girilen işaret yayınlanmış işi geriye dönük uyarıya çevirmez.
- Başka yöneticinin taslak adıyla kaydedince "Overwrite "<ad>"?" sorulur.
- Düzenleme kilidi yalnız taslakta; başkası düzenliyorsa "Draft is being
  edited" kimin düzenlediğini söyler. Taslak başladıktan sonra yayını değişen
  lokasyon Publish penceresinde uyarı satırı alır; engel değil.
- Telefonda Export yok (kullanıcı kararı 2026-09-16): ≤720px'te Export
  düğmesi gizli (`schedule/export-v2/export-v2.css:60`); dışa aktarma
  masaüstünden yapılır. Karar o gün ≤760px için verildi, eşik UI-14 ile
  720'ye indi.
- Settings menüsünde "Hide/Show Unassigned Shifts Row" ve "Freeze/Unfreeze
  Unassigned Shifts Row" yalnız düzenleme kipinde açık (2026-09-29, kullanıcı
  kararı); view kipinde "Role Seperators" gibi soluk ve tıklanamaz. Diğer
  görünüm ayarları iki kipte de açık.
- "Bugün" hangi saat dilimiyle (kullanıcı kararı 2026-09-30, G14 S1): tek
  lokasyonun sütunu o lokasyonun saat dilimini kullanır; sayfanın genel
  "bugün"ü, mini takvim ve Settings → Important dates cihazın takvimini
  kullanır; hiçbiri UTC'yi kullanmaz. Tek yardımcı `apps/web/src/lib/today.ts`
  `todayIn`; lokasyon sütunu `ScheduleLocationHeader.tsx`'te. Neden: New
  York'taki müdür Los Angeles sütununda doğru günü işaretli görür, açılış
  haftası değişmez. Kalan dört yer G14 dilim a ile bu yardımcıya bağlandı
  (BL-353, `af43afc1`, 2026-09-30). Bilinen sonuç: gün dönümünde rozet lokasyonun gününde, sütunun yeşil tonu cihazın gününde kalır (BL-448).
- Kayıt kurtarma penceresi (kullanıcı kararı 2026-09-30, BL-440; main'de `5be1db7d`): "Schedule
  save failed" penceresindeki "Discard" yıkıcıdır — iki tık kırmızı, ikinci
  tıkta "Confirm discard". UI-09'un "Discard beyaz vazgeçme düğmesidir"
  sınıfı burada geçmez: bu düğme kaydedilmemiş bütün değişiklikleri atar.
  Ekranın öteki "Discard"ı (düzenleme modundan çıkış) onay penceresiyle
  sorar ve beyaz kalır.
- Escape, pencereler ve silahlı iki tık düğme (kural G1'den, `70784947`; G14 dilim a `715198b9`, 2026-09-30, BL-372): Schedule pencereleri Escape'i ortak `useCloseOnEscape` kancasıyla kapatır. Odak silahlı (ikinci tıkı bekleyen) iki tık düğmesindeyse Escape önce düğmeyi indirir, pencere açık kalır. 2026-09-30'dan beri üst çubuk menüleri ve kayıt kurtarma penceresi de bu kancayı kullanır; BL-372'nin saydığı iki ayrı kopya kalktı. Yeni Schedule penceresi kendi Escape işleyicisini yazmaz.
- Basılamayan Publish (G14 dilim b, BL-308, `2877a066`): düğme soluk ve `not-allowed` imleçli, ama odak alır ve nedenini söyler (ipucu balonu + erişilebilir açıklama). İki cümle: taslak yokken "Save a named draft before publishing this week."; kayıtlı taslak açılmamışken "Open a saved draft from New Schedule before publishing this week."
- Hafta okunamadığında (BL-392, `97e16f48`): hata kutusunun üstünde hafta gezinmesi kalır (önceki, sonraki, ortada "bu haftaya dön"); üst çubuğun geri kalanı çizilmez. "No access" kartı tek başına durur. Bilinen ayrıntılar: BL-449, BL-451, BL-457.
- Kapatma X'i dört pencerede 18px (BL-305, `c0cc6313`): Unpublish, Save draft, Publish, Templates.
- Açık ipucu balonu Escape'i kendine alır (`2df0cb3e`): Escape balonu kapatır, sayfanın kendi Escape kuralına (bu haftaya dönüş, süzgeç temizleme) ulaşmaz. Sınır: capture aşamasında dinleyen pencere kancası (`useCloseOnEscape`) balondan önce çalışır.
- "Pencere" tek seçiciyle tanınır (`7e19a76b`): `dialog, [role='dialog'], [role='alertdialog']` (`apps/web/src/schedule/lib/scheduleInteractionTargets.ts`; yerel `<dialog>` dahil). Pencerenin içindeki basış sayfanın "boş yere basıldı" kuralını tetiklemez. Pencerenin arkasındaki karartılmış alana basış bu kuralın dışında (BL-458).

### Schedule → Requests
- İzin verisi iki sekmede de yüklenir ("Time off" sekmesindeki sayı kaybolmasın diye); ama bekleyen ve kapanmış izin
  talebini yalnız ona karar verebilenler ve sahibi görür (kullanıcı kararı 2026-10-01, FB-6.3.8c; "İzin" bölümü).
- "Shift changes" sekmesinde sayı rozeti yok; Shift Hub sayıyı kendi
  başlığında söyler. İnceleme çekmecesindeki "Select a request" yer tutucusu
  hiç görünmez.

- **Requests → Time off → talep → ilerleme paneli: "a — kontrol listesi" (kullanıcı kararı 2026-10-01 ~16:45Z, gerçek ekran görüntüleriyle; kaynak: kullanıcı, besleme #72).** Örnek: Ali Kadıköy ve Beşiktaş'ta; panelde lokasyonlar alt alta liste, Kadıköy "Approved by Ayşe", Beşiktaş bekliyor. Reddedilen: b (lokasyon kartları), c (çubuk + tablo). Seçilmeyen iki varyantın silinmesi ve ince ayar `tasks/FB-6.3.md` `.6c`'de.

### Settings
- Jobs: departmanlar ve her departmanın altındaki işler ada göre A→Z;
  Management departmanı ayrıcalıksız, ötekilerle A→Z. Elle sıralama
  ("Move up / Move down") ne işlerde ne departmanlarda var. İşlerin ve
  departmanların sırasını okuyan Schedule departman süzgeci ve öteki
  seçiciler de A→Z. Örnek: "Bar, Kitchen, Management, Service". İki çalışma
  ekranında Management en sonda kalır: Employees → çekmece → Employment →
  Jobs seçicisi ve Schedule → "Job/Position" gruplaması (kullanıcı kararları
  2026-09-30, BL-475: önce yalnız işler, aynı gün departmanlara genişledi,
  sonra iki ekranın istisnası; main'de `1a608c01`, canlıda `20261003010000`).
- Locations: lokasyon silme iki tık, panel yok. Jobs, Shift types ve Shift
  labels'ta silme etki listesi paneli açar; o panel bilerek kalıyor.
- Roles: "Delete role" `ConfirmButton` değil, kendi iki tık kopyası
  (bağımlılık uyarısı silahlı kalıyor; UI-12'deki "tek eski kopya").
- Notifications: bildirim platformu ayrı bir proje olarak baştan
  tasarlanacak; bu sayfa o zamana kadar olduğu gibi kalır.
- Conflict handling: müsaitlik burada yok (BL-186). Approved time off yalnız
  Require confirmation / Block; FOUNDATION-B Aşama 6'da yalnız Block kalacak.
  Ekrandaki "Warn / Require confirmation / Block", kullanıcı kararlarındaki
  "Uyar / Yumuşak / Sert"e karşılık gelir.
- Scheduling: müsaitlik giriş modu değişince (AVAIL-001, 2026-09-22) her
  kayıtlı hafta yeni moda çevrilir (DATA-05), eski hali geçmişe yazılır,
  haftası çevrilen çalışana "Check your availability" bildirimi gider.
  `?checklist=setup` ile açılınca hafta başı ve saat biçimi boş gelir,
  ikisi seçilmeden kaydedilemez.
- Documents: yayımlanmış belge tanımı salt okunur (kullanıcının onayladığı davranış; U44, G18 tazeliği 2026-09-30): veritabanı yayımlanmış tanımın düzenlenmesini reddeder (`guard_document_definition_edit`), çekmece bu yüzden salt okunur açılır. "Published" sütunundaki "-" taslak belgede de görünür; ölü dal değildir.
