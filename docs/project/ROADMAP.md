# MVP Roadmap

Guncelleme: 2026-09-09. Sahibi: ana session. Bu belge tek MVP sira/hedef kaynagidir; is durumu [WORK](WORK.md), ertelenen fikirler [BACKLOG](BACKLOG.md) icindedir.

## MVP Sonucu

Employer organizasyonu kurar, calisanlari davet eder, Schedule yayinlar ve gunluk personel degisikliklerini yonetir. Employee dogru workspace'e katilir, zorunlu onboarding'i tamamlar, yayinlanmis programi gorur, izin verilen talepleri gonderir ve karar/sonucunu gorur.

Asagidaki sira mevcut [11 akisli MVP audit planindan](../rebuild/mvp-e2e-readiness-audit-plan-2026-09-07.md) alinmistir. Bu kurulum tum akislarin bugunku kod/ortam durumunu yeniden denetlememistir. Onceki local-ready etiketleri buraya guncel kabul olarak tasinmadi. Yeni kullanici teslim onceligi WORK'te kaydedilip bu sirayi gerektiginde gunceller.

## Teslimat Sirasi ve Kabul

2026-09-09: GIT-001 `711da48` checkpoint'i ile tamamlandi; ana checkout temiz olarak dogrulandi. Bu, urun kabul/test/release onayi degildir. Diger branch/worktree/stash ve unutulmus kod tahminle silinmez veya bu checkout'a karistirilmaz.

## Ana Session'in Guncel Yurutme Sirasi

Uc handoff ilerleme/kanit kaynagidir; iclerindeki sonraki adim onerileri baglayici sira degildir. Asagidaki sira ana session'in mevcut checkpoint, kod baglantilari, korunmus worktree farklari ve raporlanan kabul eksiklerini birlikte degerlendirmesidir. M1-M5 urun haritasi korunur; yakin donem is sirasi budur.

| Sira | Teslimat | Neden / bitis kosulu |
|---|---|---|
| 1 | BL-028/029: tasnif ve kaynak/worktree temizligi tamamlandi | Kullanici mevcut uygulama davranisini esas aldi. 34 aday karari ve 13 eski worktree temizligi kapandi; eski WIP yerel arsivde, aktif davranis degismedi. Kanit ve sinirlar WORK'te. |
| 2 | Calisilabilir ortak temel | BL-026'nin bildirilen web derleme hatalarini dar kapsamda ele al; employee/browser kontrolleri icin gerekli rol ve ortam kullanilabilir olsun. Tum pgTAP/repo auditini burada acma. |
| 3 | Mevcut implementasyonlari kabul et | Once OBS-001 employee create/invite/access sonuclarini gerekli manager browser kontroluyle kapat; ardindan OBS-002 employee availability -> manager -> Schedule sonucunu ve gerekli otomatik bildirim isleyisini tamamla. Hazir kaniti tekrar uretme; yalniz gercek kalan riskleri coz. |
| 4 | Bir sonraki yeni urun dilimi | Onboarding yedi-adim kabugu ve ayrilmis profil/acil durum akisinin dar sozlesmesini belirle. Avatar/draft revision veya belge motorunu otomatik ayni teslimata katma. |
| 5 | Belge/policy ve kalici employee belge merkezi | Dinamik yukumluluk, deadline/suspension ve bildirimleri bagimlilik sirasina gore kucuk dilimlere ayir; zorunlu Account > Documents teslimini tamamla. Sonra M2-M5'in gercek kalan eksiklerine devam et. |

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
