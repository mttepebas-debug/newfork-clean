# MVP Roadmap

Guncelleme: 2026-09-10. Sahibi: ana session. Bu belge tek MVP sira/hedef kaynagidir; is durumu [WORK](WORK.md), ertelenen fikirler [BACKLOG](BACKLOG.md) icindedir.

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
| 1 | Calisilabilir ortak temel | BL-026 web typecheck hatalarini dar kapsamda temizle. Kabul: hedeflenen typecheck PASS veya kalan hatalarin bu teslimati engellemedigi kanitli; genis pgTAP/repo audit acilmaz. |
| 2 | Employee temel akisi kabul kapisi | OBS-001'i urun kabulune getir: employee create/invite/access/onboarding profil diliminin patch sahipligi ve gerekli manager browser akisi kapanir. Kabul: create, invite/retry, access state ve tenant-private profil davranisi mevcut UI/API'de dogrulanir. |
| 3 | Availability -> Schedule kabul kapisi | OBS-002'yi kapat: employee preference save -> manager copy/toggle/save -> Schedule/preflight edit-grid donusu ve otomatik bildirim yolu. Kabul: elle inbox projeksiyonu olmadan gerekli bildirim/worker davranisi veya net ortam karari. |
| 4 | Onboarding v1 urun dilimi | OBS-003'ten yalniz dar ilk dilim secilir: yedi-adim kabuk + profil/acil durum alanlari + gerekiyorsa draft/revision. Avatar upload/crop, Documents/Policies ve deadline motoru ayni teslimata katilmaz. |
| 5 | Account > Documents ve policy merkezi | BL-001 zorunlu takip: employee belge merkezi, policy/agreement erisimi, inceleme gecmisi ve yenileme durumlari. Gecici onboarding Documents fallback'i nihai UX sayilmaz. |
| 6 | Schedule/Requests/Line Up MVP kapanislari | M2-M4 icindeki gercek kalan acik kapilar secilerek kapatilir: Schedule publish/preflight, time off/request sonucu, shift exchange/Line Up sorumluluklari, bildirim ve hosted kanitlar. |
| 7 | Release hazirligi | Temiz migration replay, hedef ortam smoke, provider smoke ve kullanici onayli deploy/release kaniti. Yerel PASS tek basina release hazirligi sayilmaz. |

## Yurutme Yapisi

Her teslimat tek kabul kapisidir. Ana session once kabul kosulunu ve dosya/ortam sahipligini netlestirir, sonra implementasyonu mevcut `main` uzerinde yapar. Branch/worktree yalniz gercek ihtiyac varsa acilir ve ayni isin kapanisinda kapatilir. Kullanici acikca istemedikce yeni session, alt task veya paralel worktree acilmaz.

Zamanlama takvim tarihi degil, kapilara baglidir:

| Faz | Pratik hedef |
|---|---|
| Simdi | BL-026 ortak temel. Kucuk ve mekanik kalirsa ayni oturumda kapanir. |
| Hemen sonra | OBS-001 employee kabul kapisi. Kod hazirsa odakli browser/API kanitiyle kapanir; gercek hata cikarsa sadece o hata duzeltilir. |
| Sonraki | OBS-002 availability kabul kapisi. Bildirim/worker ortami asil belirleyici risk. |
| Ardindan | OBS-003'ten ilk onboarding v1 dilimi ve BL-001 Account > Documents. |

Saglayici anahtar yenileme BL-027 ayri operasyonel takip olarak acik; provider smoke yapmadan once ele alinmali. Bu sira yeni somut bulgu veya kullanici urun onceligiyle degisebilir; kaynak session'in kendi planini tamamlama istegi tek basina sira degistirmez.

## MVP Asamalari

| Asama | Akislar | Kapanis kosulu | Guncel kabul |
|---|---|---|---|
| M0 - Tutarli calisma tabani | Ilgili WIP, sahiplik ve bagimliliklar | Secilen teslimatin kaynak kodu/branch'i, sorumlu session'i ve gerekli calisma ortami belli; unrelated WIP korunmus. Tum repoyu temizlemek her kucuk isin onkosulu degildir. | Ilgili teslimatta kontrol edilecek |
| M1 - Kimlik ve giris | F01 owner ayarlari; F02 davet/aktivasyon; F10 hesap/workspace; F11 Employee Hub | Employer davet eder; dogru employee onboarding'i tamamlayip dogru role/workspace'e girer; workspace degisiminde veri/yetki siniri korunur. | Bu kurulumda yeniden kabul edilmedi |
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

2026-09-09 kullanici kapsam karari: Time Entries MVP'ye kadar kapsam disidir. Mevcut sayfa/API kodu korunur; menu girisini yeniden eklemek bu MVP kapanisina dahil edilmez. Kapsam tekrar acildiginda BL-030 okunur. SSN toplama da kullanicinin bilincli karariyla kapsam disidir; eski KMS/SSN akisinin worktree'de bulunmasi onu geri getirme gerekcesi degildir.

ROADMAP yalniz hedef, oncelik veya asama kabul karari degisince guncellenir. Teknik adim gunlugu WORK'tedir.
