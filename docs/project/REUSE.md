# Yeniden Kullanim Haritasi

Amac: ayni kodu, tasarim kararini veya kesfi tekrar uretmeden ilgili kaynagi bulmak. Bu harita bir ilerleme gunlugu, tam kod envanteri veya ikinci tasarim sistemi degildir. Durum [WORK](WORK.md), ertelenen fikir [BACKLOG](BACKLOG.md), uygulama gercegi kaynak kodundadir.

## Task Akisi

1. Planlama: ilgili terimle bu haritayi ara, eslesen kaynak ve tek kullanim ornegini oku. Kayit yoksa dar kod aramasi yap; tum repo/gecmisi tarama. Eski kaydi bugunku davranisin kaniti sayma.
2. Implementasyon: uygun ortak bileseni/sozlesmeyi kullan. Ortak cozum yetmiyorsa mevcut tuketicileri koruyarak dar genisletme yap; sadece benzer gorunen ama farkli davranan yuzeyleri zorla birlestirme. Yeni abstraction ancak somut tekrar veya tutarlilik kazanci varsa eklenir.
3. Kapanis: sonraki benzer task'in arastirmasini anlamli kisaltacak kod, karar, hata nedeni veya dogrulama tarifi varsa ilgili girdiyi ekle/guncelle. Yoksa belge uretmeden kapat. Kaynak tasindiysa veya sozlesme degistiyse eski kaydi ayni task'ta duzelt; yeni paralel kopya olusturma.

Kod/CSS degerlerini buraya kopyalama; dosya + sembol/seciciye baglan. Onceki PASS kaydi yeniden test etmeyi azaltabilir ama degismis kod/ortam icin otomatik kanit degildir. Hedefli kontrolu risk belirler. Genel tercih global AGENTS'te, proje ayrintisi burada kalir. Sir, token ve ham arac logu kaydedilmez.

## Kayit Formati

Kisa girdi yeterli: **ID ve arama terimleri | ne zaman kullanilir | tur (ortak kod / referans desen / karar / teshis) | kanonik kaynak + sembol | ornek/kanit | sinirlar**. Gerekli oldugunda kaynak commit/tarih ekle. Henuz implement edilmemis fikir haritaya hazir cozum diye girmez; BACKLOG'a baglanir. Kayitlar yalniz ilgili task kapsaminda bakim gorur.

## UI Referanslari

Asagidaki baslangic haritasi 2026-09-14 tarihinde kaynak koddan kontrol edildi. Bu tarih browser veya release kabul iddiasi degildir.

### UI-01: Catalog Header ve Toolbar

- Arama: header, separator, font, margin, status, filter, search, employees, availability, announcements, requests, important dates.
- Tur: ortak kod ve CSS deseni. Liste sayfalarinda ust alanin ayni koordinat ve gorunumunu korumak icin kullan.
- Kaynak: [CatalogPageHeader](../../apps/web/src/views/CatalogPageHeader.tsx), [styles.css](../../apps/web/src/styles.css) icindeki `.catalog-page-header`, `.catalog-toolbar`, `.catalog-toolbar-status-row`, `.catalog-toolbar-filter-row`, `.catalog-status-tabs`, `.toolbar-search`.
- Ornek: [AvailabilityPage](../../apps/web/src/views/AvailabilityPage.tsx), [AnnouncementsPage](../../apps/web/src/views/AnnouncementsPage.tsx). Mevcut kontrol: [MainNavigationHeaderContract.test](../../apps/web/src/views/MainNavigationHeaderContract.test.ts).
- Sinir: status ust satirda; filtre ve search alt satirda. Sayfaya ozel margin/font kopyalayarak yeni varyant uretme. Ortak CSS degisikligi tum tuketicileri etkiler; cascade ve responsive kurallari birlikte oku. Account/Settings header'i bununla otomatik degistirilmez.

### UI-02: Column Sort

- Arama: table, column, sort, hover, icon, siralama.
- Tur: ortak kod. [CatalogSortButton](../../apps/web/src/views/CatalogSortButton.tsx) ve [styles.css](../../apps/web/src/styles.css) icindeki `.catalog-sort-button`, `.catalog-sort-icon`.
- Ornek: [AnnouncementsPage](../../apps/web/src/views/AnnouncementsPage.tsx).
- Sozlesme: ortak ArrowUpDown ikonu ve bosluk; ikon hover veya klavye focus-visible halinde gorunur, aktif siralama tek basina ikonu sabitlemez.
- Sinir: bu bilesen veriyi siralamaz; `active` ve `onClick` tuketiciden gelir. Siralama mantigi ve tablo erisilebilirligi tuketici sorumlulugundadir.

### UI-03: Settings Header

- Arama: settings, title, icon, description, action, right top button, coordinate, alignment.
- Tur: ortak kod. [GeneralSettingsPage.tsx](../../apps/web/src/settings/GeneralSettingsPage.tsx) icindeki `SettingsHeader`; [styles.css](../../apps/web/src/styles.css) icindeki `.settings-page-header`, `.settings-heading-icon`, `.settings-header-action`.
- Ornek: [LocationsSettingsPage](../../apps/web/src/settings/LocationsSettingsPage.tsx), [KioskSettingsPage](../../apps/web/src/settings/KioskSettingsPage.tsx), [ShiftTypesSettingsPage](../../apps/web/src/settings/ShiftTypesSettingsPage.tsx). `icon`, `title`, `description`, `action`, `titleId` mevcut sozlesmedir. Mevcut kontrol: [SettingsPageAlignment.test](../../apps/web/src/settings/SettingsPageAlignment.test.ts).
- Ek referans: [ConflictHandlingSettingsPage](../../apps/web/src/settings/ConflictHandlingSettingsPage.tsx), SettingsHeader ile scheduling row/action siniflarini birlestirir. Mevcut conflict state/API/revision sozlesmesini ayri sayfada reuse eder; olculer icin kaynak CSS'i kullan.
- Sozlesme: desktop action ortak grid'in block-start/inline-end koordinatindadir; header baslik/aciklama tipografisi ile CTA aralik, boyut, font, renk, radius, durum ve ikon boslugu `.settings-page` icindeki `--settings-header-*` token'larindan gelir. Mobil action ortak responsive kuralda tam satira ve tam genislige gecer. Birden cok kontrol tasiyan action wrapper'i kendi icinde `flex-start` hizasini korur; sekmeler CTA degil, kendi ortak tab desenini kullanir.
- Sinir: Settings ailesi icindir. Sayfa CSS'inde header/action icin yeni `align-self`, `justify-self`, margin veya offset varyanti uretme. Sirf dosya konumu icin component tasima/refactor yapma; kullanici onayi olmadan yeni tasarim dili olusturma.

### UI-04: Account Layout ve Header

- Arama: account, sidebar, sticky, scroll, header, action, workspaces, profile.
- Tur: ortak kod. [AccountLayout](../../apps/web/src/account/AccountLayout.tsx), [components.tsx](../../apps/web/src/account/components.tsx) icindeki `AccountPageHeader`, [account.css](../../apps/web/src/account/account.css).
- Ornek: [WorkspacesPage](../../apps/web/src/account/WorkspacesPage.tsx). Mevcut kontrol: [AccountPageHeaderContract.test](../../apps/web/src/account/AccountPageHeaderContract.test.ts).
- Sinir: sayfa header'i ve action'i layout ile birlikte kullan; her Account sayfasina ayri offset ekleme. Sabit menu, icerik scroll'u ve mobil nav davranisini ortak layout uzerinden degerlendir. Bu harita mevcut tasarimi referanslar, yeni tasarim onayi vermez.

### UI-05: Theme Uygulama ve Dark Istisnalari

- Arama: theme, dark, light, system, preview, bootstrap, color-scheme, portal, toast.
- Tur: ortak kod ve tema sozlesmesi. Kanonik fonksiyon [theme.ts](../../apps/web/src/lib/theme.ts) icindeki `applyThemePreference`; [supabase.ts](../../apps/web/src/lib/supabase.ts) geriye uyum icin re-export eder.
- Kaynaklar: [index.html](../../apps/web/index.html) pre-paint saved/system cozumlemesi, [AuthContext](../../apps/web/src/auth/AuthContext.tsx) kaydedilmis tercih cache'i, [styles.css](../../apps/web/src/styles.css) root semantik `--theme-*` tokenlari ve [dark-theme.css](../../apps/web/src/dark-theme.css) istisna tuketicileri.
- Ornek/kanit: [BL-066 rollout raporu](../../artifacts/bl066/ROLLOUT.md); Preferences live preview/discard, System media degisimi, Sonner ve CatalogDrawer portal yuzeyleri.
- Sinir: light layout/font/spacing'i dark duzeltmesi adina degistirme. Yeni sayfada once semantik tokenlari ve mevcut dark kurallarini kullan; sayfaya ozel override yalniz kanitlanmis gap icin eklenir. Raporlu PASS hosted/release veya tum state'lerde WCAG sertifikasi degildir.

## Veri ve Katalog Sozlesmeleri

### DATA-02: Schedule RPC Review Hata Kodu

- Arama: PT409, 40001, availability_review_required, PostgREST retry, confirmation pending.
- Is kurali onay reddi serialization failure degildir; PostgREST yeniden deneme dongusunu tetikleyen 40001 yerine PT409 kullanilir. Gercek serialization hatalarini topluca donusturme.
- Kaynak: [dar migration](../../supabase/migrations/20260915075033_bl064_schedule_conflict_result.sql), [Schedule API](../../apps/api/src/schedule/schedule-routes.ts). API yalniz kesin review mesajinda legacy40001/PT409'u mevcut review marker'ina esler.
- Kanit: BL-064 Dilim A browser409-assessment-confirmation ve hedefli API/SQL raporu; hosted/release kaniti ayri.

### DATA-01: Notification Catalog Latest Schema

- Arama: notification catalog, type_key, schema_version, duplicate key, policy draft.
- Tur: veri normalizasyon deseni. Ayni notification `type_key` birden fazla schema version ile gelebilir; son kullanici yuzeyi type basina tek kart gosterir ve en yuksek `schema_version` kaydini kullanir.
- Kaynak: [NotificationSettingsPage](../../apps/web/src/settings/NotificationSettingsPage.tsx); referans davranis Account notification katalog normalizasyonudur. Kanit: [NotificationSettingsPage.test](../../apps/web/src/settings/NotificationSettingsPage.test.tsx).
- Sinir: React key'e version ekleyerek duplicate kartlari gizleme; kategori, gorunur kart ve Save payload ayni tekillestirilmis kaynaktan uretilmeli. Bu desen notification producer/email teslimat kapsamını kanitlamaz.
