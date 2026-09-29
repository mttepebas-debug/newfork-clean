

## Ek: numarasız maddelerin takma adları
Satır numaraları `3a31d625` anındaki BACKLOG.md'ye göre; metnin başı aramak için. Tam dizin: `docs/plan/research/backlog-index-2026-09-29.md`.

| Takma ad | Satır | Grup | Metnin başı |
|---|---|---|---|
| U01 | 13 | G0 | BL-040 Line Up sadeleştirme. KAPANDI 2026-09-24: Line Up FOUNDATION-B 5.6'da silindi; sıfı |
| U02 | 31 | GY | OBS-001 Invite/access mutasyonları (reminder/revoke/remove access) ve provider kabulü → ta |
| U03 | 32 | GY | OBS-002 Availability save → manager → Schedule browser zinciri ve otomatik bildirim (local |
| U04 | 38 | G24 | Genel seed/SQL replay hataları (release öncesi). |
| U05 | 47 | GS | Export iyileştirme fikirleri: somut kullanıcı feedback'i bekleniyor. |
| U06 | 48 | GS | Eski toplu fikir grupları (BL-010..025: dashboard'lar, raporlar, mobil, enterprise, termin |
| U07 | 51 | G24 | README.md eski içerik taşıyor (payroll/kiosk fazları); rescue'da silinmişti, geri tutuldu. |
| U08 | 52 | G14 | Schedule topbar dar pane'de (936px) iki satıra sarıyor; taşma yok, polish (F5). |
| U09 | 53 | G0 | Schedule topbar filtre çipleri Settings dropdown'ının üstünde render ediliyor (z-index) →  |
| U10 | 54 | G0 | Light tema token seti → tasks/THEME-002. KAPANDI 2026-09-16 (THEME-002). |
| U11 | 55 | G0 | ≤760px'te Schedule Export erişilemiyor → KARAR (2026-09-16): mobilde export yok; mevcut da |
| U12 | 56 | G13 | App.test.tsx schedule-data mock'u scheduleReadKey'i gerçek koddan farklı (view dahil) üret |
| U13 | 57 | G20 | Export PNG önizlemesi her sayfayı 2.5x ölçekte render ediyor; çok sayfalı haftalarda yavaş |
| U14 | 58 | G23 | Prod build'e erişilemeyen lazy chunk'lar giriyor (ScheduleShiftBadgeLab, Kiosk, TimeEntrie |
| U15 | 59 | G23 | EmployeeHubPage pageCopy'de time-tracking metni ve independentPage mantığı duruyor (BL-057 |
| U16 | 60 | G13 | ScheduleExportSchedules.test.tsx makine TZ'sine bağlı; testte TZ'yi mock'la (CI şu an TZ p |
| U17 | 61 | G24 | Kullanıcı dizinindeki C:/Users/TheWe/node_modules (ör. @types/node 25.5) repo bağımlılıkla |
| U18 | 62 | G13 | CI test adımı 7dk (concurrency=1); ileride concurrency=2 denensin. |
| U19 | 63 | G13 | Tam local pnpm test'te yük altında flaky testler: api organization-settings-routes, web Em |
| U20 | 64 | G20 | EXP-002: export çıktı görünümünün kalanı (PNG önizleme ölçeği + kullanıcı geri bildirimi); |
| U21 | 65 | G15 | (leave: low / do: moderate) THEME-003 (MVP-PLAN F5): (1) yakın renk tonlarını (ΔE<4) THEME |
| U22 | 66 | G0 | THEME-002 açıkları → tasks/THEME-004 (sayfa CSS token'ları, on-accent, employee AA). Yakın |
| U23 | 67 | G0 | Owner onboarding'de lokasyon short name önerisi ve phone alanı yok → tasks/LOC-002. KAPAND |
| U24 | 68 | G0 | Hosted'a location_phone migration'ı → tasks/LOC-002 (publication migration'ı UI-DOC-001 so |
| U25 | 69 | G24 | Supabase CLI v2.109 → v2.117 güncellemesi (db push sırasında pg-delta sertifika ENOENT gür |
| U26 | 70 | G11 | /v1/invitations/pending |
| U27 | 71 | G0 | T2 madde 6 (davet token'ını sessionStorage'da saklama) YAGNI ile düşürüldü; hosted'da e-po |
| U28 | 72 | G0 | Vercel Authentication (newfork-clean-api, Production) smoke bitince yeniden açılacak (memo |
| U29 | 73 | G15 | .employee-remove-access { color: #9b3442 } (styles.css 2359) ölü kural: "Remove access" kı |
| U30 | 74 | G15 | SecurityPage "Cancel change" butonu kırmızı (danger) görünüyor; iptal eylemi için doğru to |
| U31 | 75 | G11 | Onboarding getter geçersiz ya da erişilemeyen workspaceId için "unavailable" (P0002) veriy |
| U32 | 76 | G12 | pgTAP borcu: BL-052 sonrası üç onboarding/document test dosyası kırmızı; employee_onboardi |
| U33 | 77 | G0 | .workspace-row capitalize hatası KAPANDI: kural UI-PRE-001 D1'de silindi (6d9f0e7). |
| U34 | 78 | G0 | Pending başlığının yüklenirken görünmesi KAPANDI: kit yükleme durumunda "Checking your acc |
| U35 | 79 | G0 | main CI THEME-004'ten beri kırmızıydı: MainNavigationHeaderContract.test.ts eski --lu-mute |
| U36 | 80 | G13 | CI: .github/workflows/ci.yml yalnız docs/** değişen push'larda tetiklenmesin (paths-ignore |
| U37 | 81 | G11 | POST /owner-onboarding/invitation-intents body'yi yetkiden önce doğruluyor (yetkisiz + geç |
| U38 | 82 | G24 | Local DB kalıntısı (AUTH-UX-001 fixture'ları, 2026-09-17 kısmi temizlik): "AUTH-UX Bistro" |
| U39 | 83 | G15 | (leave: low / do: moderate) Uygulamada kendi elle yazılmış onay pencereleri hâlâ var; orta |
| U40 | 84 | G15 | (leave: low / do: moderate) Roles > rol silme hâlâ kendi iki tık kopyasını kullanıyor (Rol |
| U41 | 85 | G15 | (leave: low / do: safe) Workspace ana sayfasındaki "Customize" ve "Add" butonları secondar |
| U42 | 86 | GK | Teknik borç denetimi (2026-09-18, salt okunur; ayrıntı DEBT-001 ve o session'ın transcript |
| U43 | 92 | G18 | Documents: migration öncesi published kayıtların published_at'i null; listede "-" görünüyo |
| U44 | 93 | G18 | Documents: DB trigger'ı published tanımın düzenlenmesini reddediyor; drawer bu yüzden salt |
| U45 | 94 | G24 | exceljs@4.4.0 > uuid@8.3.2 moderate advisory: exceljs yalnız uuid.v4 kullandığı için istis |
| U46 | 95 | GK | eslint-plugin-react-hooks kurulumu kullanıcı onayı bekliyor: kurulunca exhaustive-deps ilk |
| U47 | 96 | G24 | supabase/seed.sql:143 "Pending Demo" üyeliği pending_activation ama employee_onboarding_ca |
| U48 | 97 | G16 | UI-PRE-001 backlog'u (aynı tasarım diliyle, sonra): /sign-in kayıt modu ve sonlanan oturum |
| U49 | 98 | G16 | Yeni taslak business'ın varsayılan adı "New organization" (CreateOrganizationButton.tsx:15 |
| U50 | 99 | G0 | Proje CLAUDE.md yeniden yazılmayacak (kullanıcı kararı 2026-09-18: "kurallara gerek yok"). |
| U51 | 100 | G11 | Tipli hata göçü: kullanıcı kararı "önce riskli modüller" (auth, hesap, davet, workspace).  |
| U52 | 101 | G0 | React hook bağımlılık uyarıları: 20 adet (0 hata), 2026-09-18'de açıldı. Her biri bayat ka |
| U53 | 102 | G16 | Workspaces listesinde SON satırın "…" menüsü kırpılıyor: .workspace-list { overflow: hidde |
| U54 | 103 | G16 | Kurulumu bitmemiş business'ı "Discard" etmek 10 dakikadan eski oturumda API tarafından red |
| U55 | 104 | G11 | AcceptInvitationPage "yanlış hesap" durumu sunucunun İngilizce cümlesine bağlı; API artık  |
| U56 | 105 | G16 | Pending sayfası, kurulumu bitmemiş bir business'ı o business'ın SAHİBİ OLMAYAN üyesine hâl |
| U57 | 106 | G16 | finalizeActivation reddedilirse employee onboarding sayfası asılı kalabiliyor; yalnız askı |
| U58 | 107 | G16 | Workspaces sayfasının satır DIŞI metinleri hâlâ eski dilde ("Workspaces" başlığı, açıklama |
| U59 | 108 | G18 | HATA (uygulama içi DocumentReviewDrawer): dosya yükleme, taslak dosya silme ve erteleme li |
| U60 | 109 | G18 | DocumentReviewDrawer'ın 10 mutation'ından 8'i hiç test edilmiyor (acknowledge, withdraw, d |
| U61 | 110 | G0 | KARAR (kullanıcı, 2026-09-18): uygulama içi EmployeeDrawer da aynı mantığı alacak. |
| U62 | 111 | G0 | Üç cron endpoint'i tetiklenmiyor KAPANDI 2026-09-19: dördü de pg_cron'da (OPS-014, b7052f6 |
| U63 | 112 | G4 | Zamanlanmış export işi hosted'da 503 "Email delivery is not configured" dönüyor: job ve ye |
| U64 | 113 | G24 | Hosted'da VITE_API_URL tanımlı değil; web aynı alan adına relative istek atıyor. Bugün doğ |
| U65 | 114 | G0 | 2026-09-19 kullanıcı kararı: katılım zinciri (davet, onboarding, çakışmalar, business kapa |
| U66 | 290 | G0 | Gözlem (madde değil): 2026-09-27 yerel e2e koşusunda Chrome bir kez 0xE0000008 ile çöktü,  |
