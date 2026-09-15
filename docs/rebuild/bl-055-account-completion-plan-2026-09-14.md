# BL-055 Account Completion Plan

## Hedef

BL-055 Account E2E planinda yerel implementasyonu eksik kalan urun sozlesmelerini tamamlamak, hedefli kanit almak ve kullanici UAT'i sonrasi scope kontrollu checkpoint hazirlamak.

Bu plan mevcut C `Soft sections` tasarimini korur. Yeni bir gorsel yon tasarlanmaz. BL-051 ve diger WIP geri alinmaz; ayni dosyaya paralel yazar atanmaz.

## Baslangic Durumu

- Checkout: `main`, tek worktree, local branch `origin/main`den bir commit ileride.
- BL-051 ve BL-055 ayni kirli checkout'ta; ilk BL-055 planindaki "once BL-051 commit/push ile temiz main" sirasi uygulanmadan implementasyona gecilmis.
- Mevcut Account cekirdegi: Profile, Security, Preferences, Notifications, Workspaces, owner identity sync, account deletion/recovery ve C UI yerelde mevcut.
- Hosted migration, gercek provider/inbox ve production cron kaniti yok.

## Yurutme Sirasi

### Gate 0 - Scope ve sahiplik

Sahip: ana session.

1. BL-051, BL-055 ve unrelated WIP dosya/hunk sahipligini koru.
2. Mevcut yesil kaniti gereksiz tekrar etme.
3. Yeni task'lari ayni local checkout'ta sirali calistir; branch/worktree acma.
4. Commit/push'u implementasyon task'larina verme. Son checkpoint ana session tarafindan scope bazli hazirlanacak.

Kabul: tek worktree; aktif tek yazar; WORK ve bu plan guncel.

### Gate 1 - Profile ve avatar sozlesmesi

Sahip: mevcut BL-055 task'i `01a09f9a-28cb-7602-8b5a-50c5ed382a27`.

Model: `gpt-6-astra`, high.

1. Email alanini Profile'dan kaldir; email yalniz Security'de yonetilsin.
2. Global avatar icin kare crop/preview, Replace ve Remove akisini tamamla. Yeni agir kutuphane ekleme; mevcut desenle erisilebilir dialog ve istemci tarafli crop kullan.
3. Etkin avatar onceligini gercek kullanici yuzeyinde bagla: workspace employee photo varsa onu, yoksa global avatar, o da yoksa initials.
4. Account telefonunun employee onboarding'de yalniz bos alana baslangic onerisi oldugunu koru; workspace telefonu sonradan bagimsiz kalmali.
5. Private bucket, mime/size, signed URL ve sahiplik sinirlarini koru.

Kabul: hedefli component/storage testleri; 1440 ve 390 px browser UAT; crop keyboard/focus, replace/remove/fallback ve no-overflow kaniti.

### Gate 2 - Workspaces kullanici akisi

Sahip: Gate 1'i bitiren ayni BL-055 task'i. Gate 1 raporu gelmeden baslamaz.

Model: `gpt-6-astra`, high.

1. Aktif workspace'i ilk sirada ve belirgin tut; diger satirlarin ana aksiyonu `Open` olsun.
2. Create workspace yalniz en az bir mevcut workspace'te Owner olan kullaniciya gorunsun ve C tasarim dilinde dialog acsin. UI ve API/DB yetkisi birlikte fail-closed olsun.
3. Transfer hedefini ham UUID ile girdirmeyi kaldir. Ayni workspace'te active, onboarding-complete, verified-email Admin adaylarini isim/e-posta ile aratan dar bir endpoint/RPC ve secim UI'i kullan.
4. Gonderen Owner kabulden once pending transferi iptal edebilsin. Target icin ust banner; Accept current password, Reject passwordsuz sozlesmesi korunsun.
5. Close now, end-of-period, cancellation ve aktif workspace kapandiktan sonraki yonlendirme korunup hedefli kanitla kapansin.
6. Gelecek billing sinirini bozma: workspace ayri company/organization ve ayri abonelik birimidir; ayni company restoran/subeleri location olarak tek workspace'te kalir. Trial gecmisi hesap duzeyinde kontrol edilir ve kullanilmis trial yeni workspace ile sifirlanmaz. Billing altyapisi kurulana kadar bu gate sahte trial/subscription enforcement eklemez; gercek kontrol BL-059'a aittir.

Kabul: Owner/Admin/Manager/Employee negatif ve pozitif API/SQL testleri; transfer baslat/iptal/accept/reject; tek/cok workspace browser UAT.

### Gate 3 - Account-scoped Notifications

Sahip: ayri local task `01a0a1f6-6321-7d31-85f7-699599b3adbb`. Gate 1-2 tamamlanip ana session review'u yapildiktan sonra baslatildi; Gate 1-2 ile paralel calismaz.

Model: `gpt-6-astra`, high.

1. `account` ve `workspace` notification kapsamlarini veri/API/inbox katmaninda acikca ayir. Global account-security olaylari workspace seciminden bagimsiz gorunsun.
2. Zorunlu global account-security olaylarini backend ve birlesik inbox sozlesmesinde koru; Account > Notifications icinde ayri bir `Account security messages` ayar section'i gosterme.
3. Workspace selector yalniz birden fazla erisilebilir workspace varsa gorunsun.
4. Mevcut category master/mixed/individual/tek Save akisini koru. Unverified veya unavailable email kanalini neden ve Security aksiyonuyla kilitle.
5. Yeni hesapta yalniz action-required email varsayilan acik olsun; mevcut tercihleri additive migration ile koru.
6. Repo producer-katalog matrisi cikar. Yalniz kanitlanan eksik olaylari katalog ve gercek in-app/email outbox akisina bagla; Push, digest ve quiet hours UI'a eklenmez.

Kabul: account/workspace izolasyonu, selector, mandatory global olay, mixed state, email lock/default ve outbox retry testleri; local mail capture ile kontrollu delivery kaniti.

### Gate 3A - Notification ayar satirlari UI

Sahip: ayri local task `01a0a1fe-4b81-7b33-99a3-1b85377ab78a`. Gate 3 ayni sayfa dosyalarini birakip rapor vermeden yalniz read-only inceleme yapar; ana session `GO` verdikten sonra implementasyona gecer.

Model: `gpt-5.6-sol`, medium.

1. Gorunur `Account security messages` section'ini tamamen kaldir; zorunlu global teslimat backend/inbox'ta devam eder.
2. Notification gruplarini sabit `In app` ve `Email` kolonlariyla ayni hizada goster; grup adi ve aciklamasi sol alanda kalir.
3. Her grupta bagimsiz kanal checkbox'lari ve ayri, minimal accordion disclosure kontrolu kullan.
4. Accordion acilinca `Individual notifications` satirlari gorunur; kolon basliklari tekrarlanmaz, bireysel satirlarda yalniz ilgili kanal checkbox'lari hizalanir.
5. Mevcut mixed/master/individual, tek Save, dirty-state, email lock ve payload davranisini koru.

Kabul: desktop/dar viewport browser kaniti; klavye/aria accordion; checkbox ile accordion olaylarinin ayrilmasi; mevcut tercih davranislarinin focused testleri.

### Gate 3B - Account layout tutarliligi

Sahip: ayri local task `01a0a1f8-f70d-7fe3-920f-c3660c24073f`. Notifications task'i ile ayni checkout'ta calistigi icin dosya/hunk sahipligi zorunlu; cakisan alanda implementasyon yapmadan ana session'a rapor verir.

Model: `gpt-6-astra`, high.

1. Account header'ini aktif sayfa iceriginin dogrudan ustune al.
2. Sol menudeki avatar/kimlik alanini onayli C `Soft sections` dili icinde daha belirgin bir section yap.
3. Desktop'ta sol menu sabit kalsin; yalniz aktif sayfa icerigi dikey scroll olsun. Mobil davranisi bozma.
4. Profile, Security, Preferences, Notifications ve Workspaces arasinda icerik sol sinirini ve marginini pixel seviyesinde sabit tut; route degisiminde yatay oynama olmasin.
5. Tekil sayfa iceriklerini yeniden tasarlama.

Kabul: desktop ve dar viewport browser olcumu/gorsel kaniti; route gecislerinde sabit sol koordinat, desktop sticky menu ve overflow kontrolu.

### Gate 4 - Butunlesik yerel kabul ve checkpoint

Sahip: ayri read-only agirlikli verification task'i `01a0a222-09ce-71d3-9dfd-baf097750b95`; bulgu/fix kararini ana session verir.

Model: `gpt-5.6-sol`, medium.

1. 1440, 1024 ve 390 px Account rotalarini kontrol et: hizalar, overflow, klavye, focus, dialoglar ve unsaved Stay/Discard.
2. Profile avatar/phone, Security email/password/session/delete/recovery, Notifications kapsam ve Workspaces transfer/closure akislarindan birer hedefli browser yolunu calistir.
3. Local mail capture ile email-change, deletion recovery ve reminder sinirlarini kontrol et; gercek hesap silme veya hosted veri mutasyonu yapma.
4. Yalniz degisen yuzeylerin test/typecheck/build/SQL kanitini degerlendir; basarili genis suite'leri tekrar kosma.
5. Ana session dosya/hunk sahipligini yeniden kontrol eder, WORK'u gunceller ve BL-051/BL-055 icin scope kontrollu checkpoint hazirlar.

Kabul: local implementasyon/UAT kaniti acik; kalan hosted migration, provider smoke ve production cron release gate olarak ayrilmis; repo WIP'i kaybolmadan checkpointlenmis.

## Hosted Gate

Yerel kabul tamamlanmadan hosted migration/deploy veya production cron etkinlestirilmez. Yerel kapanis sonrasi ana session kullaniciya su uc islemi ayri sunar:

1. Hosted additive migrations.
2. Gercek providerda tek kontrollu email smoke.
3. Production cron/worker gozlemi ve rollback/runbook.

Bu uc kanit alinmadan BL-055 `release-ready` sayilmaz.

## Ilerleme

| Gate | Durum | Son kanit | Sonraki adim |
|---|---|---|---|
| 0 Scope/sahiplik | done | Tek main worktree; BL-051/BL-055/unrelated WIP ayrimi kayitli; task'lar sirali | Ana session her gate raporunda sahipligi yeniden kontrol eder |
| 1 Profile/avatar | implemented; final UAT pending | Email Profile'dan kaldirildi; kare crop/preview ve workspace > global > initials baglandi; account phone yalniz bos workspace phone'a baslangic onerisi. Web 34, API 12, SQL 25 hedefli PASS; typecheck/advisor/diff-check PASS | Authenticated Chrome file chooser izni nedeniyle gercek crop/save/remove browser yolu Gate 4/manual UAT'e tasindi |
| 2 Workspaces | implemented; local UAT passed | Current-tab ve kalici default ayrildi; Current satiri ilk, digerlerinde Open; tum roller icin default ve owner lifecycle aksiyonlari tek accessible menude; owner-only Create header action'inda. Focused web 23/23, web typecheck ve scoped diff-check PASS; 12 disposable workspace ile 1440/1024/390 overflow, menu/focus, create koordinati ve default-vs-current browser kaniti PASS | Gercek destructive transfer/closure ve hosted/release kaniti yapilmadi; billing/trial enforcement BL-059'da |
| 3 Notifications | implemented; final UAT pending | Account notification tablosu self-read RLS ve service-only RPC ile eklendi; global + secili workspace inbox pagination oncesi birlesti; selector/email lock/default ve producer matrisi tamamlandi. SQL 109, API 32, shared 15, web 13 ve browser 19 kontrol PASS; typecheck/advisor/diff-check PASS | Auth mutation-audit arasi atomiklik, external Auth event ingestion, gercek provider ve production cron hosted/release gate'te acik |
| 3A Notification UI | implemented; final UAT pending | Sabit In app/Email matrix, hizali individual checkbox satirlari ve grup satiri metin/bos alanindan acilan klavye/aria accordion tamamlandi; interaktif kontroller disclosure'i tetiklemiyor. Teknik type_key metinleri kullanici adlarina cevrildi. Follow-up focused web 8/8, web typecheck ve scoped diff-check PASS; onceki 1440/390 browser kaniti row-click follow-up'undan once | Row-click davranisinin browser kabulu kullanici karariyla ertelendi; Gate 4'te Account layout ile birlikte son gorsel/davranissal kabul |
| 3B Account layout | implemented; final UAT pending | Header aktif icerik kolonuna tasindi; 230px sticky sidebar, 64px avatar/identity section ve bagimsiz desktop content scroll eklendi. Bes desktop rotada kart x=414 ve ic sayfa x=443: 0px drift; 1024/820/390 yatay overflow yok. Web typecheck, focused header testi ve diff-check PASS | Gate 3/3A son UI entegrasyonu sonrasi Gate 4'te tekrar gorsel kabul |
| 4 Local acceptance | passed with explicit deferrals | Compact follow-up 390px nav scrollbar'ini gizledi ve direct-load/route-change aktif sekme gorunurlugunu browser'da kanitladi. Profile, Preferences, Security, Notifications, Workspaces ve 1440/1024/390 layout yollari hedefli yerel kanitta gecti; disposable fixture'lar temizlendi ve local migration pending 0 | Latest Notifications whole-row click ile alternate-browser phone render manuel UAT'e ertelendi; destructive hesap/workspace ve hosted provider/cron release gate'te acik |
| Hosted release | blocked | Yerel migration ve mock/provider-siz kanit | Local UAT ve kullanici karari sonrasi |

### Gate 1 Raporu

- Yeni self-avatar endpoint/RPC yalniz aktif workspace membership'inin kendi employee kaydini okur; directory izni genisletilmez.
- Global avatar crop'u 512x512 PNG draft uretir ve storage'a yalniz Profile Save ile gider. Private signed URL ve mime/size limitleri korunur.
- Gercek 5555 Profile 1440/390 no-overflow ve signed global avatar browser kaniti alindi. Chrome file chooser engeli nedeniyle gercek authenticated crop/save/remove tiklama zinciri tamamlanmadi; component/harness ve API/SQL kaniti vardir.
- Mevcut genis `employee_onboarding_rls.test.sql` Gate 1 disindaki role/document fixture noktasinda fail; Gate 1 davranislari ayri SQL testinde 11/11 PASS. Bu hata Gate 2 kapsaminda tahminle duzeltilmez.

### Gate 2 Raporu

- Create workspace C dialogu yalniz erisilebilir bir workspace'te active Owner olan hesapta gorunur; API/DB ayni guard'i uygular. Hic workspace'i olmayan self-signup ve incomplete draft reuse yolu korunur.
- Ownership adayi endpoint/RPC'si ayni tenant'ta active Admin, verified email ve tamamlanmis onboarding kosullarini uygular; 2-80 karakter literal arama ve 10 sonuc limiti vardir.
- Transfer initiator cancel, target accept current-password/reject no-password ve kabul aninda eligibility recheck eklendi. Workspace/transfer kilit sirasi race'i serialize eder.
- Web 18, API 44 ve rollback SQL 49 hedefli PASS; web/API typecheck, security advisor ve diff-check PASS.
- Gercek kullanici verisinde transfer veya closure uygulanmadi. Browser akislari production component ve client helper'larla mock harness, backend davranisi rollback SQL/API testleriyle kanitlandi; destructive UAT Gate 4'e kaldi.
