# Tek Backlog ve Hatirlatmalar

Kurulus: 2026-09-09. Sahibi: ana session. Aktif is durumu [WORK](WORK.md), MVP sirasi [ROADMAP](ROADMAP.md) icindedir.

## Kurallar

- Yeni bulgu mevcut kabul kosulunu engelliyorsa ilgili WORK isinde cozulur. Bagimsiz iyilestirme buraya kisa gerekceyle alinir.
- Kayitlar implementasyon emri veya guncel eksiklik kaniti degildir. Aktif ise alinmadan ilgili kod, son kullanici karari ve sahiplik kontrol edilir.
- Her kayit sabit ID tasir. Aktif ise alininca ayni ID ile WORK'e baglanir; burada ikinci durum gunlugu tutulmaz. Tekrarlanan fikir mevcut kayda eklenir.
- Hatirlatmalar olay temellidir: ilgili buyuk teslimatin kapanisinda baglantili maddeyi kisa hatirlat. Bu dosya zamanlanmis bildirim veya arka plan izleme kurmaz.
- Eski tarihli plan ve hafiza notlari kaynak olarak korunur; yeni takip burada yapilir. Yeni proje ile eski Newfork'u kapsayan kaynaklarda proje uygunlugu dogrulanmadan is aktarilmaz.

## Guncel Takipler

| ID | Konu / beklenen sonuc | Kaynak veya tetikleyici |
|---|---|---|
| BL-001 | Account > Documents: employee belge yukleme/yenileme, inceleme durumu/gecmis ve ayri Policies & Agreements erisimi. Gecici onboarding Documents yonlendirmesi kalici UX sayilmaz. | [9 Eylul kararlari](../rebuild/employee-invite-onboarding-decisions-2026-09-09.md); invite/onboarding teslimi kapaninca hatirlat. Zorunlu takip. |
| BL-002 | Ortam baslatma: mevcut `pnpm.cmd dev` uzerinde yapilandirilabilir portlar ve checkout/surec sahipligi; ayni sunucuyu tekrar baslatmayi onleme. | Koordinasyon gorusmesi; yeni framework kurmadan mevcut betigi gelistir. |
| BL-003 | Kisa ortam kontrolu: gerekli env anahtarlarinin varligi (degerlerini yazmadan), servis/port ve hedef checkout bilgisini tek komutta gorunur kil. | Tekrarlanan ortam arastirmasini azaltma. |
| BL-004 | Tekrar kullanilabilir yerel owner/manager/employee senaryolari; tekrar calistirilabilir kurulum ve yalniz sahipli test verisinin temizligi. | Davet/onboarding ve bagli akislarin veri hazirlik maliyeti. |
| BL-005 | Gerekli otomatik kontrolleri degisiklik yuzeyine gore sec; entegrasyonda gereken kapsamli kontrolu calistir, basarili kaniti gereksiz tekrarlama. | Bir sonraki CI/gelistirme akisi duzenlemesi; bu kurulum test sistemi degistirmedi. |
| BL-006 | Mevcut WIP'yi kayipsiz checkpoint'e alma isi [WORK GIT-001](WORK.md) olarak aktif. Son kullanici karari: tek snapshot yeterli, anlasilir/parcali commit zorunlu degil. | Yeni islerde dar sahiplik korunur; eski branch/worktree/stash veya kod tahminle silinmez. |
| BL-007 | Onboarding yedi-adim sunumu ve partial draft autosave/revision ihtiyacini kucuk kabul edilebilir dilimlere ayir. Documents/Policies/deadline motorunu ayni anda kapsama alma. | OBS-001 handoff'unda sonraki dilim olarak bildirildi; mevcut tamamlanma yeniden incelenecek. Oneri: `gpt-6-astra`, high; cok yuzeyli profil/revision sozlesmesi. |
| BL-008 | Gercek workspace avatar upload/crop akisi. Mevcut access goruntuleme-kaldirma kontrolu upload/crop tamamlanmasi sayilmaz. | OBS-001 handoff'unda eksik bildirildi; [onboarding kararlari](../rebuild/employee-invite-onboarding-decisions-2026-09-09.md). |
| BL-009 | Drawer Access Kiosk/PIN reset placeholder'ini ilgili kiosk teslimatinda ele al; mevcut placeholder'i calisan ozellik sayma. | OBS-001 handoff'u; BL-010 kiosk grubunun dar takip maddesi. |
| BL-026 | Web typecheck'in ImportantDatesSettingsPage, JobCatalogEditor, JobsManagement.test ve OwnerOnboardingPage.test hatalarini ilgili sahiplik altinda incele. Genis pgTAP hatalari icin mevcut raporu once ayristir; tum suite'i gerekcesiz yeniden calistirma. | OBS-001 handoff'u; neden/kapsam disilik ana session tarafindan dogrulanmadi. Hedef employee PASS tum repo green anlamina gelmez. |
| BL-027 | Ornek env'de bulunan Resend anahtarini saglayicida yenile ve gerekli runtime ortamlarini yeni degerle guncelle. Deger belgelerde tutulmaz. | GIT-001 kontrolunde `.env.example` temizlendi; mevcut runtime ayarlari degistirilmedi ve anahtar yenileme yapilmadi. |
| BL-028 | Ana session tarafindan siradaki is secildi; hedef, kabul kosulu ve durum [WORK BL-028](WORK.md) icindedir. | 4dfb'de 233 degisiklik, 112 ayni/121 farkli dosya; worktree ve arsiv korunuyor. Burada ikinci ilerleme kaydi tutulmaz. |
| BL-029 | Statik runtime import zincirinden ulasilamayan Schedule/editor/preview ve UI dosyalarini yalniz ilgili is gerektirirse urun kararina gore incele. Kopuk baglanti tamamlanmis bir ozelligin yanlislikla disarida kalmasi olabilir; otomatik dead-code temizligi yapma. | GIT-001: 354 kaynak/34 ulasilamayan aday/0 cozumlenemeyen yerel import; rapor `artifacts/repo-checkpoint/code-links.json`. Kaynaklar checkpoint'te korunur. |

## Onceki Birlesik Backlog'dan Aktarilan Gruplar

Kaynak: 2026-09-02 tarihli `consolidated-master-todo-backlog` hafiza notu. Asagidaki P0-P3 etiketleri kaynaktaki tarihli onceliklerdir; bugunku eksiklik veya yayin engeli olarak yeniden dogrulanmadi. Gruplar onceki fikirleri kaybetmemek icindir; aktif gorev acarken dar kabul kosullu alt ID verilir. Yeni proje icin son kullanici karari esastir.

| ID | Tarihli grup | Korunan kapsam |
|---|---|---|
| BL-010 | P0 urun | Landing/auth/onboarding/profile UI; billing paket/trial; Employee Time Tracker; kiosk; published shift edit lock; Daily View/scheduled hours; Employee Hub quick actions/shift release; Line Up/call off/time tracking. |
| BL-011 | P0/P1 Schedule | Satir/sutun boyutlari, daily view, real/ghost/draft/preview badge sirasi, toast, Add/Edit Shift drawer; ortak dismissal/portal/z-index/Escape onceligi; focus/klavye; uygulanmis filtre ve acik panel ayrimi; ic ice tiklama hedefleri; mobil sticky kontroller; stale draft/publish ve lokasyon durumu; preview edit lock; async discard hatasi; route temizligi; trigger toggle; unsaved navigation guard; server ownership ve tenant/location yetkisi. |
| BL-012 | P1 operasyon | Today's Operations, Needs Attention, Attendance, Overtime ve Labor Cost dashboard'lari; Schedule Analytics/Comparison; Notification Center; Activity Timeline/Audit Log. |
| BL-013 | P1 employee | My Schedule, My Availability, My Team, Request Center, Time Off, Shift Swap, Seek Cover, Announcement Center, Notification Preferences. |
| BL-014 | P1 Schedule gelisimi | Weekly/daily polish; print, PDF/Excel export; Auto Schedule; AI Schedule Assistant; Conflict Center; Coverage Heatmap; Labor Forecast. |
| BL-015 | P2 employee yonetimi | Drawer/Profile, Documents, Notes, Performance, Certifications, Availability Calendar, Timeline. BL-001'in zorunlu belge takip karari korunur. |
| BL-016 | P2 organizasyon | Organization/Location/Jobs/Positions/Shift Labels/Shift Types/Closed Dates/Important Dates ayarlari; Roles & Permissions. |
| BL-017 | P2 payroll | Pay Period Dashboard, Payroll Export, ADP, Tip Reporting, Break Violations, Meal Penalties, Overtime Calculation; yeni projenin ayri domain kararlarina tabi. |
| BL-018 | P2 raporlar | Labor, Attendance, PTO, Schedule, Payroll, Employee Reports ve Export Center. |
| BL-019 | P2 iletisim | Email/SMS/push template'leri; Announcement Builder; Scheduled Announcements. |
| BL-020 | P3 mobil | Responsive admin, employee mobile UX, PWA, mobile notifications. |
| BL-021 | P3 enterprise | Multi-language, white label, public API, webhooks, SSO, SCIM, advanced audit, data retention, Compliance Center, SOC 2 hazirligi, GDPR araclari. |
| BL-022 | Termination P0 | Effective termination instant + worksite timezone; archive/employment-event tutarliligi; open/on-break time-entry karari; gelecekteki yayinli vardiyalarin open shift'e donusu ve audit/coverage bildirimi. |
| BL-023 | Termination P1 | Exchange istekleri ve bildirim temizligi; rehire/undo cakismalari; ortak cutoff; lokasyon yetkisi; PIN iptali; former-employee bildirim filtresi; eski calisana atanmis live shift uyarisi. |
| BL-024 | Termination P2 | Availability/time-off gecmisi ve gelecek kisitlar; portal/session erisim iptali; final-pay/leave/predictive-scheduling adaylari; rehire erisim/PIN/bakiye/gecmis politikasi. |
| BL-025 | Tarihli compliance/payroll kapilari | Desteklenmeyen sonucu otoriter kabul etmeme; review-required/fail-closed siniri; yururluk tarihi ve dogrulanmis kaynakla politika takibi. Yeni projeye otomatik eski domain tasinmaz; bu not hukuki veya hesaplama dogrulamasi degildir. |

Schedule teslimatinda BL-011, lifecycle veya buyuk baglantili teslimatta BL-022/023/024 hatirlatilir. Notification kapanisi termination isini tamamlamis sayilmaz. Kaynaktaki baska projeye ait Tip Viewer ve kisisel payroll-check notlari Newfork urun backlog'una tasinmadi; kendi kaynaklarinda korunur.
