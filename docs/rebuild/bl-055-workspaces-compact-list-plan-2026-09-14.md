# BL-055 Workspaces Compact List Plani

## Hedef

Account > Workspaces listesini cok workspace'te buton yigini olusturmayan, compact ve profesyonel bir yonetim listesine donustur. Mevcut owner/transfer/closure davranislarini ve API/DB yetki sinirlarini degistirme.

Model: `gpt-5.6-sol`, medium. React/CSS kapsami dar; kosullu owner aksiyonlari, menu erisilebilirligi ve responsive hizalama dikkat gerektirir.

Sahip: local/main task `01a0a24a-5326-7b52-bb0c-ff0682959119`; implementasyon ve yerel kabul tamamlandi, dosya sahipligi ana session'a birakildi.

## Kararlar

1. Mevcut sekmede acik workspace `context.workspace.id` ile belirlenir, ilk sirada kalir; check ikonlu `Current` rozeti ve cok hafif satir zemini kullanir.
2. Diger erisilebilir workspace'lerde compact ikincil `Open` butonu bulunur. `Open` yalniz tab-local context'i degistirir; kalici default workspace'i degistirmez.
3. Her erisilebilir workspace'te tek uc-nokta `Workspace actions` popover'i bulunur. Her rol `Set as default` kullanabilir; `workspace.isActive` kalici default tercihini ifade eder. Owner'a ozel transfer ownership, pending transfer cancel, schedule/cancel closure ve ayirici altinda kirmizi close now ayni menude mevcut lifecycle/pending kosullariyla gosterilir.
4. Gelen ownership transfer istegi action-required oldugu icin listenin ustundeki ayri uyari bandinda Accept/Reject ile gorunur kalir.
5. `Create workspace`, `AccountPageHeader` sag ust action slotuna tasinir. Yalniz erisilebilir en az bir workspace'te active Owner olan hesapta gorunur; Admin/Manager/Employee gormez. Mevcut API/DB owner guard korunur.
6. Create butonu diger sayfa sag-ust aksiyonlariyla ayni sag kenar, dikey hizalama, ikon boslugu ve buton olculerini kullanir. Mobilde header altinda tam genislikte konumlanir.
7. Mobil workspace aksiyonlari desktop ile ayni compact popover'i kullanir. Escape, dis tiklama ve aksiyon secimi menuyu kapatir; odak trigger'a doner ve ayni anda yalniz bir menu acik kalir.
8. Ayrica Account mobil nav tek satir kalir; scrollbar gizlenir ve route degisince aktif sekme gorunur alana otomatik getirilir.

## Billing Siniri

- Workspace ayri company/organization ve ayri billable subscription birimidir.
- Ayni company'nin restoran/subeleri location olarak tek workspace ve tek abonelikte kalir.
- Trial uygunlugu hesap gecmisinden kontrol edilir; kullanilmis trial yeni workspace ile sifirlanmaz.
- Daha once trial kullanilmis ise yeni workspace varsa free planla devam eder veya yeni abonelik gerektirir.
- Billing/Stripe kurulana kadar bu UI isi sahte trial kontrolu eklemez. Gercek provisioning/activation guard'i BL-059'da uygulanir.

## Kabul

- Current-tab/default ayrimi, diger workspace `Open`, tum roller icin default aksiyonu, owner menu gorunurlugu ve lifecycle/pending varyasyonlari focused component testleriyle kanitlanir.
- Menu klavye, Escape, outside-click, focus-return ve destructive item ayrimi test edilir.
- 1440, 1024 ve 390 px'te uzun workspace listesiyle buton yigini, overlap ve yatay tasma olmadigi; Create action koordinati ve mobil aktif nav gorunurlugu browser'da olculur.
- Web typecheck ve scoped diff-check calisir. API/DB/billing degisikligi ve hosted/release iddiasi yoktur.

## Koordinasyon

Gate 4 verification task'i sahipligi biraktiktan sonra ayni local `main` uzerinde uygulandi. Branch/worktree, commit, push veya deploy yapilmadi. Task degisen hunklari, test/browser kanitini, fixture temizligini ve kalan release risklerini ana session'a raporladi.
