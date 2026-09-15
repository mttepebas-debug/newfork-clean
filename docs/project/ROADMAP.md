# MVP Roadmap

Guncelleme: 2026-09-14. Sahibi: ana session. Bu belge tek MVP sira/hedef kaynagidir; is durumu [WORK](WORK.md), ertelenen fikirler [BACKLOG](BACKLOG.md) icindedir.

## MVP Sonucu

Employer organizasyonu kurar, calisanlari davet eder, Schedule yayinlar ve gunluk personel degisikliklerini yonetir. Employee dogru workspace'e katilir, zorunlu onboarding'i tamamlar, yayinlanmis programi gorur, izin verilen talepleri gonderir ve karar/sonucunu gorur.

Asagidaki sira mevcut [11 akisli MVP audit planindan](../rebuild/mvp-e2e-readiness-audit-plan-2026-09-07.md) alinmistir. Bu kurulum tum akislarin bugunku kod/ortam durumunu yeniden denetlememistir. Onceki local-ready etiketleri buraya guncel kabul olarak tasinmadi. Yeni kullanici teslim onceligi WORK'te kaydedilip bu sirayi gerektiginde gunceller.

## Teslimat Sirasi ve Kabul

2026-09-10: repo `main` uzerinde tek branch/tek worktree olarak temiz tabana alindi ve `origin/main` ile esit. Bu, urun kabul/test/release onayi degildir. Diger branch/worktree/stash ve unutulmus kod tahminle silinmez veya bu checkout'a karistirilmaz. Kullanici aksini istemedikce yeni session/task acilmaz; ana session planlama, raporlama, log ve teslimati tek elde yonetir.

## Ana Session'in Guncel Yurutme Sirasi

Uc handoff ilerleme/kanit kaynagidir; iclerindeki sonraki adim onerileri baglayici sira degildir. Asagidaki sira ana session'in temiz `main` tabani, raporlanan kabul eksikleri ve MVP sonucunu birlikte degerlendirmesidir. M1-M5 urun haritasi korunur; yakin donem is sirasi budur.

| Sira | Teslimat | Neden / bitis kosulu |
|---|---|---|
| 0 | Temiz taban ve yonetim disiplini | Tamamlandi: `main` tek ana branch, tek worktree, stash bos, local/remote esit. Yeni session acilmadan ana session yurutur; branch/worktree acilirsa ayni is kapanisinda merge/sil/kapat yapilir. |
| 1 | Calisilabilir ortak temel | Tamamlandi: BL-026 web typecheck ortak temeli dar kapsamda kapandi. Kabul kaniti WORK BL-026 icinde; genis pgTAP/repo audit acilmadi. |
| 2 | Kimlik, access ve roller | Yerel implementasyon checkpoint'i `fc2c4da` ile `origin/main`e alindi: OBS-001'in dar invite/access kaniti, BL-035, BL-051 ve BL-055'in kritik bolumleri birlikte tutarli. Hosted migration/provider/cron, destructive kabul ve release smoke bu kapinin yerel sonucuyla karistirilmaz; BL-058/13. kapiya tasinir. |
| 3 | Schedule temel kalite ve ayarlar | BL-036, BL-037, BL-038, BL-039, BL-049 ve BL-050. Kabul: Schedule performansi, export, templates, publish state, schedule rules ve shift type defaults MVP seviyesinde calisir ve anlasilir. |
| 4 | Requests, Shift Hub ve Line Up | BL-041, BL-040, BL-056 ve BL-057. Kabul: employee shift/request yuzeyleri sade, tutarli ve manager onayi/Schedule etkisiyle dogrulanmis; Time Tracking/clock-in MVP disi gorunurluk temiz. |
| 5 | Notifications ve Announcements | BL-044, BL-045, BL-046 ve OBS-002 bildirim bolumu. Kabul: announcement uretimi, notification center, settings notification modeli ve notification producer coverage dogrulanmis. |
| 6 | Availability -> Schedule kabul kapisi | OBS-002'nin employee preference save -> manager copy/toggle/save -> Schedule/preflight edit-grid donusu kapanir. Kabul: availability davranisi Schedule kararlarini dogru etkiler; bildirim parcasi 5. kapidaki modelle uyumludur. |
| 7 | Onboarding, Documents ve Acknowledgements | OBS-003, BL-001, BL-052 ve BL-053. Kabul: onboarding v1, kalici employee belge merkezi, conditional/review-required document kararlari ve acknowledgement'in tutulup tutulmayacagi netlesir. |
| 8 | Admin settings ve operasyon polish | BL-043, BL-047, BL-048 ve BL-054. Kabul: Important Dates, Settings General/Location, Jobs/Departments crash, Support ve ilgili drawer polishleri MVP deneyimini bozmayacak seviyede kapanir. |
| 9 | Landing/public giris | BL-034 landing page kapsam karari ve uygulanmasi. Kabul: public root, login/signup/onboarding yonlendirmesi ve ilk izlenim MVP icin yeterli. |
| 10 | Billing/Stripe ticari kapisi | BL-059. Kabul: Stripe baglantisi, billing sayfasi, plan/limit/exclusive feature modeli, promo code, 14 gun trial ve paid gecis senaryolari MVP icin dogrulanir. Workspace ayri company/abonelik siniridir; location'lar ayni company aboneliginde kalir. Hesap daha once trial kullandiysa yeni workspace yeni trial alamaz; free plan veya yeni abonelik gerekir. |
| 11 | Schedule hours guardrails | BL-067. Kabul: gunluk/haftalik calisma limiti domaini ayri planlanir; periyot, saat hesabi, overnight/DST, draft-published veri kaynagi ve warning/confirmation/block davranisi karara baglanip uygulanir. Bu kapi time tracking, payroll veya genis compliance motorunu kapsamaz. |
| 12 | Cok tenantli E2E kabul turu | BL-058. Kabul: 5 tenantli prova verisiyle onboarding, schedule, Line Up, notifications, employee actions, manager approvals, role change, access revoke ve invite akislari uc uca denenir. |
| 13 | Release hazirligi | Temiz migration replay, hedef ortam smoke, provider smoke ve kullanici onayli deploy/release kaniti. Yerel PASS tek basina release hazirligi sayilmaz. |

## Yurutme Yapisi

Her teslimat tek kabul kapisidir. Ana session once kabul kosulunu ve dosya/ortam sahipligini netlestirir, sonra implementasyonu mevcut `main` uzerinde yapar. Branch/worktree yalniz gercek ihtiyac varsa acilir ve ayni isin kapanisinda kapatilir. Kullanici acikca istemedikce yeni session, alt task veya paralel worktree acilmaz.

ROADMAP sirasi ana omurgadir: 1, 2, 3 diye ilerlenir. BACKLOG maddeleri her an alinabilir, ancak varsayilan olarak sirayi bozmaz; yalniz ilgili kapinin icinde dogal olarak gerekiyorsa veya kullanici acikca "araya al" derse aktif ise cekilir.

Zamanlama takvim tarihi degil, kapilara baglidir:

| Faz | Pratik hedef |
|---|---|
| Simdi | BL-064/068 ve 2026-09-15 turunda belge uzlastirma, BL-069 lease, BL-036 dar performans, BL-039 state ve BL-049/050 rules/defaults yerel kabulü tamam. Siradaki BL-038 templates -> BL-037 export v2; acik urun secimleri bekleniyor. Guncel kanit ve checkpoint siniri WORK'te. |
| Hemen sonra | Requests/Line Up/employee Shift Hub; Time Tracking/clock-in gorunurlugu MVP sonrasi sinirina gore temizlenir. |
| Sonraki | Requests/Line Up/employee Shift Hub ve Notifications/Announcements kapilari. |
| MVP oncesi buyuk kapanis | Billing/Stripe, BL-067 Schedule hours guardrails ve cok tenantli E2E kabul turu. |

Saglayici anahtar yenileme BL-027 ayri operasyonel takip olarak acik; provider smoke yapmadan once ele alinmali. Bu sira yeni somut bulgu veya kullanici urun onceligiyle degisebilir; kaynak session'in kendi planini tamamlama istegi tek basina sira degistirmez.

## MVP Asamalari

| Asama | Akislar | Kapanis kosulu | Guncel kabul |
|---|---|---|---|
| M0 - Tutarli calisma tabani | Ilgili WIP, sahiplik ve bagimliliklar | Secilen teslimatin kaynak kodu/branch'i, sorumlu session'i ve gerekli calisma ortami belli; unrelated WIP korunmus. Tum repoyu temizlemek her kucuk isin onkosulu degildir. | Ilgili teslimatta kontrol edilecek |
| M1 - Kimlik ve giris | F01 owner ayarlari; F02 davet/aktivasyon; F10 hesap/workspace; F11 Employee Hub | Employer davet eder; dogru employee onboarding'i tamamlayip dogru role/workspace'e girer; workspace degisiminde veri/yetki siniri korunur. | BL-035/051/055 yerel implementasyon ve hedefli kabul checkpoint'i tamamlandi; hosted/destructive/cok-tenant kabul BL-058 ve M5'te acik |
| M2 - Planlama | F04 Schedule; F05 Availability; F09 Important Dates | Manager taslak duzenler/yayinlar; employee dogru yayin sonucunu gorur; guncel availability ve kapali gun kurallari uygulanir. | Bu kurulumda yeniden kabul edilmedi |
| M3 - Calisan talepleri | F06 Time Off; F07 release/cover/swap | Talep, manager karari, bildirim ve son Schedule sorumlulugu tutarli; ilgili ret/iptal davranisi dogru. | Bu kurulumda yeniden kabul edilmedi |
| M4 - Gunluk operasyon ve belgeler | F03 belge/yukumluluk; F08 Line Up | Belge inceleme/yenileme ve employee erisimi tutarli; Line Up yayinli Schedule, replacement, share ve acknowledgement sonucunu korur. | Bu kurulumda yeniden kabul edilmedi |
| M5 - Hedef ortamda teslim | Secilen MVP akislarinin entegrasyonu | Tutarli kod durumu uzerinde gerekli hosted akislar, migration ve saglayici kontrolleri tamamlanir; acik riskler belirtilir, yayin kullanici yetkisi kapsaminda yapilir. | Bu kurulumda yeniden kabul edilmedi |

## Urun Sozlesmeleri

- [Davet/onboarding ve belge yasam dongusu kararlari](../rebuild/employee-invite-onboarding-decisions-2026-09-09.md): son kayitli ilgili urun kararlari; uygulama kaniti degildir.
- [Availability yeniden tasarim spec](../rebuild/availability-redesign-spec-2026-09-08.md) ve [plan](../rebuild/availability-redesign-plan-2026-09-08.md): eski availability audit varsayimlarinin yerine ilgili yeni kararlar okunur. Sadece 7 Eylul handoff'una dayanarak urun modeli secilmez.
- [MVP auditinin tarihli matrisi](../rebuild/mvp-e2e-readiness-audit-plan-2026-09-07.md): F01-F11 envanteri ve gecmis kanit baglantilari; canli durum kaydi degildir.
- [Eski proje referans siniri](../rebuild/handoff-reference.md): eski Newfork'u yeni proje icin otomatik implementasyon kaynagi sayma; sonraki onayli urun planlarini dikkate al.

## Kapsam ve Kabul Disiplini

Bir seferde tek ana teslimat kapatilir. Her asama, gerektiginde kucuk kabul edilebilir islere ayrilir; tum asamayi yeniden yazma veya tum testleri tekrar calistirma zorunlulugu yoktur. Her isin kaniti degisiklik riskine gore secilir.

Account > Documents zorunlu ayri takip teslimidir (BL-001). Gecici onboarding Documents donusu nihai employee UX kabul edilmez. Time tracking/kiosk/payroll/billing icin mevcut ayri planlar ve eski backlog korunur; bu koordinasyon kurulumu bunlari yeni bir implementasyon yetkisi veya tamamlanma iddiasi haline getirmez.

2026-09-10 kullanici kapsam karari: Kiosk, Time Tracking, clock-in/out, break, genis compliance motoru ve payroll MVP sonrasina ertelenir. 2026-09-14 yeni karar: Schedule'a ozel gunluk/haftalik calisma limiti guardrail'leri BL-067 olarak ayri MVP kapisidir; mevcut conflict/drag-drop isine veya timekeeping/payroll hesabina dahil edilmez. MVP oncesi diger ertelenen yuzeylerin yalniz yanlis yerde gorunmesi veya kullaniciyi yanlis aksiyona goturmesi temizlenir. Billing/Stripe ise MVP oncesi ticari kapidir.

2026-09-09 kullanici kapsam karari: Time Entries MVP'ye kadar kapsam disidir. Mevcut sayfa/API kodu korunur; menu girisini yeniden eklemek bu MVP kapanisina dahil edilmez. Kapsam tekrar acildiginda BL-030 okunur. SSN toplama da kullanicinin bilincli karariyla kapsam disidir; eski KMS/SSN akisinin worktree'de bulunmasi onu geri getirme gerekcesi degildir.

ROADMAP yalniz hedef, oncelik veya asama kabul karari degisince guncellenir. Teknik adim gunlugu WORK'tedir.
