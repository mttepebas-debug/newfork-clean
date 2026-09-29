# Reuse haritası

Yeni UI ya da akış yazmadan önce buradaki girdiye bak. Ölçü ve CSS değerlerini buraya kopyalama; kaynak dosyayı aç. `(rescue)` işaretli kaynaklar RESCUE-001 tamamlanana kadar yalnızca `wip/rescue-2026-09-16` branch'inde bulunur.

| ID | Ne zaman | Kaynak | Sınır |
|---|---|---|---|
| UI-01 | Liste sayfası header ve toolbar (status, filter, search) | `apps/web/src/views/CatalogPageHeader.tsx`, `styles.css` içinde `.catalog-page-header`, `.catalog-toolbar*` | Status üst satırda, filter ve search alt satırda. Sayfaya özel margin varyantı yok. |
| UI-02 | Tablo kolon sıralama | `apps/web/src/views/CatalogSortButton.tsx` | İkon yalnızca hover veya focus halinde görünür. Sıralama mantığı bileşeni kullanan sayfadadır. |
| UI-03 | Settings sayfa header'ı ve sağ üst CTA | `settings/GeneralSettingsPage.tsx` içinde `SettingsHeader`, `.settings-page` altındaki `--settings-header-*` token'ları | Sayfa CSS'inde header ya da action için offset/align override yazma. |
| UI-04 | Account layout ve header | `account/AccountLayout.tsx`, `account/components.tsx` içinde `AccountPageHeader` | Her sayfaya ayrı offset ekleme. |
| UI-05 | Tema: yalnızca light; renkler `--theme-*` token'larından | `styles.css` `:root` (THEME-002): page, surface(-soft/-muted), text(-body), muted, border(-subtle/-strong), accent(-strong), selected, focus, action(-hover), danger/warning/success(-soft), current. `--schedule-*` bunlara alias. `src/light-theme.test.ts` dark kuralını engeller. | Sabit hex yerine token kullan. Öneksiz `--surface/--border/--text` tanımlama (mevcut fallback'leri değiştirir). Dark kuralı yazma. Açık zeminde metin AA ≥4.5; ikincil metin için `--theme-muted`, renkli zeminde `--theme-muted-strong`. Accent/action/koyu zemin üstündeki beyaz metin için `--theme-on-accent`; uyarı metni için `--theme-warning`. **`--theme-border` (kutu kenarı) ile `--theme-border-subtle` (liste içi ayırıcı) ayrı basamaktır;** ayırıcı bilinçli olarak bir ton açık, birleştirilmez (kullanıcı kararı 2026-09-28, BL-216). BL-216'da silinen ikiz token'lar (`text-tertiary`, `text-soft`, `surface-group`, `surface-hover`, `divider`, `divider-soft`) yeniden tanımlanmaz. |
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
| OPS-01 | CI'ı çalıştırmak, değiştirmek ya da e2e'den veritabanına bağlanmak | `.github/workflows/ci.yml` (`runs-on: &runner [self-hosted, linux, newfork-local]`), `scripts/ci-supabase-apart.sh`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`; runner'lar `newfork-local-pc`, `-pc-2`, `-pc-3` (WSL Ubuntu-24.04, kullanıcı `runner`, `~/actions-runner`, `~/actions-runner-2`, `~/actions-runner-3`, systemd, `Nice=10`) | CI kullanıcının PC'sinde; üç runner check, db ve e2e'yi aynı anda koşar (~4 dk). Yalıtım runner adından gelir: Supabase projesi `newfork-ci-pc1/2/3`, portlar 590xx/591xx/592xx, CI e2e web/api 5590/5591, 5600/5601, 5610/5611 (yerel e2e 5565/5566). Yeni runner eklenirse apart betiği adını (`-pc-N`) tanımalı, tanımazsa iş düşer. Ek runner'ların HOME'u ayrıdır (`~/ci-home-N`), çünkü pnpm kurulumu HOME'a yazar. Windows'un ayırdığı port aralıkları açılışta kayabilir: apart betiği `netsh` ile önceden kontrol eder; blok ayrılmış aralığa düşerse betikteki `589 + index` sayısını değiştir. e2e'de konteyner adı config.toml `project_id`'den alınır, `supabase_db_newfork-clean` sabit yazılmaz. `e1e9512`'den önce açılmış bir dal push edilmeden önce rebase edilir. GitHub Actions harcama limiti $0; `ubuntu-latest`'e dönmek için apart betiği de değişmeli. Ubuntu'yu tek başına `wsl --terminate`/`--shutdown` etme: Docker Desktop bağlantısı kopar, ortak yığın düşer. Başlat/durdur/durum: `cd ~/actions-runner[-N] && sudo ./svc.sh start\|stop\|status`. Kaldırma adımları BACKLOG BL-107'de; ek runner'larda `~/actions-runner-N/.env` ve `~/ci-home-N` de silinir. |
| OPS-02 | Bir şeyin ölü olduğunu göstermek (silmeden önce) | FOUNDATION-B 5.5 kaydı (`docs/plan/tasks/FOUNDATION-B.md`); korunma `supabase/tests/retired_objects_stay_gone.test.sql` | Veritabanı fonksiyonu: `pg_proc` gövdeleri, tetikleyiciler, politikalar, görünümler, varsayılanlar, kısıtlar, indeksler ve `cron.job` metinleri ile `apps`, `packages`, `e2e`, `scripts` kodundaki tanımlayıcılar (identifier) toplanır; adı bunların hiçbirinde (kendi gövdesi hariç) geçmeyen fonksiyon ölüdür, yalnız ölülerin çağırdığı da ölüdür (tekrar tekrar ayıkla). Test dosyasında geçmek canlı saymaz: o testin parçası silinen fonksiyonla birlikte gider ya da canlı yola çevrilir. Silmeyi önce geri alınan tek işlemde dene (`drop function` bağımlılık varsa düşer, `cascade` kullanma). CSS sınıfı: adı web/UI kodunda tanımlayıcı olarak geçmiyor ve kod onu sabit bir önekten (`foo-${x}`, `"foo-" + x`) kurmuyorsa ölüdür; `-w` grep `form-actions`'ı `account-form-actions` içinde bulur, tanımlayıcı olarak ara. Silinen her nesne aynı commit'te `retired_objects_stay_gone`'a yazılır. |
| OPS-03 | Paylaşılan şemaya zorunlu alan ekleyen ya da DB okumasının şeklini değiştiren bir işi main'e almak (Vercel main'i yayına alır) | Kullanıcı kararı 2026-09-28 (BL-218.3 `/code-review max` bulgusu: `system_key` zorunlu olunca canlıda migration yoksa Schedule, Employee Hub → Schedule ve Employees çekmecesi 500 verir) | Birleştirme penceresinde önce canlı gönderim: kullanıcı PC başında yedek (`db dump --linked`, şema + veri) → `db push --dry-run` → `db push` yapar; koordinatör MCP ile `list_migrations` ve `get_advisors` (security) bakar; ancak sonra main'e push. Eski kod fazla alanı yok sayar, bu yüzden migration önce gitmek güvenlidir; tersi değil. Hosted push'u ajan yapmaz (proje `.claude/settings.json` yasaklar). |

## Ürün kuralları — rol, kapsam, uygunluk

Kullanıcı kararları, 2026-09-23 (FOUNDATION-B Aşama 0). Her kural yetki matrisinin `expected()` fonksiyonunda (`supabase/tests/authorization_matrix.test.sql`) ya da uygunluk matrisinde (`supabase/tests/eligibility_matrix.test.sql`) bir satıra karşılık gelir; kural değişirse önce burası, sonra o satır değişir. Uygulandığı yer yetki çekirdeği `app_private.authorize()` / `scope_set()` (FOUNDATION-B Aşama 4) ve uygunluk motoru `app_private.eligibility()` (Aşama 6).

**Roller ve kapsam**
- Hiyerarşi owner > admin > manager > employee. Owner, admin ve manager yönetim arayüzüne girer; herkesin (kendi çalışan kaydı olan owner/admin/manager dahil) çalışan arayüzü vardır — yönetim arayüzünde "Çalışan görünümüne geç".
- Owner'a özel: billing, sahiplik devri, workspace kapatma, admin atama/kaldırma. Admin: bütün lokasyonlar ve çalışanlar (kendi lokasyon atamasından bağımsız), Settings'in geri kalanı okuma+yazma, Settings→Roles'u düzenler ama kendi izninden fazlasını veremez.
- **Kapsam modeli M2 "kişi ortak, vardiya yerel":** manager kendi lokasyonlarında çalışan herkesi bütün olarak görür (profil, müsaitlik, izin, belgeler); başka lokasyonda çalışmayanı görmez. Vardiya işlemleri (yazma, yayın, devir onayı, dışa aktarma) yalnız vardiyanın lokasyonunda. Başka lokasyonu etkileyen karar o lokasyonun onayını ya da admin/owner'ı ister.
- Manager'ın lokasyonları = çalıştığı atamalar + admin'in eklediği "yalnız yönetir" lokasyonları (vardiyaya girmeyen şube müdürü için). Başka lokasyonda ara sıra çalışmak orayı yönetmek demek değildir (admin ayırır).
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
- **"Yalnız yönetir" lokasyonu (kullanıcı kararları 2026-09-27, FB-6.2 S2/S3):** o lokasyonun Employees listesinde "Manages" etiketiyle görünür, Takvim ızgarasında satırı yoktur, vardiyaya yazılamaz. Kişinin rolü manager'dan employee'ye düşerse "yalnız yönetir" lokasyonları aynı işlemde kalkar ve denetim kaydına yazılır; çalıştığı atamalar kalır.
- **Owner'ın çalışan kaydı (kullanıcı kararları 2026-09-27, FB-6.2 S4 + Management/Owner D1–D5):** owner bütün lokasyonlarda, ataması olmasa da çalışabilir; sonradan eklenen lokasyon owner'a otomatik atanır. İşlerde ise owner **yalnız atandığı işlerde** çalışır: sonradan eklenen iş otomatik atanmaz, çekmeceden atanır. Kaydederken birincil lokasyon ve birincil iş zorunlu değildir. Owner yalnız Management → Owner işine otomatik atanır; kurulumda ya da sonradan eklenen diğer işlere çekmeceden atanır. Lokasyonlar (kurulumda ya da sonradan) owner'a otomatik atanır, çekmecede işaretli görünür ve kaldırılamaz. **Exclude from schedule:** işaretli kişi yeni açılan taslakta görünmez; yayınlanmış vardiyaları düşmez — yayınlanmış program düzenlense, yayından kaldırılıp aynı program yeniden yayınlansa da kişi ve vardiyaları kalır. A–Z sıralamada adının baş harfine göre yer alır.
- **Management departmanı ve Owner işi (kullanıcı kararları 2026-09-27, D1–D5):** kurulumda otomatik oluşan korunan sistem kayıtlarıdır: silinmez, arşivlenmez, adı değiştirilebilir; kurulumdaki "en az 1 departman ve 1 iş" kuralına sayılmaz. "Owner" işi yalnız owner'a atanır, sahiplik devrinde yeni owner'a geçer. Management'a başka işler eklenebilir ("Manager", "Assistant Manager"). Management işleri kişi için her zaman birincildir (çekmecede seçeneği yok); kişiye başka işler de atanabilir, biri ayrıca birincil seçilebilir. **Yalnız Management işi olan kişi (kullanıcı kararı 2026-09-28, BL-218 `.3b`):** owner olmayan ve yalnız Management işleri olan kişi birincil iş olmadan kaydedilir; en az 1 lokasyon her zaman zorunludur. "Remote" ya da "Exclude from schedule" işaretli kişinin lokasyon ve iş muafiyeti aynen kalır; lokasyon kuralı yalnız ikisi kapalıyken uygulanır (kullanıcı kararı 2026-09-28). Takvim: "By department" sıralaması eklenir; "By department" ve "Job/Position" sıralamalarında Management en altta ayrı gruptur; Management işi olan kişi orada, başka birincil işi varsa onun grubunda da görünür; iki satır eştir (vardiya ve ghost hücreler ikisinde de). **Owner'ın iş listesindeki yeri (kullanıcı kararı 2026-09-28, BL-218 `.5`):** Employees çekmecesinin iş listesi departmanlara göre gruplanır (Schedule "By department" ile aynı düzen); Owner, Management departmanının içinde görünür ama devre dışıdır: işaretlenemez, kaldırılamaz. Management'a eklenen başka işler (ör. "Manager") de Management altında listelenir ve seçilebilir. Görsel ayrıntı (kilit simgesi, gri ton, yardım metni) DEV varyantlarıyla kullanıcıya gösterilir. Ayrıntı ve açık uygulama notları: `docs/plan/research/owner-management-job-2026-09-27.md` §6–7.
- Manager Settings'te katalogu salt okunur görür (job, departman, vardiya tipi/etiketi, çakışma ve takas kuralları, belge tanımları); Locations'ta yalnız kendi lokasyonları; Roles, sahiplik, billing, hesap görünmez. Manager tipi rollere organizasyon ayarı yazma izni verilemez. Duyuru ve önemli tarih yazmak kendi lokasyonları için serbest.
- **Settings, manager (kullanıcı kararları 2026-09-28, K14):** S1 varsayılan manager rolü katalog okuma izinlerini taşır (Ayşe Settings'te katalogu görür, değiştiremez). S2 manager tipi role `roles.*` izni verilemez (Roles'ta bu kutu manager rollerinde yok). S3 Acknowledgements tanımları katalogun parçası, manager salt okunur görür. S4 Important dates: manager workspace geneli tarihleri ve kendi lokasyonlarınınkileri görür; başka lokasyonun kaydı ve adı görünmez (M2).
- Kısıtlı kişi (eksik zorunlu belge ya da tamamlanmamış onboarding) yalnız kendi eksiğini tamamlar: belge yükleme, onboarding adımları, kendi profili, bildirimleri, çıkış. Program, talep ve yönetim işleri kapalı.

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
- **B4 — Boş yeni taslakta "yayınlanmışları ghost göster" anahtarı.** Kadıköy'ün o hafta yayınlanmış planı varken Beşiktaş için yeni boş taslak açılırsa ızgarada bir aç/kapa anahtarı olur; açıkken yayınlanmış vardiyalar ghost görünür, kullanıcı düzenlemeden çıkmadan açıp kapatır. Bu mod (yayınlanmış plan önizlemesi) **çakışma üretmez**: uyarı ve engel hesaplamasına girmez. Canlı başka lokasyon vardiyası modundan (B1, yukarıdaki ghost satırı: çakışma uyarısı verir) ayrıdır. Uygulama: FB-6.1b.
- Dışa aktarma sorusu (FB-6.1 2a/Q3) bu bölümle değil M2 ile kapalıdır: dışa aktarılan lokasyonlar ⊆ `scope_set(actor, w, 'schedule.export')`, değilse `authz.out_of_scope`.
- **Q-A — Zamanlanmış dışa aktarma kayıtlarını kim görür (kullanıcı kararı, 2026-09-25).** Kaydın (`scheduled_schedule_exports.location_ids`) bütün lokasyonları manager'ın kapsamındaysa görür; değilse görmez (alıcı e-postaları dahil). Admin'in Kadıköy + Beşiktaş gönderimini yalnız Kadıköy müdürü Ayşe görmez. Son dışa aktarmalar listesi de aynı kural. ~~Kaydın bir lokasyonu sonradan silindiyse kayıt manager'a görünmez, yalnız admin/owner'a (2026-09-25 kararı)~~ — **yerine geçti 2026-09-26** (Q-C: silinmiş lokasyon sayılmaz). Lokasyon dizisi boş ya da bilinmeyen kayıt da manager'a görünmez. Düzenleme/silme zaten yalnız kişinin kendi kaydında. Uygulama: FB-6.1 `.2`.
- **Q-B — Lokasyonu sonradan silinmiş taslak ya da şablon (kullanıcı kararı, 2026-09-25).** Silinmiş lokasyon B3/K-2 hesabından düşülür; kalan lokasyonların hepsi manager'ın kapsamındaysa manager siler/yeniden adlandırır, değilse admin/owner. Örnek: Kadıköy + Beşiktaş taslağında Beşiktaş kapatıldıysa Ayşe (Kadıköy) taslağı silebilir. Uygulama: FB-6.1 `.2` / `.4`.
- **Q-C — Silinmiş lokasyon şablon ve zamanlanmış dışa aktarma yetkisinde hiçbir kuralda sayılmaz (kullanıcı kararı, 2026-09-26).** Q-B'yi okuma, listeleme ve uygulamaya genişletir; Q-A'nın silinmiş lokasyon hükmünün yerine geçer. Örnek: "Standard week" şablonu Kadıköy + Beşiktaş; Beşiktaş varken Kadıköy müdürü Ayşe şablonu görmez (bugünkü gibi); Beşiktaş silinince Ayşe şablonu görür, adını değiştirir, uygular, siler. Zamanlanmış dışa aktarma kaydı aynı: silinmiş lokasyonlar düşülür, kalanların hepsi kapsamdaysa manager görür. Uygulamada ayrı bir "kapalı lokasyon" durumu yok; kapatma = silme (`locations.deleted_at`). Kural her işlemde aynı tek yerden uygulanır. Uygulama: BL-188.

**İzin (time off)**
- İzin kişiye aittir; talep formunda lokasyon seçilmez.
- Onay: o gün yayınlı vardiyası olan her lokasyonun manager'ı oy verir (hepsi onaylayınca kesinleşir, biri reddederse red). Hiç yayınlı vardiya yoksa (yayınlanmamış hafta ya da boş gün) birincil lokasyonun (`employee_location_assignments.is_primary`) manager'ı karar verir. Admin/owner her durumda tek başına karar verebilir; birincil lokasyonun manager'ı yoksa talep onlara düşer. Oy verenler karar anında hesaplanır.
- **Oylamanın ayrıntısı (kullanıcı kararları 2026-09-27, FB-6.3 S1–S3):** çok günlü talepte oy talebin bütünü içindir — bütün günlerin oy verenleri onaylayınca kesinleşir, biri reddederse bütün talep reddedilir (admin/owner gün gün karar verebilir). Bir lokasyonda birden çok müdür varsa lokasyonun oyunu herhangi biri verir. Talepte lokasyon yoktur; izin saatleri kişinin birincil lokasyonunun saat dilimiyle (lokasyonsuz kişide cihazınki) talep anında sabitlenir. Onaylı iznin iptalini kimin onaylayacağı açık (TBD).
- Onaylanan izin bütün lokasyonlarda kesin engeldir (manager bunun üstüne vardiya yazamaz; ayarı yoktur). Diğer manager'lara bildirim gider, taslaklarda çakışma görünür.

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

## Sayfa envanteri

Repodaki her ekranın kendi bölümü olacak: ne yaptığı, hangi ortak parçaları
kullandığı, kendine özgü kuralları, bilinen tuhaflıkları. Hepsi bir oturuşta
yazılmıyor — **bir task hangi sayfaya dokunuyorsa o sayfanın bölümü o task
içinde yazılır ya da güncellenir.**

Aşağıdaki tablo iskelettir. `belgelenmedi` yazan satırın henüz bölümü yok.
Rota sütunu boş olanlar iç içe rota tablolarından geliyor; o sayfa sırası
gelince çözülür.

| Alan | Sayfa | Rota | Dosya (`apps/web/src/`) | Durum |
|---|---|---|---|---|
| hesap | AccountDocumentsPage | `documents` | `account/AccountDocumentsPage.tsx` | belgelenmedi |
| hesap | AccountRecoveryPage | `/account-recovery` | `account/AccountRecoveryPage.tsx` | belgelenmedi |
| hesap | NotificationPreferencesPage | `preferences/notifications` | `account/NotificationPreferencesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | PreferencesPage | `preferences` | `account/PreferencesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | ProfilePage | `profile` | `account/ProfilePage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | SecurityPage | `security` | `account/SecurityPage.tsx` | kısmi 2026-09-22 (butonlar) |
| hesap | WorkspacesPage | `workspaces` | `account/WorkspacesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| kabuk | WorkspaceHubPage | | `shell/WorkspaceHubPage.tsx` | belgelenmedi |
| kabuk | WorkspaceStatusPage | `/workspaces/status/:workspaceId` | `shell/WorkspaceStatusPage.tsx` | belgelenmedi |
| giris | SignInPage | `/sign-in` | `views/SignInPage.tsx` | belgelendi 2026-09-26 |
| giris | ForgotPasswordPage | `/forgot-password` | `views/ForgotPasswordPage.tsx` | belgelendi 2026-09-26 (BL-137; görsel cila bekliyor) |
| giris | ResetPasswordPage | `/reset-password` | `views/ResetPasswordPage.tsx` | belgelendi 2026-09-26 (BL-137; görsel cila bekliyor) |
| giris | AcceptInvitationPage | `/accept-invite`, `/invite/accept` | `employees/AcceptInvitationPage.tsx` | belgelenmedi |
| kamuya acik | PrivacyPage / TermsPage / ContactPage / AccessibilityPage / PrivacyChoicesPage | `/privacy`, `/terms`, `/contact`, `/accessibility`, `/your-privacy-choices` | `public/PublicTrustPages.tsx` | belgelenmedi |
| kurulum | OwnerOnboardingPage | `/welcome/:workspaceId/*` | `views/OwnerOnboardingPage.tsx` | belgelenmedi |
| kurulum | EmployeeOnboardingPage | `/onboarding` | `employees/EmployeeOnboardingPage.tsx` | belgelenmedi |
| calisanlar | EmployeesPage | `employees` | `employees/EmployeesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| calisanlar | EmployeeHubPage | `employee-hub/*` | `views/EmployeeHubPage.tsx` | belgelendi 2026-09-24 |
| calisanlar | EmployeeDocumentsPage | `employees/documents` | `documents/EmployeeDocumentsPage.tsx` | belgelenmedi |
| plan | SchedulePage | `schedule` | `views/SchedulePage.tsx` | kısmi 2026-09-24 (butonlar, müsaitlik) |
| plan | ScheduleRequestsPage | `schedule/requests` | `views/ScheduleRequestsPage.tsx` | belgelendi 2026-09-24 |
| plan | ScheduleTemplatesPage | `schedule/templates` | `views/ScheduleTemplatesPage.tsx` | kısmi 2026-09-22 (butonlar) |
| plan | AvailabilityPage | `availability` | `views/AvailabilityPage.tsx` | belgelenmedi |
| isyeri | WorkspacePage | `workspace` | `views/WorkspacePage.tsx` | belgelenmedi |
| iletisim | AnnouncementsPage | `announcements` | `views/AnnouncementsPage.tsx` | kısmi 2026-09-22 (butonlar) |
| iletisim | NotificationsPage | `inbox`, `notifications` | `views/NotificationsPage.tsx` | belgelenmedi |
| ayarlar | GeneralSettingsPage | `general` | `settings/GeneralSettingsPage.tsx` | belgelenmedi |
| ayarlar | LocationsSettingsPage | `locations` | `settings/LocationsSettingsPage.tsx` | kısmi 2026-09-22 (butonlar) |
| ayarlar | JobsSettingsPage | `jobs` | `settings/JobsSettingsPage.tsx` | belgelenmedi |
| ayarlar | RolesSettingsPage | `roles`, `roles/:roleId` | `settings/RolesSettingsPage.tsx` | belgelendi 2026-09-24 |
| ayarlar | SchedulingSettingsPage | `scheduling` | `settings/SchedulingSettingsPage.tsx` | belgelendi 2026-09-22 |
| ayarlar | ShiftTypesSettingsPage | `scheduling/shift-types` | `settings/ShiftTypesSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftLabelsSettingsPage | `scheduling/shift-labels` | `settings/ShiftLabelsSettingsPage.tsx` | belgelenmedi |
| ayarlar | ShiftCatalogSettingsPage | | `settings/ShiftCatalogSettingsPage.tsx` | belgelenmedi |
| ayarlar | ConflictHandlingSettingsPage | `scheduling/conflicts` | `settings/ConflictHandlingSettingsPage.tsx` | belgelendi 2026-09-24 |
| ayarlar | ImportantDatesSettingsPage | `important-dates` | `settings/ImportantDatesSettingsPage.tsx` | belgelenmedi |
| ayarlar | DocumentsSettingsPage | `documents` | `settings/DocumentsSettingsPage.tsx` | belgelenmedi |
| ayarlar | SignatureTemplatesSettingsPage | | `settings/SignatureTemplatesSettingsPage.tsx` | belgelenmedi |
| ayarlar | NotificationSettingsPage | `notifications` | `settings/NotificationSettingsPage.tsx` | belgelendi 2026-09-24 |
| ayarlar | SupportSettingsPage | `support` | `settings/SupportSettingsPage.tsx` | kısmi 2026-09-22 (butonlar) |
| gelistirme | ScheduleShiftDesignPage | `/dev/schedule-shift-design` | `dev/ScheduleShiftDesignPage.tsx` | belgelenmedi |
| gelistirme | ScheduleShiftBadgeLabPage | `schedule-badge-lab` | `dev/ScheduleShiftBadgeLabPage.tsx` | belgelenmedi |

Bir sayfanın bölümü yazılırken başlık `### <Sayfa adı>` olur, tablodaki
durumu `belgelendi <tarih>` yapılır, ve bölüm şunları söyler: sayfa ne işe
yarar, yukarıdaki reuse girdilerinden hangilerini kullanır, kendine özgü
kuralları neler, bilinen tuhaflıkları var mı.

### SignInPage

**Ne işe yarar.** `/sign-in`: içeri girme, yeni hesap ya da yeni workspace
açma, davetle katılan biri için çalışan hesabı açma
(`apps/web/src/views/SignInPage.tsx:1`).

**Kullandığı ortak parçalar.** `PreBizFrame` (`shell/prebiz/PreBiz.tsx`) çerçeve
ve başlık; `.sign-in-form` ve `.onboarding-field` alan düzeni; `.pb-btn` /
`.pb-btn-primary` / `.pb-btn-secondary` / `.pb-btn-block` düğmeler
(`SignInPage.tsx:74-136`).

**Kendine özgü kurallar.**
- Giriş modunda parola alanının altında "Forgot password?" bağlantısı
  `/forgot-password`'a gider; yalnız hesap oluşturma modunda gizli
  (`SignInPage.tsx:103-105`).
- İkinci düğme (giriş/hesap oluşturma arasında geçiş) hiçbir zaman yeşil
  değil — ekrandan çıkışın ikinci yolu olduğu için beyaz (`SignInPage.tsx:124-135`).
- `?from=` hedefi yalnız aynı origin'e ve `/` ile başlayan bir yola izin
  verir; başka bir şey `/app`'e döner (`safeSignInDestination`,
  `SignInPage.tsx:149-159`).

**Bilinen tuhaflıklar.** Yok.

### ForgotPasswordPage

**Ne işe yarar.** `/forgot-password`: parolasını unutan kişi e-postasını
yazar, bir sıfırlama bağlantısı ister (BL-137,
`apps/web/src/views/ForgotPasswordPage.tsx:1`).

**Kullandığı ortak parçalar.** `PreBizFrame`, `.sign-in-form`,
`.onboarding-field`, `.pb-btn pb-btn-primary pb-btn-block`
(`ForgotPasswordPage.tsx:33-73`); API `requestPasswordReset`
(`apps/web/src/lib/supabase.ts:626`).

**Kendine özgü kurallar.**
- Ekran hesap var olsun olmasın aynı metni gösterir: "If an account exists
  for this email, we sent a reset link." — bir e-postanın Newfork'ta kayıtlı
  olup olmadığı dışarıdan anlaşılmaz (`ForgotPasswordPage.tsx:44`).
- Sunucu tarafında her cevap sabit 1,5 saniyede çıkar
  (`defaultResponseFloorMs`, `apps/api/src/account/password-reset.ts:26,93`);
  gönderim en çok 1,2 saniye beklenir (`defaultSendBudgetMs`, aynı dosya
  satır 27), böylece hesabın var olup olmadığı yanıt süresinden de
  anlaşılmaz.
- Hız sınırı e-posta başına saatte 3, IP adresi başına saatte 10 istek
  (`password-reset.ts:21-22`); aşılırsa 429 + `retry-after: 3600`
  (`password-reset.ts:72-76`).

**Bilinen tuhaflıklar.** BL-162: hız sınırı sunucu örneğinin belleğinde
tutuluyor (Vercel'de örnek başına sayaç); kalıcı DB sayacı bekliyor.

### ResetPasswordPage

**Ne işe yarar.** `/reset-password`: e-postadaki bağlantıyla gelen kişi yeni
parolasını belirler ve içeri girer (BL-137,
`apps/web/src/views/ResetPasswordPage.tsx:1`).

**Kullandığı ortak parçalar.** `PreBizFrame`, `.sign-in-form`,
`.onboarding-field`, `.pb-btn pb-btn-primary pb-btn-block`
(`ResetPasswordPage.tsx:76-125`); API `openPasswordResetSession` /
`saveNewPassword` / `abandonPasswordResetSession`
(`apps/web/src/lib/supabase.ts:639,651,659`).

**Kendine özgü kurallar.**
- Belirteç bağlantının `#token_hash=` parçasında (fragment) taşınır — bu bir
  tarayıcının sunucuya hiç göndermediği kısımdır, log'a düşmez — ve sayfa
  ilk render'dan sonra adres çubuğundan temizlenir (`ResetPasswordPage.tsx:20-32`).
- Belirteç sayfa açılışında değil "Save password"a basılınca harcanır: bir
  e-posta tarayıcısının bağlantıyı önden açması belirteci tüketmez
  (`ResetPasswordPage.tsx:40-55`).
- Belirteç bir kez harcanınca oturum açılır; parola reddedilirse ikinci
  deneme aynı oturumla sürer. Sayfadan kaydetmeden ayrılınca (unmount) o
  oturum kapatılır (`abandonPasswordResetSession`, `ResetPasswordPage.tsx:33-38`).
- Yeni parola en az 8 karakter (`ResetPasswordPage.tsx:89,102`).
- Belirteç yoksa, süresi geçmişse ya da zaten harcanmışsa ekran "Reset link
  not valid" gösterir ve yeni bağlantı istemeye yönlendirir
  (`ResetPasswordPage.tsx:68-74`).

**Bilinen tuhaflıklar.** BL-161: Supabase'in kendi asgari parola uzunluğu 6
(`supabase/config.toml:188`), web ekranları 8 istiyor; `updateUser`
doğrudan Supabase'e gittiği için Supabase'i doğrudan çağıran biri 6
karakterle geçebilir (yalnız kendi hesabına).

### ProfilePage, PreferencesPage, NotificationPreferencesPage (kısmi: butonlar)

**Ne işe yarar.** Account → Profile / Preferences / Notifications: hesabın
her workspace'te geçen ayarları. Her sayfa kendi "Save" ve "Discard"
düğmesiyle; Discard kaydedilmemiş değişikliği geri alır.

**Kendine özgü kurallar.** Discard beyaz (UI-09). Profile'da fotoğraf
"Upload/Replace" yeşil; "Remove" kırmızı iki tık (UI-12, "Confirm remove")
ama yalnız taslağı temizler: fotoğraf "Save changes"e basılana kadar
silinmez, Discard geri getirir.

### SecurityPage (kısmi: butonlar)

**Ne işe yarar.** Account → Security: e-posta, parola, diğer oturumları
kapatma, hesabı silme.

**Kendine özgü kurallar.** "Resend" ve "Sign out other sessions" yeşil.
Bekleyen e-posta değişikliğini geri çeken "Cancel change" kırmızı ve adı
bilerek "Cancel change" (yalnız "Cancel", pencereyi kapat gibi okunur;
kullanıcı kararı 2026-09-22).

### WorkspacesPage (kısmi: butonlar)

**Ne işe yarar.** Account → Workspaces: hesabın bağlı olduğu workspace'ler,
açma, oluşturma, sahiplik devri, kapatma.

**Kendine özgü kurallar.** Şu an çalışılan workspace'in satırı tonlu ve
`aria-current`; ayrı "Current" rozeti yok (kullanıcı kararı). "Open" her
satırda yeşil ve tıklanabilir. Formlardaki Cancel, "Keep this workspace",
"Reject owner transfer" beyaz.

### EmployeesPage (kısmi: çalışan çekmecesi butonları)

**Ne işe yarar.** Employees listesi; satıra tıklayınca çalışan çekmecesi
(Profile, Employment, Availability, Documents, Access, History).

**Kendine özgü kurallar.** Çekmece altı: Cancel beyaz, Invite ve Save
yeşil. Access'te "Remove access", "Revoke" ve "Remove photo" kırmızı iki tık
("Confirm remove access", "Confirm revoke", "Confirm remove"). Send
reminder, Retry, Reset PIN, Copy, "Save emergency contact", "Open document"
yeşil; "Keep editing", "Leave it", "Request changes" beyaz.

**Kendine özgü kurallar (devam).** "Request changes" notu UI-13 penceresinde
yazılır; not boşken buton kapalı. Documents'ta açılan belge çekmecesi
kaydedilmemiş değişiklikle kapatılınca "Discard unsaved changes?" (UI-13)
sorar.

### EmployeeHubPage

**Ne işe yarar.** `/app/employee-hub/*`: yalnız `employee` rolündeki üyenin
arayüzü (`PermissionRoute` `workspace.read`, `roles={["employee"]}`). Alt
sayfa URL'den okunur: kök "Home" panosu (`EmployeeDashboard`; `?shift=<id>`
`ShiftSheet`'i açar: "Find cover or swap", "Open in my schedule"), `schedule`
(`EmployeeScheduleBoard`), `shift-hub` (`ShiftExchangeHub` çalışan görünümü),
`my-availability` ("Availability" / "Time Off Requests" sekmeleri,
`?section=time-off`), `more` (`EmployeeMorePage`). Menü AppShell'de: kenar
çubuğunda Home, Schedule, Shift Hub, My Availability; mobil alt çubukta Home,
Schedule, Requests, More.

**Kullandığı ortak parçalar.** `CatalogPageHeader` (UI-01; metinler
`pageCopy`'de), `getEmployeeHub` (`employee-hub-data.ts` →
`get_employee_hub_service`, shared `employeeHubReadModelSchema`),
`WeeklyPreferencesPanel` (`audience="employee"`), `AvailabilityDraftScope` +
`useAvailabilityNavigationGuard` ("Stay here" / "Discard and leave"), shared
`employeeTimeOffInputSchema`. ConfirmButton / ConfirmDialog kullanmaz.

**Kendine özgü kurallar.** Veri penceresi bugünden 2 gün önce ile 42 gün
sonrası arası, 60 sn'de bir yenilenir; `schedule?date=` yalnız o günü okur;
`more` hiç veri yüklemez. İzin formu en fazla 31 gün alır. Form açıkken
lokasyonun saat dilimi değişirse gönderim durur ("Use current location time
zone"). Aynı içerik yeniden gönderilirse aynı `request_id` kullanılır.

**Bilinen tuhaflıklar.** Shift Hub mobilde "Requests" adını taşır. Tanınmayan
alt yol (eski `lineup` bağlantıları dahil) genel "Employee Hub" başlığıyla
More sayfasını açar. `#<id>` hash'i veri gelince o öğeye kaydırır. Line-up alt
sayfası ve bağlantıları ("See today's Line-up", "View Line-up", More'daki
"Line-up") 5.6'da kalktı.

### SchedulePage (kısmi: taslak ve şablon menüleri, müsaitlik)

**Kendine özgü kurallar.** Taslak menüsünde taslak ve şablon silme, Save
draft menüsünde taslağın üstüne yazma: ikonlu iki tık (UI-12, `unstyled` +
`confirmName`; satır tıklanabilir olduğu için `stopPropagation`). Şablon
penceresinde "Delete" iki tık ("Confirm delete"). Yayınlanmış taslağın
satırında üstüne yazma düğmesi yok.

Vardiya kartı düzeni (kullanıcı kararı 2026-09-26): Gerçek ve hayalet kart
aynı bileşen düzenini kullanır (`apps/web/src/schedule/components/ShiftCard.tsx`:
`ShiftCard` / `GhostShiftCard`). Satır sırası: 1) tip-iş, 2) label düz metin
(kutucuk yok), 3) saat. Hayalet: bütün hayaletler tek ölü gri
(`--schedule-ghost-*`), ince seyrek tarama, saydamlık yok (metin ≥5:1);
lokasyon yalnız köşedeki iğnenin baloncuğunda (`apps/web/src/shell/Tooltip.tsx`).
Köşe ikonu olan kart başlığa sağdan yer ayırır. Dışa aktarma lokasyonu yazıyla
gösterir. Gerçek kartta iğne yok. "All locations – Together" görünümünde
gerçek kartta lokasyon satırı kalır: başlığın altında, ikonsuz (kullanıcı
kararı 2026-09-26). Not 2026-09-26 (`aff7ca8`):
`Tooltip.tsx` ve `--schedule-ghost-*` henüz main'de değil, branch `ghost-11b`.

Başka yöneticinin taslak adıyla kaydedince UI-13 penceresi sorar:
"Overwrite "<ad>"?"; Cancel derse hata satırı başka ad seçmesini söyler.

Düzenleme kilidi (3b): yalnız taslak kilitlenir. Başkası taslağı
düzenliyorsa "Draft is being edited" penceresi kimin düzenlediğini söyler;
"View schedule" beyaz, "Try again" yeşil. Yayın penceresinin ilk adımında,
taslak başladıktan sonra yayını değişen lokasyonun altında uyarı satırı
(kim, ne zaman; engel değil, yayınlayan karar verir).

Müsaitlik (FOUNDATION-B 5.3, 2026-09-24): tek kaynak çalışanın haftalık
işaretleri (`employee_weekly_preferences`) ve yöneticinin gizli
hatırlatmaları (`manager_weekly_reminders`). Izgaradaki taralı hücreler
okuma modelindeki `employees[].weekly_availability`'den çizilir; yayınlanmış
vardiyanın uyarısı yayın anındaki kayıttan gelir, sonradan girilen işaret
yayınlanmış işi geriye dönük uyarıya çevirmez. Add/Edit shift kaydederken
"Checking availability…" ile sunucudaki ortak kontrolü sorar; ayar
(Settings → Conflict handling → Employee availability) Warn ise vardiya
uyarıyla yazılır, Require confirmation ise çakışma penceresi "Place shift" /
"Add anyway" kararını ister, Block ise yazılmaz; yöneticinin hatırlatmasına
çarpan vardiya ayardan bağımsız hep onay ister. Onay gerekçe yazdırmaz,
kararın parmak iziyle kaydedilir (eski "Override reason" kutusu, "custom
work" sınıflandırması ve "Keep draft" yok). Sürükle-bırak/yapıştırma
incelemesi ve "Review current default hours" aynı kuralla çalışır. Çalışan
kartında yalnız "Weekly availability preferences" simgesi var.
**BL-186 ile değişecek (kural 2026-09-26, "Müsaitlik"):** müsaitlik yazmayı hiç durdurmaz; Warn/confirm/Block dalları ve "Place shift" / "Add anyway" penceresi müsaitlik için kalkar, hücrede yalnız uyarı, Publish'te onay. Bu paragraf iş main'e girince yeniden yazılır.

### ScheduleRequestsPage

**Ne işe yarar.** Schedule → Requests (`/app/schedule/requests`): yöneticinin
izin talepleri kuyruğu ("Time off") ve takas/cover onayları ("Shift changes").
İzin tarafı `get_schedule_requests_service`'ten gelir; "Shift changes"
sekmesi Shift Hub'ın yönetici görünümüdür (`ShiftExchangeHub manager`).

**Kullandığı ortak parçalar.** `CatalogPageHeader` (iki görünümde aynı başlık
ve sekmeler), `CatalogDrawer` (izin inceleme çekmecesi), `ShiftExchangeHub`.

**Kendine özgü kurallar.** Sekme URL'de (`?tab=time-off|shift-changes`);
yalnız izin okuyabilen izin görünümünü, yalnız takas okuyabilen Shift Hub'ı
görür. `?case=<id>` Shift Hub'da o vakayı açar (yönetici bildirimleri buraya
bağlanır). İzin verisi izin okuyabilen herkese iki sekmede de yüklenir, "Time
off" sekmesindeki sayı kaybolmasın diye. Eski takas kuyruğu ve
"View earlier requests" 5.1b'de kalktı.

**Bilinen tuhaflıklar.** İnceleme çekmecesindeki "Select a request" yer
tutucusu hiç görünmez (çekmece yalnız bir talep seçilince açılır). "Shift
changes" sekmesinde sayı rozeti yok; Shift Hub kendi başlığında sayıyı söyler.

### ScheduleTemplatesPage (kısmi: butonlar)

**Kendine özgü kurallar.** Satırdaki çöp kutusu ikonlu iki tık; silahlıyken
onay ikonu ve "Confirm delete template <ad>" adı/ipucu.

### AnnouncementsPage (kısmi: butonlar)

**Kendine özgü kurallar.** Düzenleyicide "Delete" iki tık ("Confirm
delete"). Listede satır menüsünün "Delete"i düzenleyiciyi silahlı açar
(`?delete=1`, `useConfirmClick(fn, true)`); 3,2 sn içinde basılmazsa söner.
Silahlıyken Publish gizlenir, Save kapanır.

### LocationsSettingsPage (kısmi: butonlar)

**Kendine özgü kurallar.** Lokasyon çekmecesinde "Delete location" iki tık
("Confirm delete"), ayrı panel yok. Jobs, Shift types ve Shift labels'ta
silme uyarı paneli açar (etki listesi); o panel bilerek kalıyor.

### RolesSettingsPage

**Ne işe yarar.** Settings → Roles & permissions (`/app/settings/roles`,
`roles/:roleId`, yeni rol için `roles/new`): her rolün neyi görüp
değiştirebileceği. Görmek `roles.read` ister; düzenlemek `roles.manage` ile
owner ya da admin üyeliği ister (`canManage`), yerleşik rolde ayrıca
`role.editable`. Owner listede görünmez; seçim yoksa Manager açılır. Roller
"Workspace roles" sekme şeridindedir; 3'ten fazla özel rol "Custom roles +N"
menüsünde toplanır, mobilde "Role" seçicisi çıkar.

**Kullandığı ortak parçalar.** UI-03 `SettingsHeader` ("New role"), UI-09
buton rolleri ("Copy role" ve "Cancel" beyaz, "Save changes" yeşil), shared
`role-permissions.ts` (`permissionGroupsForRole`, `toggleRolePermissions`,
`personalRolePermissions`, `employeeEligiblePermissions`) ve
`workspaceRoleInputSchema`, `roles-data.ts` (`loadRoleWorkspace`,
`saveWorkspaceRole`, `deleteWorkspaceRole`), kaydedilmemiş değişiklik için
`useAvailabilityNavigationGuard` / `leaveAvailability` ("Discard role
changes?").

**Kendine özgü kurallar.** İzin tablosu açılıp kapanan gruplardan oluşur; grup
ve alan başına "Read" / "Edit" kutuları, alan açıklaması Info ikonunda. Bir
izni açmak bağımlılıklarını da açar (`rolePermissionDependencies`; ör.
Publishing → Schedule). "Employee experience" rolü yalnız "Personal access"
alanlarını görür. "Experience" yalnız rol oluşturulurken seçilir; "Starting
point" boş rol ya da var olan bir rolün kopyası. Kayıt `expected_updated_at`
ile gider; başarısız kayıtta taslak korunur.

**Bilinen tuhaflıklar.** "Delete role" (yalnız özel rollerde) `ConfirmButton`
değil, kendi iki tık kopyası: 3,2 sn silahlı "Confirm delete"; üye ya da davet
referansı varsa "Role has dependencies" der ve sayıları veren ipucu silahlı
kalır (UI-12'deki "tek eski kopya"). Gezinme koruması availability modülünden
ödünç. 5.6'dan beri Schedule grubunda "Line Up" satırı yok.

### NotificationSettingsPage

**Ne işe yarar.** Settings → Notifications (`/app/settings/notifications`):
workspace'in bildirim politikası. Her bildirim türü bir kart: açık/kapalı,
izinli kanallar, sıklık. Politika kapsamı seçilebilir (Organization, bir rol
ya da bir lokasyon); kişisel tercihler (Account → Notifications) bu kuralları
yalnız daraltabilir.

**Kullandığı ortak parçalar.** UI-03 (`SettingsHeader`). Kart başlığı ve
açıklaması shared `notification-display.ts`'ten (`adminDescription`), tür
listesi sunucudaki bildirim kataloğundan gelir; katalogdan silinen tür
listeden de kalkar (5.3c'de "Availability requests to review").

**Kendine özgü kurallar.** Düzenleme `notifications.settings.write` ister;
her kayıt ve sıfırlama gerekçe ister (en az 3 karakter, denetim geçmişi
için). "Safe test" `notifications.test_send` ister. Zorunlu türün
(`mandatory_in_app`) açık/kapalı kutusu kilitli.

**Bilinen tuhaflıklar.** Bildirim platformu ayrı bir proje olarak baştan
tasarlanacak (FOUNDATION-B kapsam dışı); bu sayfa o zamana kadar olduğu
gibi kalıyor.

### SupportSettingsPage (kısmi: butonlar)

**Kendine özgü kurallar.** "Email support" ve "Copy diagnostics" yeşil.

### ConflictHandlingSettingsPage

**Ne işe yarar.** Settings → Conflict handling
(`/app/settings/scheduling/conflicts`): vardiya yazarken çıkan çakışmaların
bütün işletmede nasıl ele alınacağı. Her kural için bir seçim: Required
documents, Conditional documents during grace / after grace, Employee
availability, Approved time off, Closed location or shift type, Minimum travel
ve Minimum rest (ikisinin dakikası da burada). Kaydetmek
`schedule.conflict_rules.manage` ister (`PUT
/v1/workspaces/:id/scheduling-settings/conflicts`).

**Kullandığı ortak parçalar.** UI-03 `SettingsHeader`, `SettingsChoiceRow`,
shared `scheduleConflictSettingsSchema` ve `DEFAULT_SCHEDULE_CONFLICT_RULES`,
UI-09 buton rolleri ("Save conflict rules" yeşil).

**Kendine özgü kurallar.** Kademeler: Warn (uyarı gösterir, vardiya yazılır),
Require confirmation (yönetici "vazgeç" ya da "yine de koy" seçer, kayıtlı),
Block. Employee availability 5.3b'den beri üç kademe, "Allow" yok; yöneticinin
gizli hatırlatması bu seçimden bağımsız her zaman Require confirmation.
**BL-186 ile değişecek:** "Employee availability" satırı kalkar (kural 2026-09-26, "Müsaitlik").
Approved time off yalnız Require confirmation / Block (Aşama 6'da yalnız Block
kalacak). Conditional after grace, grace kuralından yumuşak olamaz (şema
reddeder). Kayıt `conflict_rules_revision` ile gider; arada başkası
kaydettiyse Save kapanır, "Reload rules" güncelini getirir. Kayıttan sonra
Schedule ızgarası ve haftalık tercih ayarları tazelenir.

**Bilinen tuhaflıklar.** "Reload rules" de yeşil aksiyon düğmesi. Seçim
etiketleri İngilizce "Warn / Require confirmation / Block"; kullanıcı
kararındaki "Uyar / Yumuşak / Sert" bunlara karşılık gelir.

### SchedulingSettingsPage

**Ne işe yarar.** Settings → Scheduling (`/app/settings/scheduling`). İki
bölüm, iki ayrı kaydetme:

- **Schedule basics**: haftanın ilk günü (Sunday / Monday), "Publish by"
  hedef günü ve saat biçimi (12 / 24 saat). "Save rules" ile kaydedilir
  (`update_scheduling_settings_service`). Conflict kuralları bu kayda
  girmez; onlar Conflict handling sayfasının.
- **Availability and staffing** (`availability/WeeklyPreferenceSettings.tsx`):
  müsaitlik giriş modu ("Time range" / "Shift type") ve "Required during
  onboarding". Kendi Save / Discard düğmeleri ve kendi revizyonu var
  (`weekly_preference_settings_save_service`).

**Kullandığı ortak parçalar.** UI-03 (`SettingsHeader`). Mod değişince
çalışanların kayıtlı haftaları DATA-05 ile dönüştürülür.

**Kendine özgü kurallar.**
- Düzenleme `settings.schedule_rules.manage` izni ister. İzni olmayan
  Schedule basics'i salt okunur görür; Availability and staffing bölümünü
  hiç görmez.
- "Shift type" moduna geçiş, saati eksik aktif bir vardiya tipi varken
  kapalı; eksik tipler Shift types sayfasına (`?edit=<id>`) linklenir.
- Mod değişimi (AVAIL-001, 2026-09-22): kaydedince workspace'teki her
  kayıtlı hafta (çalışanın kendi haftası ve yöneticinin "Manager reminders"
  haftası) yeni moda çevrilir, eski hali geçmiş tablosuna yazılır, sonra
  haftası çevrilen çalışanlara "Check your availability" bildirimi gider.
  Mod seçilir seçilmez not gösterilir: "Saved weeks will be converted to
  the new entry mode. Employees will be notified to check theirs."
- Başka biri ayarı bu arada değiştirdiyse taslak korunur, kaydetme kapanır;
  "Discard and reload" ile en son hal yüklenir.

**Bilinen tuhaflıklar.**
- `?checklist=setup` ile açılınca (owner kurulum listesinden) hafta başı ve
  saat biçimi boş gelir; ikisi seçilmeden kaydedilemez.
- Veri yüklenmeden önce form sabit varsayılanlarla (Monday, 12-hour)
  çizilir.
