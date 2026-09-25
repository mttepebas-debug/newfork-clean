# BL-037 — Export v2: onayli sozlesme, teknik plan ve kanit

Karar tarihi: 2026-09-15. Kullanici onaylari: export task `01a0a427-3cff-73e1-83ac-69be6fa9d327`.
Teslimat sahibi: [COORDINATION](../project/COORDINATION.md); guncel durum yalniz [WORK](../project/WORK.md).

Bu belge yeni kararlarin kanonik teknik referansidir. 2026-09-11 ARGE'sindeki CSV odakli teklif, kaynak secici, preset/scheduled-export onerileri bu planin urun sozlesmesi degildir. Eski export motoru gelistirme tabani olarak kullanilmaz; kapsam disi eski kod tahminle silinmez.

## 1. Kilitli urun kararlari

### Kaynak ve etkileşim

- Edit modunda export yok. Export eylemi normal Save draft akisini acar: mevcut draft'i guncelleme veya yeni isimli draft, mevcut isim cakismasi/overwrite ve gecmis tarih kontrolleri korunur. Yalniz basarili kayit sonrasi saved-draft preview ve Export acilir. Iptal/hata edit verisini korur.
- Kaynak aktif saved draft veya published preview'dur. Tarih, daily/weekly, lokasyon/employee/job/shift-type filtreleri, siralama, focus ve gorunurluk gridin kendisinden gelir. Ayri export kaynak/filtre/icerik ayari yok.
- Export viewport ekran goruntusu degildir: filtreyle eslesen tum semantik satir/gunleri kapsar, scroll disindaki veriyi kesmez. Bos kayitli schedule export edilebilir.
- Mevcut Schedule ust toolbar, dropdownlar, Settings, tarih, focus ve navigasyon calismaya devam eder. Mockup'taki basit toolbar uygulamanin toolbar'inin yerine gecmez.
- Panel en soldaki global acilir/kapanir uygulama sidebar'inin yerini alir. Nonmodal: overlay, backdrop, background inert veya focus trap yok. Grid uzerini kapatmaz. Grid disi dismiss davranisi export paneline tiklamayi focus/filtre temizleme saymaz.
- Collapsed sidebar export icin gecici genisler; kapatinca eski nav genisligi geri gelir. Paneli rail'e kucultmek Export'u kapatmaz. Edit'e giris Export'u kapatir, tercihleri silmez.
- Desktop/tablet kapsaminda; mevcut sidebar'in gizlendigi mobil breakpoint'te export yok. User-agent kontrolu yok.
- Export acikken baska draft/published preview'a gecmek paneli veya tercihleri kapatmaz. Yuklenirken cikti eylemleri disabled; yeni preview tamamlaninca kaynak olur. Eski istek sonuclari yeni preview'u ezemez. Baslamis generation tiklama aninin degismez snapshot'ini kullanir.
- Kullanici + workspace bazli, versiyonlu output tercihleri saklanir; schedule kaynagi/filtreler veya ham veri saklanmaz. Reset yalniz output tercihlerini sifirlar; lokasyon kisa adlarini veya grid ayarlarini degistirmez.
- Excel, PDF, PNG esit onemli, bir seferde tek format. Temel ayarlar gorunur, detaylar kapali bolumlerde. Baslangic PDF / Download / yatay birlestir / dikey tek uzun sayfa. Indirme sonrasi panel acik kalir.
- Istege bagli cikti preview'u yeni sekmede; dogrudan indirmek icin preview acmak zorunlu degil. Preview kaynak/ayarlarla guncellenir. Workspace, sign-out veya kaynak disposal eski veriyi gecersiz kilar; URL/storage'a schedule verisi yazilmaz.
- **Browser kabulunde kullaniciya yeni-sekme UX kararini tekrar hatirlat.** Kullanici testten sonra degistirebilir; bu zamanlanmis otomasyon talebi degildir.

### Icerik ve okunabilirlik

- Liste gorunumu yok, yalniz schedule tablo duzeni. Employee kimligi ID'dir; ayni isimli kisiler birlestirilmez. Lokasyonlar arasi ayni employee tek satir grubudur.
- Badge sira: `Shift type–Position`, `Label`, yalniz merged icin `@Location`, `Clock in/out` (planlanan saat). Her bilgi gridin gorunurluk ayarina tabidir; shift'in kendi hidden-time karari da korunur.
- Label yoksa satir yok. Tum label metni, siralama ve gorunur icerik gridin ortak helper sozlesmesini kullanir; yeni grid kararina gore ellipsis/+N kisaltmasi yoktur. Ayri export overflow/filter davranisi icat edilmez; uzun icerik kirilarak badge icinde kalir.
- Ayni gunde birden cok shift kaybolmadan grid sirasi ile stack olur; satir boyu buyur. Merged baslikta secili lokasyon adlari, badge'de lokasyon yer alir.
- Belge basligi workspace + tarih + lokasyonlar + Draft/Published durumunu tasir. Acik renk badge, koyu okunur yazi, belirgin ince grid cizgileri ve rahat padding; gercek app renk anlamlari korunur.
- PDF fontlari embed edilir ve metin secilebilirdir. PNG ayni belge yerlesiminden yuksek cozunurlukte uretilir. Native/browser ekran kirpmasi degildir.

### Download ile Print farki

- Download yatay birlestirme: separate lokasyon gridleri tek belge genisliginde yan yana; merged zaten tek grid. Merged'de anlamsiz yatay kontrol yeni bir davranis yaratmaz; gizlemek disabled gostermekten daha aciktir.
- Download dikey birlestirme: rahat row/badge olculeri korunur, tek uzun sayfa asagi uzar. Iki eksen birlesince gerekirse enine/boyuna buyuyen tek sayfa; zorla minik font/satir yok.
- Yatay kapaliyken lokasyon sayfalari; dikey kapaliyken sabit yukseklik devam sayfalari.
- PNG kalitesi otomatik; kalite secici ve ZIP yok. Birden cok sayfa ayri `_01`, `_02` dosyalari. Browser toplu download engelinde acik mesaj ve tek tek indirme eylemleri.
- Devasa PNG'de guvenli canvas/device limiti asilirsa acik uyari; PDF veya bolme kullanicinin secimiyle. Sessiz kucultme/bolme yok.
- Dosya adi grid lokasyon sirasi ile `Kisa1_Kisa2_TarihAraligi`; tek lokasyonda tek kisa ad.
- Print A4 / US Letter landscape; secim hatirlanir. Sayfada en fazla bir lokasyon. Merged print lokasyonlara ayrilir ve bu acikca anlatilir.
- Weekly'nin 7 gunu bir sayfa genisliginde; employee gruplari sikistirilmeden asagi devam sayfalarina akar, basliklar tekrarlar. Sigabilen employee/multi-shift grubu sayfa ortasinda bolunmez. Tek sayfadan uzun employee icin kontrollu devam stratejisi renderer kabulunde test edilir.
- Daily print sadece secili gundur. Fiziksel printer kaniti halen ayri kabul kapisidir.

### Excel

- Tek `.xlsx`: ilk `Merged`, sonra grid sirasiyla her secili lokasyona sheet, sonra `Veri`.
- Schedule sheet'lerinde employee satirlari, gun sutunlari; her shift ayri alt-satir. Employee adi grubun alt-satirlari boyunca merged. Ayni gun coklu shift kaybi yok.
- Metin sirasi/gorunurluk yukaridaki ortak badge sozlesmesi. Acik dolgu, koyu yazi, gun/employee ayiricilari.
- **Yalniz gun baslik satiri frozen; employee sutunu frozen degil.** Basliklar row1, freeze A2.
- Veri sheet'i gorunur scope'ta shift basina satir; filtrelenebilir tablo. Tarihler gercek Excel date; gorunur baslangic/bitis ayri numeric time hucresi. Gizli label/type/clocks veya ekstra ozel alan sizmaz. Formula injection uretilmez.
- Lokasyon sheet'leri hafta genisligine sigar, asagi devam eder, baslik tekrarlar; merged oncelikle ekran kullanimi icindir.

### Location kisa adi

- Location Settings + ilk kurulum yeni lokasyon yaziminda zorunlu; sonra degistirilebilir. 2–12 harf/sayi/tire, bosluksuz, workspace icinde buyuk/kucuk harften bagimsiz unique.
- Mevcut lokasyonlara otomatik backfill yok, legacy null okuma/gecis destegi var. Export scope'unda eksik kisa ad varsa liste ve yetkili kullaniciya Settings baglantisi; cikti engellenir.
- Kisiye ozel export tercihi degil, ortak lokasyon katalog alanidir. Reset output bunu degistirmez.

### Kapsam disi

E-posta (gelecek fikir), otomasyon/tekrarli gonderim, ZIP, mobil export, liste layout, Templates BL-038, payroll/actual attendance ve bagimsiz temizlik. Commit/push/deploy/hosted migration bu planin otomatik yetkisi degildir.

## 2. Uygulama dilimleri ve kabul kapilari

Zorluk: yuksek. Model/muhakeme onerisi: gpt-6-astra, high; kaynak tutarliligi, editor yasam dongusu, permission ve uc renderer birden cok domain sozlesmesini etkiliyor. Yeni task/alt-agent acilmaz.

1. **Temel sozlesme:** eklemeli short-name migration/read/write/UI; grid helper'larini kullanan degismez display projection. Legacy read, yeni insert, Unicode/unique/workspace siniri, user-data backfill olmamasi ve gizli alan testleri. Snapshot tek basina permission veya tamamlanmis renderer degildir.
2. **Canli kaynak ve panel:** AppShell sidebar slot; panel state/prefs, Save draft handoff, source request/resolution kimligi, edit/route/workspace cleanup, nonmodal grid etkilesimi. Mevcut top-action outside-click capture Export acikken gridi bloke etmemeli. Preview A->B gecisinde stale sonuc testi zorunlu.
3. **Ureticiler:** legacy motoru import etmeyen ortak belge/layout modeli, font/font-lisans paketi, PDF/PNG/Excel adapter'lari. Kutuphane secimleri paket surumu ve birincil docs ile uygulama aninda dogrulanir; ornek ReportLab/artifact-tool scriptleri production dependency degildir. Agir renderer'lar istege bagli yuklenir.
4. **Yetki ve delivery:** `schedule.export` server'da tekrar kontrol edilir; workspace/location/draft erisimi fail-closed. Data minimization, guvenli filename/sheet adlari, Excel formula guvenligi, object URL cleanup, popup ve coklu download hata UX'i. Preview sekmesi ayni izin/kimlik gecersizlestirme sinirinda.
5. **Kabul:** grid/toolbar/focus/source-switch browser akislari, multi-shift ve 48+ employee, Unicode, hidden alan, bos schedule, merged/separate/daily/weekly, download/print farki ve buyuk-cikti limitleri. Gercek XLSX/PDF/PNG tekrar uretilip dosya ve gorsel kontrol; printer/new-tab UX kullanici kabul kapisi. Local, replay, hosted, release kanitlari ayridir.

## 3. Kanonik yeniden kullanim noktalari

- [snapshot.ts](../../apps/web/src/schedule/export-v2/snapshot.ts): `createScheduleExportSnapshot`; v2 display-only projection, totals/closure/important-day/ghost referanslari. Ortak badge metni [badge-text.ts](../../apps/web/src/schedule/export-v2/badge-text.ts) `exportShiftLines`; grid ile ortak async kaynak [usePreviewSource](../../apps/web/src/schedule/export-v2/usePreviewSource.ts). Son entegrasyon kaniti bolum7'de; onceki dilimlerin sinirlari tarihlidir.
- Grid filtre/siralama/gun/row sozlesmesi: `scheduleFilterModel`, `scheduleEmployeeSort`, `scheduleGridLayout`, `scheduleGridViewModel`; ShiftCard badge helper'lari ve `orderScheduleCellShifts`. Kopya ikinci filtre motoru olusturma.
- [AppShell](../../apps/web/src/shell/AppShell.tsx): sidebar genisligi/collapse kanonik sahibi. CatalogDrawer modal altyapisi export icin kullanilmaz.
- [SchedulePage](../../apps/web/src/views/SchedulePage.tsx): effective preview shifts ve mevcut Save draft collision/recovery akisi; [useScheduleQuery](../../apps/web/src/schedule/hooks/useScheduleQuery.ts) placeholder/loading siniri.
- Kisa ad: [shared schema](../../packages/shared/src/index.ts), [Location Settings](../../apps/web/src/settings/LocationsSettingsPage.tsx), [migration](../../supabase/migrations/20260915224354_schedule_export_location_short_names.sql).

## 4. Kabul edilmis tasarim ornekleri

Bu ornekler repo disi task artifact'leridir; production veya uygulama/browser kabul kaniti degildir. Asagidaki tam yollar 2026-09-15'te dogrulandi. Tasarim kararlarinin tasinabilir kaydi yukaridaki sozlesmedir; uygulama bu demo builder'larini import etmez.

Artifact kok: `C:/Users/TheWe/.codex/visualizations/2026/09/15/01a0a427-3cff-73e1-83ac-69be6fa9d327`.

| Ornek | Kok altindaki yol | Kabul/kanit siniri |
|---|---|---|
| Interaktif coklu shift mockup | `schedule-export-multi-shift.html` | Badge 3/4 satir, multiple shifts, rahat row, mevcut app toolbar'i korunacak |
| Excel | `outputs/01a0a427-3cff-73e1-83ac-69be6fa9d327/MRK_SHL_PRK_2026-09-14_2026-09-20.xlsx` | Kullanici gorsel GO; 28 employee,205 shift;5 sheet; native Excel print UAT yok |
| Download PDF | `output/pdf/MRK_SHL_PRK_2026-09-14_2026-09-20_Download.pdf` | Kullanici GO;930x2975pt tek sayfa, embedded font/secilebilir metin |
| Download PNG | `output/pdf/MRK_SHL_PRK_2026-09-14_2026-09-20_Download.png` | Kullanici GO;2325x7438px;ayni belge |
| A4 / Letter print | `output/pdf/MRK_SHL_PRK_2026-09-14_2026-09-20_Print_A4.pdf`, `..._Print_Letter.pdf` | Kullanici GO;12/14 sayfa;fiziksel printer testi yok |

Ornek SHA-256: mockup `876C8E0AEF43EA8CBC2D8557CA57D1DAFE65DAC2FBBAF68EB0B77C0ABFA10D7D`; XLSX `1A00E1AD2C8175A50325C79FFD67E6557E099CF0888DBE78040086E610EF9700`; Download PDF `E8634900B15522263106EA16D64089206670B8AC4CCA16721C93B4505E8089D6`.

## 5. Tarihli temel-dilim dogrulama kaniti (2026-09-15)

- Focused web29/29 (snapshot13,owner onboarding13,Location Settings3), shared66/66, API19/19; web/API typecheck, web build ve diff-check PASS. Kod/ortam degismedikce mekanik tekrar gerekmiyor.
- Kisa-ad + organization RLS SQL28/28 PASS. Local migration uygulandi; local security advisors bulgu yok. Mevcut kullanici lokasyonlari backfill edilmedi. Seed ve48 SQL fixture dosyasi yeni insert sozlesmesine mekanik uyarlandi, domain beklentileri degistirilmedi.
- Genis49 dosya/1360 assertion SQL kosusu FAIL. Ilk fixture-dedup hatalari duzeltildikten sonra ilgili7 dosya/172 assertion yeniden kosuldu:4 dosya PASS; travel-policy stale conflict-settings ve iki Line Up beklentisi FAIL. Diger eski-domain hatalari genel PASS veya kanitlanmis baseline sayilmaz.
- **Acik kapanis kapilari:** onceki-kod/temiz-fixture ile domain hata ayrimi, tum lokasyon ureticilerinin yeni-insert uyumu, izole clean migration+seed replay. Paylasilan DB resetlenmez; gerekiyorsa kapasite kontrolunden sonra disposable DB kullanilir.
- Bu kanit panel/renderer/browser, hosted veya release-ready kaniti degildir. Stage/commit/push yok. Guncel teslimat durumu WORK'te tutulur.

## 6. Panel ve renderer dilimi — 2026-09-15

### Uygulanan teknik yuzey

- [AppSidebarPanel](../../apps/web/src/shell/AppSidebarPanel.tsx) mevcut AppShell aside'ina nonmodal portal slotu ekler. Normal navigasyonun collapsed durumu korunur; panel kapanisi/route unmount sahipligi temizler. [ExportSettingsPanel](../../apps/web/src/schedule/export-v2/ExportSettingsPanel.tsx) output tercihlerini ve blocked durumlarini gosterir. Bu dilimde SchedulePage'e henuz baglanmadi; uygulamadaki export butonu halen eski akista.
- [preferences](../../apps/web/src/schedule/export-v2/preferences.ts) user/workspace anahtarli version1 output-only schema kullanir; ham source/filter bilgisi saklanmaz. Schema [shared](../../packages/shared/src/schedule-export-v2.ts) paketindedir.
- Renderer bagimliliklari pinli: pdfmake0.3.11, pdfjs-dist6.3.289, ExcelJS4.4.0, @types/pdfmake0.3.3. PDF/PNG/Excel agir motorlari dynamic import ile ayrildi. [badge-text](../../apps/web/src/schedule/export-v2/badge-text.ts) renderer'larin React/grid runtime'ini import etmeden kullandigi ortak metin sirasidir.
- [document](../../apps/web/src/schedule/export-v2/document.ts) ve [pdf](../../apps/web/src/schedule/export-v2/pdf.ts): rahat badge/row, merged baslik, uzun download sayfasi, lokasyon basina print, tekrarlanan baslik. Sabit kagit yuksekliginde pdfmake'in kendi font/yerlesim olcumunden discard edilen probe uretilir. Sigabilen employee gruplari bolunmez; sayfadan buyuk grup shift alt-satirlarina ayrilir. Tek badge dahi sayfadan uzunsa veri kaybeden bos PDF yerine acik hata/uzun Download secenegi verilir.
- [png](../../apps/web/src/schedule/export-v2/png.ts): ayni PDF'nin180 DPI donusumu, sayfa basina canvas ve worker cleanup,16384px/64Mpixel guvenlik siniri. Sinir asilinca sessiz kucultme/split veya kismi sonuc yok. Gercek browser raster/delivery testi henuz yok; adapter testinde PDF.js/canvas mock'lu.
- [excel](../../apps/web/src/schedule/export-v2/excel.ts): Merged + lokasyonlar + Veri, typed date/time, day-row-only freeze, shift subrows/employee merge, acik badge renkleri, guvenli/dedup Unicode sheet adlari, plain-string hucreler, A4/Letter landscape/repeated header. Excel row limitini asan tek badge acik hata verir; kesmez.
- pdfmake paketindeki **gercek TTF name metadata** Roboto Classic/SIL OFL1.1 belirtiyor (eski Roboto Apache deposu bu binary'nin kaniti degil). Copyright+lisans build'e kopyalanan [Roboto-OFL.txt](../../apps/web/public/licenses/Roboto-OFL.txt) icinde; font dosyasi degistirilmedi.

Birincil referanslar: [pdfmake page](https://pdfmake.github.io/docs/0.3/document-definition-object/page/), [tables](https://pdfmake.github.io/docs/0.3/document-definition-object/tables/), [client methods](https://pdfmake.github.io/docs/0.3/getting-started/client-side/methods/), [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [ExcelJS4.4 docs](https://github.com/exceljs/exceljs/tree/v4.4.0), [Roboto Classic OFL](https://github.com/googlefonts/roboto-classic/blob/main/OFL.txt).

### Kanit ve sinirlar

- Son odakli kosu: `pnpm.cmd --filter @newfork/web test src/schedule/export-v2 src/shell/AppSidebarPanel.test.tsx` → **41 PASS / 1 opt-in QA writer SKIP**. QA writer daha once acik artifact klasoru ile calistirildi ve PASS verdi; normal test kosusunda dosya yazmaz.
- Gercek PDF bytes tekrar PDF.js ile acildi:48 employee/144 shift tek uzun sayfa, embedded font, secilebilir Turkce metin, A4/Letter boyutlari, her print sayfasinda tek lokasyon/tekrarlanan header,24-shift oversized employee kayipsiz devam. XLSX bytes ExcelJS ile yeniden acildi: sheet sirasi, merges, freeze, typed dates/clocks, hidden alanlar ve formula-string guvenligi.
- Gercek AppShell + route lifecycle testleri2/2 PASS. Panel/prefs11/11, PNG adapter4/4; bunlar SchedulePage nonmodal/focus/save/source-switch entegrasyonu kaniti degildir.
- Web typecheck ve uygulama build PASS. Renderer'lar henuz entry'ye bagli olmadigindan ayrica uc renderer entry'si ile izole Vite browser bundle build PASS; bu browser runtime testi degildir.
- Sentetik QA PDF'leri artifact kokunde `tmp/pdfs/renderer-v2/export-v2-download-qa.pdf` ve `export-v2-print-qa.pdf`. Download tum uzun sayfa ve Print ilk sayfa Poppler ile rasterize edilip gorsel incelendi: Turkce/font, badge/cizgi/spacing okunur, kesilme gorulmedi. Bunlar production renderer QA ara dosyalari; onceki onayli mockup artifact'lerinin ustune yazilmadi.
- Mevcut App authenticated-shell testi once test env'deki kapali development identity nedeniyle durdu. Yalniz test process'inde `VITE_ALLOW_DEVELOPMENT_IDENTITY=true` ile tekrarlandiginda Schedule grid CSS beklentisinde FAIL: beklenen eski `200px repeat(7,minmax(var(--schedule-day-column-min),1fr))120px`, gercek yeni `minmax(144px,200px) repeat(7,minmax(0,1fr)) minmax(72px,120px)`. Assert degistirilmedi; sibling'in fit-width WIP'iyle birlikte ana session degerlendirmeli. Genel App suite PASS iddiasi yok.
- Schedule gorunurluk sibling task'i son kontrolde idle/completed. Bu dilim SchedulePage, shared styles.css, ScheduleGrid/TopBar veya onun testlerine yazmadi. WORK/REUSE/BACKLOG ana session'a aittir.
- **Acik:** canli preview/source resolution, Save draft→Export handoff, mevcut global outside-click/dismiss capture uyumu, server permission/scope revalidation, new-tab/delivery/object URL disposal, totals/decorations/closure/ghost tam grid parity, browser PNG ve Excel/physical print UAT, SQL baseline ayrimi ve temiz replay. BL-037 tamamlandi/hosted/release-ready degildir; stage/commit/push yok.

## 7. Canli entegrasyon ve kontrollu kabul — 2026-09-15

Bu bolum5/6'nin o tarihte acik kalan entegrasyon maddelerini ilerletir; gecmis kaniti yeniden yazmaz. Branch `main`, baslangic HEAD `a72f58915dcea8c5c5c79a7ecb3f3f9b4defc831`; paylasilan dirty checkout korunuyor. Yeni branch/worktree/agent, stage/commit/push/deploy yok.

### Kaynak, yetki, panel ve delivery

- SchedulePage artik yalniz yeni ExportController/panelini kullanir; legacy export motoru/endpoints/files silinmedi veya patchlenmedi. Mevcut global sidebar'a nonmodal slot, grid/toolbar/filtre etkileşimi, minimize/expand/close ve onceki nav collapse durumu korunur.
- `usePreviewSource` grid ve export icin ayni draft shift okumasini kullanir. Workspace/week/draft/revision/name/model-version/location kimligi; gec A cevabi B'yi geri getirmez, loading/stale/error'da cikti yok. Draft adi revision degismeden degisse de snapshot yenilenir. `useScheduleMode` optimistic null published gecisinin eski draft parametresine dusmesini engeller.
- Edit Export -> mevcut Save draft destination/name/overwrite/retroactive/recovery akisina devir. Basari -> saved draft preview+panel; cancel/failure -> edit working copy, cikti yok. Save-retry intent'i export/publish ayrimini korur; hata sonrasi normal Save menu tekrar acilabilir. Gercek browser'da Save/Publish mutasyonu yapilmadi; entegrasyon testleriyle kanitlandi.
- Yeni `POST /v1/workspaces/:workspaceId/schedule/export-v2/authorize` canonical workspace resolver/`schedule.export`/actor-scoped schedule RPC'lerini kullanir; employee/inactive/onboarding/cross-workspace, location/employee/shift/date scope, draft revision ve short-name kontrolleri fail-closed/no-store. Ghost referanslari ayrica yetkili source-location icinde dogrulanir. Legacy export engine cagrilmaz.
- Download tiklamasi source+output preferences snapshot'ini sabitler; render oncesi ve dosya sunulmadan once authorization. Fallback yeniden indirme de authorize eder. Export/preferences disinda ham schedule/filter/blob URL localStorage'a yazilmaz. Yeni sekme opsiyoneldir; popup blocked acik hata ve direct-download yolunu korur.
- Canli preview eski dosyayi source/prefs degisiminde gizler, loading'de eylemleri kapatir, son kaynagi tekrar authorize/render eder. Close/workspace/user/unmount/pagehide abort+URL revoke+child close; lifecycle testleri bunu kapsar. Clipboard, e-posta, ZIP veya otomasyon eklenmedi.
- Snapshot/renderer totals, closure/important-day basliklari ve separate layout cross-location ghost'larini ortak grid helper'lariyla tasir. Ghost'lar Veri sheet'inde gercek vardiya satiri gibi cogaltilmaz. Display-only kapsam korunur; tum uygulama ikonlari/logo veya ekranin piksel kopyasi oldugu iddiasi yok.

### Yerel kod kaniti

- Son tek odakli kosu: export-v2 + AppSidebarPanel + useScheduleMode + scheduleInteractionTargets -> **10 dosya,70 PASS,1 opt-in QA writer SKIP**. API authorize21 PASS onceki ayni route kodunda; focused shared/API temel kanitlari bolum5'te. Web typecheck ve onceki tam web build PASS; agir renderer chunk'lari lazy.
- App entegrasyonunda6 Export senaryosu ve2 save/recovery senaryosu PASS: nonmodal/Settings, direct double-authorize download, edit-cancel, saved-preview success, preview-switch/prefs ve save-failure/no-output; save-and-publish retry ve keep-editing/reopen-save. **Tek kesintisiz8PASS kosusu degil:** karma kosuda deep-link panel findByRole zaman asimi oldu, ayni test tek basina tekrar PASS. Bir onceki save-failure test sorunu jsdom native dialog `showModal/close` eksikligiydi; diger native-dialog testleriyle ayni shim eklendi.
- Keep-editing test drift'i: HEAD catch zaten publish-menu dismiss signal gonderiyor; eski test menu kendiliginden acik kalir varsayiyordu. Test artik working-copy/Discard'i ve Save menuyu tekrar acip kaydetmeyi dogrular. Account `DUAccount` textContent beklentisi HEAD'deki CurrentUserAvatar'dan gelir; Account urun koduna dokunulmadi. Genel App suite PASS iddiasi yok.
- React lifecycle incelemesi: dynamic renderer import, stable snapshot identity, unmount/stale-request disposal ve user/workspace key siniri korunuyor. `git diff --check` PASS (Windows line-ending uyari metinleri whitespace hatasi degildir).

### Gercek tarayici ve dosya kaniti

- Kullanici acik onayiyla gercek Location Settings'te Palo Alto=PA, San Ramon=SR, Sunnyvale=SV, Meze Kebab=MK kaydedildi; adres/timezone/diger alanlar degistirilmedi. Short-name eksikligi gate'i once gercek browser'da bloke etti, kayittan sonra scope ciktiya acildi.
- Ortak kaynak yazimi durdurulan sinirli pencerede yalniz QA tab98195525/child98195528 kullanildi. Dolu Schedule Excel preview: Merged +4location, vardiya metni ve San Ramon'da Palo Alto `Reference` ghost'lari goruldu. Grid Hide Clock eyleminde eski preview gizlendi/Download disabled oldu, yeni metinden saatler kalkti; ayar geri alindi.
- Gercek PNG preview `complete=true`, **7630x5800px**; gercek PDF Print iframe ve Print butonu hazir. Hafta09-14 ->09-07, ardindan mevcut saved draft'a geciste panel/ayarlar korundu, ayni child yeni hafta/draft ve important-day basligini gosterdi. Yeni draft/Publish/employee mutasyonu yok.
- Minimize/expand, Close -> normal Primary nav restore ve child tab kapanisi browser'da PASS. Test sonunda yalniz QA/child/ara blank tab kapatildi; test output tercihleri varsayilanPDF/download'a alindi. Eski98195506 baska sayfaya gecmisti; kaynagi bilinmeyen etkileşim/HMR bug veya cleanup PASS sayilmadi, o tab ve kullanici98195448 navigate/close/restore edilmedi. Kaynak freeze ana session/Documents'a erken release edildi.
- PDF/PNG/XLSX `Last generated files` UI basari verdi. Agent'in Chrome download event15sn timeout kontrolu ve internal downloads URL policy engeli disk teslimatini dogrulayamadi; workaround denenmedi. **Ardindan kullanici "indirmede sorun yok iniyor basarili bir sekilde" diyerek gercek indirme basarisini teyit etti; indirme kabul kapisi kullanici teyidiyle kapandi.** Bu teyit her format icin ayri agent filesystem/hash testi veya native Excel/print kabul iddiasi degildir; tool timeout urun hatasi sayilmaz.
- Ayrica `supabase/verification/export_v2_renderer_browser.mjs`: ag/API/DB mutasyonu yapmayan sentetik fixture ile mevcut Vite'dan gercek production renderer import; izole Chromium'da PDF/PNG/XLSX/PrintPDF4download dosyasi diske kaydedildi, file magic/hash kontrolu, page errors0. Bu gercek workspace UI kabulunun yerine gecmez.
- Artifact kokundeki `tmp/browser-v2/result.json` ayrintilari: PDF23593byte SHA256 `4917A814032D4831719D75BCDacf8BDD27BDBE97DE26B45FCC9453D85B4A2D61`; PNG585533byte/2275x4885 SHA256 `A52D86FE9958355846E31E968917F9FEAD8F64C9BD6B27C8E608C24037245BEC`; XLSX13886byte SHA256 `B67CB9CF11E3EF1D9FD5A697E1CE4FD7F195ADB38201800B4FC3256B98640747`; PrintPDF30474byte SHA256 `F9BBE97F354073D12944F5643749C01755D2E6BDDD0CC68ABD915B38017E04CE5`.
- Sentetik downloaded PDF Poppler:1 uzun sayfa910x1953.94pt; Print5sayfaA4landscape841.89x595.28pt. PNG tum uzun sayfa ve Print ilk sayfa gorsel incelendi: okunur Turkce/font, badge/cizgi/padding, gozlenen kesilme yok. Bolum6'nin48employee/multi-shift/oversized/Unicode/XLSX roundtrip sinirlari gecerli. Fiziksel printer/native Excel kabul edilmis sayilmaz.

### SQL: regression duzeltmesi, replay ve kesin sinir

- Browser'da Schedule read `permission denied for table locations` **BL037 regresyonuydu**: service_role mevcut column-grant listesi yeni short_name'i icermiyordu. Forward migration [20260916001400](../../supabase/migrations/20260916001400_schedule_export_short_name_read_grant.sql) yalniz `grant select (short_name) on public.locations to service_role`; SHA256 `DE6ED86FED552D70F5CB21E2E0B3B0C42DEFD906C2E9AE5C68D12A4B35641C13`.
- Ana session exact SQL/hash ve negatif/pozitif fixture'i inceleyip **yalniz bu migration'a** ortak localDB izni verdi. Supabase container14db6cdc53a9 kimligi/ledger yapisi dogrulandi; grant+exact version/name/statements ledger insert tek transaction'da; pgrst reload. anon=false/authenticated=true SELECT short_name degismedi; service_role false->true; street_address service_role=false kaldi. BL052 applied count0, genel migration up/reset yok. Schedule restore browser'da PASS, DB penceresi kapatildi.
- `export_v2_replay_local.py` task-owned networknone/noports/nobinds container'da provider schema bootstrap + normalized defaultACL + **262 migration PASS**; shortnames13/13, scoped grant negative/positive5/5 PASS. Ilk fixture container'indaki genis defaultACL permission kaniti kullanilmadi, normalize edilerek yeniden kuruldu. Replay'in icindeki3 BL052 migration bu task'tan BL052 acceptance anlamina gelmez.
- `export_v2_regression_local.py`:49 fixture12PASS/37FAIL, seedFAIL. Kontrollu karsilastirma **HEAD fixture/seed + sadece BL037 short-name trigger/kolonunu ayni snapshot'ta transactionally cikarma**;37 failure+exit ve seed overlapguard hatasi ayni. BL052 ve diger guncel migrations iki tarafta da kalir. **Temiz HEAD baseline degildir; '37si onceden vardi' veya 'genis regression yok' sonucu cikarilamaz.** Yalniz bu kontrollu short-name subtraction fark vermedi. Assertionlar gevsetilmedi; migration/fixture kaynak hashleri unchanged.
- Kanit: `supabase/.temp/bl037-export-replay/result.json` SHA256 `22BBC7FE525C84F18E17FC803EB4F8A0DEA2A84D6E4FA2BEE9B1923266600B47`; `regression-result.json` SHA256 `43A1C71005779A7253226C9CD11F73CE55BB7A5C247238EFD8FAD5270777A01C`. Tekrar uretim scriptleri repoda; temp loglar yerel kanittir.
- Task container4d6d9f1eea137efa4a81155903d7de98d69251b986ca4cd447d4a2d177ec5f02 isim+task/verification labels+network/noports/nobinds dogrulandiktan sonra `docker rm -f -v` ile kaldirildi; sonraki `docker ps -a --filter id=...` bos. Silinen yalniz tekrar uretilebilir gecici testDB/volume; ortakDB, Documents container'i, kullanici verisi ve diger volume'ler korunuyor.

### Kalan kabul / handoff

- Gercek indirme kullanici tarafindan basarili teyit edildi. Native Excel acilis/print ve fiziksel printer sonucu henuz kanitlanmadi. Yeni sekme UX'ini kullaniciyla test edip gerekirse degistirme hatirlatmasi acik; otomasyon kurulmaz.
- Live Save draft/error ve workspace/sign-out/auth-revoke senaryolarinin mutating browser UAT'si yok; focused App/controller/API kaniti ayri belirtilir. Tum grid ozelliklerinde piksel parity veya tum-app regresyon kabul iddiasi yok.
- Clean seed ve genis SQL domain kabul kapilari acik; bu BL037 kontrollu fark kaniti bunlari kapatmaz. Shared dirty WIP/checkpoint ayrisma, hosted/migration/deploy/release kabul ana session sinirinda. BL037'e nihai kullanici GO/release-ready etiketi verilmedi.

## 8. Save-handoff gecikmis cevap duzeltmesi — 2026-09-15

Ana session'in devam talebinde kalanlar ayrildi: gercek kod eksigi olarak asagidaki async save sorunu bulundu; native Excel/fiziksel printer/yeni-sekme UX kullanici kabuludur; genis SQL/seed/hosted/release ayri kapilardir. Kullanici teyitli download kabul kapisi kapali kalir. Yeni urun karari veya tasarim eklenmedi.

- **Somut bulgu:** `saveDraftFromMenu` basarili cevabi context ile koruyordu, gecikmis catch ise expired edit session'da recovery aciyordu. `saveDraftWithRetroactivePrompt` gecikmis cevabi eski past-edit onayina donusturebiliyordu. Bekleyen eski kaydin finally'si yeni kaydin busy/recovery durumunu etkileyebiliyordu.
- **Dar duzeltme:** SchedulePage mevcut mutation identity'sini user/workspace/session/revision iceren memoized nesne olarak kullanir. Arada preview/workspace/session gecisi varsa ayni session ID/revision'a donus eski istegi yeniden gecerli yapmaz. Success/catch/retroactive-confirm/retry-finally/form-finally ayni context sinirini korur; context gecisi eski save/prompt/busy/recovery state'ini temizler. Ayni aktif session'in hata/retry akisina dokunulmaz. StrictMode effect setup/cleanup referansi dogru yeniler.
- **Kaniti once kirmizi:** yalniz test ortaminda bekleyen Save-for-Export istegi sirasinda idle expiry tetiklendi. Network ve retroactive gecikmis rejection testleri duzeltmeden once2FAIL, sonra2PASS. Canli Save/Publish/auth-revoke/sign-out veya veri mutasyonu yapilmadi.
- Son focused save/recovery kosusu7PASS: normal retroactive-confirm, save-and-publish retry, basarili Save->Export, normal save-error/no-output, iki late-error ve eski istegin yeni busy save'i unlock/replace edememesi. Son effect-setup dar duzeltmesinden sonra yalniz3 yeni regression senaryosu tekrar PASS; web typecheck ve scoped diff-check PASS. Retry testinde async act warning raporlandi, assertion hatasi yok. Onceki70PASS ve renderer/browser/DB kanitlari gereksiz tekrar edilmedi; tam App suite/build/hosted PASS iddiasi yok.
- Degisen dosyalar yalniz `apps/web/src/views/SchedulePage.tsx`, ilgili `apps/web/src/App.test.tsx` hunclari ve bu kanit dosyasi. Test harness gercek idle hook'u koruyup sadece onTimeout callback'ini kontrollu tetikler; production icin yeni abstraction/hook eklenmedi. React lifecycle rehberi context dependency/cleanup incelemesinde kullanildi. Preview/new-tab/API authorization tarafinda bu dar incelemede ek uygulanabilir eksik bulunmadi; genel guvenlik auditi iddiasi degildir.
- Kullanici kabul/release sinirlari bolum7 ile ayni. Documents alanlari/shared document contracts/App.tsx/AuthContext/packages-lock, ortak WORK/REUSE degistirilmedi. Browser/tab/server/build/install/DB islemi, stage/commit/push/deploy yok. Bu dilimin kaynak yazimi tamamlandi; sahiplik ana session'a raporla birakilir.

## 9. Yeni grid badge tam-metin uyumu — 2026-09-15

- Badge task'inin kullanici onayli ellipsis/+N kaldirma kararindan sonra dar uyum kontrolu yapildi. REUSE UI-06 ve canli `ShiftCard.formatShiftLabelDisplay` kanonik kaynak: tum trim edilmis label'lar ` · ` ile birlesir. Export snapshot ayni helper'i dogrudan kullandigi icin **production kodu zaten uyumlu**, yeni truncation/overflow motoru eklenmedi.
- `exportShiftLines` tam title/label/location/time degerlerini normal ve ghost icin tasir. PDF `document.badge` tam metni wrap eden stack'e verir; PNG ayni PDF'yi rasterize eder; Excel schedule hucreleri ayni helper'i wrapText ile, Veri sheet'i tam snapshot label'ini kullanir. Excel sheet adinin31karakter siniri badge metni kesme degildir. Asiri uzun row icin mevcut acik-limit hatasi korunur; sessiz clipping eklenmez. Kagit geometrisi grid genisligine zorlanmadi; metin parity kontrolu piksel/ikon kopyalama iddiasi degildir.
- Yalniz `snapshot.test.ts` icindeki iki eski `Opening +1` beklentisi `Opening · Extra` tam icerige guncellendi; ayni testte ghost label parity assertion'i eklendi. Tek hedefli kosu2PASS/13secimdisi; renderer/browser/SQL/genis suite/build tekrar yok. Shared badge/CSS/measurement/Document domain dosyalarina yazilmadi; production Export kodu degismedi.
- Bu dar kontrolde kalan uygulanabilir metin-kesme gap'i bulunmadi. Onceki kullanici kabul/release sinirlari degismedi; kaynak sahipligi ana session'a geri verildi.

## 10. Onayli implementasyon kapanis matrisi — 2026-09-15

**Sonuc: onayli implementasyon tamam.** Bolum1-2 ile bolum7-9 teslimati ve guncel ilgili kaynaklar eslestirildi; bilinen uygulanabilir mevcut-plan kod gap'i kalmadi. Bu bug-free/tum-app/hosted/release-ready iddiasi degildir. Onceki basarili testler, browser ve SQL kosulari tekrarlanmadi; bu dilimde production/test kodu degismedi.

Yeni kullanici kabulü: "gayet duzgun bir sekilde excel preview ve download oluyor. gelistirilecek yerler var ama daha sonra konusuruz bunlari". **Excel preview/download ve ilgili yeni-sekme Excel preview kabulü kapali**; bolum7-9'daki eski acik-kabul listeleri bu teyidi yeniden engel haline getirmez. Gelecek iyilestirmeler icin yeni implementasyon yetkisi yoktur.

| Onayli madde | Kanonik kaynak / mevcut kanit | Kapanis sinifi |
|---|---|---|
| Kisa ad: validation, unique workspace, legacy read, yeni write, eksikte block, filename | `locationShortNameSchema`, LocationsSettingsPage/OwnerOnboardingPage, iki short-name migration; bolum5/7 SQL ve kullanici PA/SR/SV/MK kaydi | Tamam |
| Aktif draft/published, tarih/filtre/focus/gorunurluk/siralama, tum semantik satirlar, degismez snapshot | `usePreviewSource`, `snapshot`, ortak grid helper'lari; bolum7 source-switch/loading/focus/privacy ve gercek hafta/draft kaniti | Tamam |
| Edit'te cikti yok; Save draft success/cancel/error/overwrite/retroactive/retry; stale cevaplar | SchedulePage `openExport`/`saveDraftFromMenu`/mutation identity; bolum7/8 focused entegrasyon ve late-error regression kaniti | Tamam |
| Nonmodal sol sidebar, toolbar/grid acik, collapse/restore, desktop/tablet, output-only prefs/reset | `AppSidebarPanel`, `ExportSettingsPanel`, `preferences`, SchedulePage breakpoint; bolum6/7 panel/prefs ve browser kaniti | Tamam |
| Badge tam metin/label/hidden clocks, multi-shift/employee ID, merged location, totals/closure/ghost | `snapshot` + ortak ShiftCard helper + `badge-text`; bolum7 renderer/parity, bolum9 hedefli2PASS | Tamam |
| PDF/PNG: okunurluk, embedded selectable font, uzun/genis download, sabit sayfa secenegi, raster/limit/noZIP | `document`, `pdf`, `png`, `files`, Roboto-OFL; bolum6/7 gercek bytes/Unicode/48employee/oversized/browserPNG ve gorsel kanit | Tamam |
| Print: A4/Letter, en fazla1location, weekly7gun/daily1gun, rahat employee continuation/repeated headers | `document`/`pdf`/`ExportPreview`; bolum6/7 page geometry ve print-ready kaniti; fiziksel printer alttaki ayri satirda | Tamam (implementasyon) |
| Excel: Merged+location+Veri, shift subrows/employee merges, yalniz gun header freeze, typed/filterable/minimized data | `excel`, `ExportPreview`; bolum6 XLSX roundtrip + bolum7 live sheets + son explicit kullanici Excel preview/download kabulü | Tamam; kullanici kabulü kapali |
| Server scope/permission, click snapshot, lazy engines, guvenli adlar, direct/fallback download, popup/live-tab/abort/URL cleanup | `schedule-export-v2-routes`, `ExportController`, `files`; bolum7 API21/focused lifecycle/live cleanup; gercek indirme kullanici teyitli | Tamam |
| Native Excel uygulamasi, fiziksel printer, mutating live Save/auth UAT | Bolum7'de yapilmadigi acik; ilgili mantik icin mevcut focused kanit var. Kullanici Excel browser kabulü bunlara genisletilmez | Harici kabul; kod gap'i degil |
| Clean seed/genis SQL, tum-app/hosted/migration/deploy/release, shared-WIP checkpoint | Bolum7: replay262/shortnames13/grant5;49fixture12PASS/37FAIL+seedFAIL, kontrollu subtraction cleanHEAD degil; commit/push yok | Harici release kapisi; bu urun implementasyonunu yeniden acmaz |
| Sonradan konusulacak UX/iyilestirmeler; email/recurrence/ZIP/list/mobile/Templates | Kullanici gelecege erteledi; bolum1 kapsam disi. Mevcut-plan icin zorunlu acik urun karari yok | Yeni kullanici karari gerekir; simdi is degil |

Kapanis: mevcut onayli implementasyon icin siradaki yapay kod/test task'i yok. Yalniz bu belge guncellendi; Documents/filtre/badge WIP, WORK/REUSE, DB ve kullanici verisine dokunulmadi. Kaynak sahipligi ana session'a raporla birakilir.

## 11. BL-037-ACCEPT: harici kabul ve release/checkpoint hazirligi — 2026-09-15

Ana session'in yeni, sinirli gorevi: native Excel/fiziksel baski kabulunu planla, mevcut artifactleri yeniden kullan, readonly ortam ve hunk manifesti cikar. **BL-037 implementasyonu DONE kalir.** Excel browser preview/download kullanici kabulü yeniden acilmaz. Yeni tasarim, ozellik veya fix yetkisi yoktur. Zorluk orta; ana session atamasi mevcut task / `gpt-6-astra`, high: ortak WIP ve kanit/sahiplik sinirlarini ayirmak icin; yeni task/agent acilmadi veya model degistirilmedi.

### Sirali kabul plani

1. Mevcut XLSX/PrintPDF artifact hashlerini ve Excel/yazici erisimini kontrol et. Native Excel incelemesi yalniz izole readonly kopyada; kullanici workbook/save/security ayarlari degismez. Arac/kurulum engelinde native PASS uydurma, manuel checklist'e devir.
2. Mevcut PrintPDF'nin temsilci 1-2 sayfasini belirle. Cihaz, kagit ve sayfa araligi kullanici tarafindan onaylanmadan fiziksel print job gonderme. A4/Letter renderer testini tekrar etme.
3. Ana session Documents sahiplik RELEASE'ini ve entegrasyon penceresini verir. O zaman degisen yuzeye gore tek hedefli typecheck/build/entegrasyon kontrolu secilir; bu turda kosulmaz. Release DB gate'leri ayri ele alinir.
4. Ana session ortak WIP hunclarini teslimat gruplarina ayirir, yetkili scoped checkpoint'i planlar. Commit yerel Git kaydi, push uzak repo teslimati, deploy yayina alma olup ayri kapilardir. Bu gorev bunlardan hicbirini baslatmaz.

### Ilk adim: readonly envanter ve artifact reuse

- Checkout `main`, HEAD `a72f58915dcea8c5c5c79a7ecb3f3f9b4defc831`; Documents, filtre/badge, timezone ve Export ortak dirty WIP. Bu turdaki tek repo yazimi bu belgenin bolum11'idir.
- Bolum7 `tmp/browser-v2/xlsx-synthetic-export-v2.xlsx` (13886 byte) ve `print-synthetic-export-v2.pdf` (30474 byte) diskte mevcut; SHA256'lari bolum7 ile yeniden eslesti. Bunlar **gercek production renderer dosyalari / sentetik schedule**, gercek kullanici verisinin indirilen dosyalari olduklari iddia edilmez. Yeniden render/download yapilmadi.
- Izole native hedef: artifact kokundeki `tmp/native-accept-20260915/native-readonly.xlsx`; mevcut XLSX'in byte kopyasi, filesystem readonly. Kaynak artifact degistirilmedi; bu kopya urun teslimati veya yeni XLSX varyanti degil, gecici kabul girdisidir.
- Microsoft Excel kurulu ve iki kullanici Schedule workbook'u Protected View'da acik. Yalniz bir pencerenin erisim durumunun okunmasinda Merged, Meyhouse Palo Alto, Meyhouse San Ramon, Meyhouse Sunnyvale, Meze Kebab ve Veri sekmeleri goruldu. Bu **acik workbook gozlemi**, kontrollu ilk-acilis/no-repair veya typed-data/printsetup kabulü degildir.
- `excel-live-control` / `computer-use` yolu kullanildi. Izole kopyayi acmak icin dosya secici denemesinde once `coordinate input geometry is unavailable`, gozlemli tekrar sonrasi `element ... is not available in cached app state` ve guvenilir olmayan focus sonucu alindi. Dosya adi yazilmadi, hedef workbook acilmadi; Escape ile dialog ve backstage kapatilarak onceki Protected View workbook'una donuldu. Excel process/workbook kapatma, kaydetme veya Enable Editing yok. Bagli Excel session/eklenti/sign-in kapilari gecilmedigi icin document-control cagrisi, COM/alternatif bypass ve ExcelJS native-proof ikamesi yok.
- Yazici envanteri: `EPSON8AB1C2 (ET-5850 Series)` **Offline**. OneNote ve Fax kuyruklari fiziksel kagit kaniti degildir. Driver/varsayilan cihaz/kagit ayari degismedi; job gonderilmedi. Offline bu anin gozlemidir, kalici cihaz arizasi iddiasi degildir.

### Native Excel icin kisa manuel kabul listesi

Kullanici yukaridaki readonly kopyayi Excel'de acabilir; bu dosya sentetik olarak Merged + Merkez + Sahil + Veri icerir. Gercek indirilen PA/SR/SV/MK dosyasinda ise dort lokasyon sekmesi beklenir; iki artifact birbirine karistirilmaz.

- Ilk acilista repair/recovery veya removed-records uyarisi var mi? Protected View mesaji tek basina dosya bozuklugu degildir; korumayi kaldirmak bu kabulun zorunlu adimi degildir.
- Merged ve her lokasyon sheet'i + Veri mevcut mu? Birden fazla vardiya alt satirlarda, employee adi dogru grupta, tam label/Unicode metni okunuyor mu; `####` veya kesilme var mi?
- Schedule sheet'lerinde asagi kayarken yalniz gun baslik satiri sabit mi, employee sutunu yatayda zorunlu sabitlenmiyor mu?
- Veri'de Date gercek tarih, Start/End gercek saat olarak taniniyor ve filtrelenebiliyor mu? Gerekli kontrol dosyayi kaydetmeden yapilir. Snapshot'ta gizlenen alanlar varsa bunlar schedule/Veri'de geri aciga cikmiyor mu? Tum alanlari acik sentetik dosya tek basina hidden-field native kaniti sayilmaz; ilgili otomatik kanit bolum6/7'de kalir.
- Print Preview'da landscape, secilen A4/Letter, tek sayfa genisligi / cok sayfa yuksekligi, tekrarlanan gun basligi ve lokasyon basligi dogru mu? Bu yalniz preview kontrolu, fiziksel baski degildir. Native arac printsetup komutu sunmazsa kullanici gozlemi kullanilir; global print ayari degistirilmez.

Sonuc formatı: dosya adi + Excel surumu + repair var/yok + sheet/metin/freeze/tarih-saat sonucu + varsa problemli hucre veya ekran goruntusu. Canli Excel kontrolune devam istenirse once izole hedef workbook, eklenti ve bagli-session kapilari dogrulanmalidir; kurulum otomatik yapilmaz.

### Fiziksel baski ornegi ve kabul

- Yeniden uretim yok: bolum7'deki `print-synthetic-export-v2.pdf`, **A4 landscape / 5 sayfa**. Ilk deneme aday araligi **1-2**, bir kopya: ilk sayfada baslik/7 gun/multi-shift, ikinci sayfada devam ve tekrar eden baslik kontrolu. Secilen iki sayfanin gercek location/continuation durumu baski oncesi preview'da teyit edilir; bu turda sayfa2 yeniden incelenmedi. Gerekirse ayni dosyadan dogru devam sayfasi secilir, dosya degistirilmez.
- Kullanici karari: fiziksel cihaz online mi, A4 kagit var mi, bu iki sayfa basilabilir mi? Yalniz Letter varsa bu A4 dosyayi otomatik scale ederek Letter urun kabulü sayma; mevcut Letter artifacti sec veya ayri yetkiyle olustur. Letter geometrisinin onceki otomatik kaniti tekrar kosulmaz.
- Kagit kontrolu: kenarda kesilme yok; isim/saat/label/ince cizgiler normal okuma mesafesinde okunuyor; bir sayfada en fazla bir lokasyon ve haftanin 7 gunu; devam sayfasinda dogru lokasyon/gun basligi; shift/employee devaminda kayip veya tekrar yok. Cihaz, kagit, secili sayfalar ve scaling degeri kaydedilir; fiziksel sonucu kullanici bildirir.

### Dar kaynak/hunk ve bagimlilik manifesti

Bu bir stage listesi degildir. Satir numaralari aktif WIP'te kayabilecegi icin sembol/hunk bazli sinir verilir; checkpoint aninda ana session tekrar karsilastirir.

| Grup | Export kapsamindaki kaynak/hunk | Paylasim / disarida kalan |
|---|---|---|
| Export-owned moduller | `apps/web/src/schedule/export-v2/*`; `apps/api/src/schedule/schedule-export-v2-routes{,.test}.ts`; `packages/shared/src/schedule-export-v2.ts` | Renderer/controller/snapshot/preferences ve testleri; bu turda kaynak yazimi yok |
| Sidebar | `apps/web/src/shell/AppSidebarPanel{,.test}.tsx`; AppShell context provider/owner/portal host/collapse hunclari | AppShell tum dosya otomatik sahiplenilmez; nav/Account/Documents degisiklikleri ayri |
| Schedule baglantisi | SchedulePage ExportController/usePreviewSource/snapshot/openExport/save-and-export/mutation-context hunclari; App.test export mocks/idle harness/export+recovery senaryolari; SaveDraftDialog aciklama prop'u | Filtre, badge, diger Save/Publish/Conflict hunclari korunur; eski motor dosyalari silinmez |
| Preview/yetki | `useScheduleMode` optimistic null-draft duzeltmesi ve testi; `schedule-data.authorizeScheduleExportV2`; `schedule-routes` import+register; schedule-service shortNames SELECT/enrichment ve testi | `apps/api/src/app.ts` mevcut diff'i Documents/timezone kaydi, Export kaydi schedule-routes'ta; app.ts Export-only stage'e alinmaz |
| Short-name sozlesmesi | shared index'te locationShortNameSchema, location/scheduleLocation short_name, required input ve export-v2 re-export; `location-short-name.test.ts`; LocationsSettingsPage, organization-data, OwnerOnboardingPage ve ilgili fixture hunclari | shared index Documents lifecycle/access ve IANA timezone dogrulamasi; Locations/Onboarding timezone UI ayni dosyalarda: ayni hunk manuel ayrisma gerektirebilir |
| Migration / fixture | `20260915224354_schedule_export_location_short_names.sql`; `20260916001400_schedule_export_short_name_read_grant.sql`; `location_short_names.test.sql`; seed ve bolum5/7 fixture short_name insert uyarlamalari | BL052 migration/testleri ayri sahibinde. Fixture domain assertionlari Export kapsaminda degistirilmez |
| Paket/lisans | web package: exceljs4.4.0, pdfjs-dist6.3.289, pdfmake0.3.11, @types/pdfmake0.3.3; bunlarin lock dependency closure'u; `public/licenses/Roboto-OFL.txt` | Lock'ta geo-tz8.1.8 ve closure'u diger isindir; API package degisikligi geo-tz/build-copy, Export degil. `public/fonts` Inter/IBM Plex filtre isidir, toplu alinmaz |
| Tekrar uretilebilir kanit | `supabase/verification/export_v2_{replay_local,regression_local}.py`, `export_v2_renderer_browser.mjs`, `fixtures/export_v2_short_name_grant.sql`; bu kanonik belge | temp loglar ve bu turun readonly XLSX kopyasi urun kaynaklari gibi toplu stage edilmez |
| Shared girdiler | snapshot dogrudan ShiftCard format helper'lari, useCellState, filterScheduleModel, scheduleGridLayout/ViewModel/sort/hour totals kullanir | ShiftCard, grid/measurement/filtre ve `styles.css` mevcut hunclari badge/filtre sahipliginde. Export CSS kendi export-v2.css dosyasinda; styles.css bu manifestten Export-owned sayilmaz |

Documents dolayli entegrasyon bagimliligi: shared index, App/PermissionRoute/workspace-context/access, onboarding ve schema/RLS yuzeyleri. Filtre/badge dolaysiz girdidir; tam label parity bolum9'da hedefli dogrulandi. Bunlar ikinci renderer/filter motoru kurma veya sibling hunclarini degistirme yetkisi vermez.

### Kanit gecerliligi ve release engelleri

- Mevcut XLSX/PrintPDF hashleri ayni: eski artifact kaniti kullanilabilir, yeni kodun tamamini kanitlamaz. Bolum8/9 sonrasi dar kanit kendi yuzeyinde gecerli; eski build/focused kosu bugunku ortak WIP icin yeni PASS olarak sunulmaz. Browser preview/download kullanici kabulü kapali kalir.
- Readonly dosya-hash karsilastirmasi: eski replay manifestindeki **262 migration'dan BL052 `20260915235543_bl052_document_lifecycle.sql` degismis; 15 yeni BL052 migration eklenmis** (son gorulen `20260916013848_bl052_document_employee_assignment_preview.sql`). Iki Export migration hash'i eski manifestle ayni. Aktif Documents yazimi nedeniyle bu sayilar envanter anina aittir. Eski262 replay bugunku butun schema icin yeterli degildir; yeni replay bu task'ta baslatilmadi.
- Eski regression raporundaki **49 fixture hash'i ve seed hash'i degismemis**. Ortam/migration seti degistigi icin eski12PASS/37FAIL raporu guncel kosu degildir. Kontrollu subtraction clean HEAD baseline degildi; neden atamasi yapilmaz.
- Onceki rapordan ayrilan engel gruplari: seed availability/shift-hours/time-off guard FAIL; fixture setup'ta workspace-role uyumsuzlugu ve locations workspace FK; schedule overlap/default-hours/Conflict-handling guardlari; employee authorization/lifecycle, notification catalog ve Line Up/availability beklentileri. Bunlar genis release DB gate'inin triage girdisidir, otomatik Export bug'i veya 'hepsi eskiden vardi' iddiasi degildir. Bu gorev fix/SQL rerun acmaz.
- Documents RELEASE + ana session penceresi gelmeden hedefli typecheck/build yok. Sonraki riskli dikişler: shared contract/API route registration; Document access ile Export authorization; Save->preview/export; badge/filter snapshot parity. Mevcut testi yalniz degisen bagimliligin riski gerektiriyorsa sec.
- Hosted hedef/environment/provider/project ve migration/deploy sahibi bu dilim icin teyit edilmedi. Repoda vercel.json bulunmasi hedef secimi veya deploy yetkisi degildir. Ana session kullanicidan/kanonik deployment kaydindan bunu netlestirmeli; sir veya env degeri rapora alinmaz.

| Kabul kapisi | Durum | Sonraki kosul |
|---|---|---|
| Onayli Export implementasyonu / browser preview-download | PASS (mevcut kabul) | Yeniden acilmaz |
| Mevcut artifact reuse + readonly ortam/manifest | PASS | Bu bolum ana session'a handoff |
| Native Excel acilis / gorunur icerik | USER ACCEPTED | Kullanici "Gayet duzgun acildi" teyidi; yeniden soru veya tool-native acilis denemesi yok. Typed cell/freeze/printsetup tek tek dogrulanmis sayilmaz |
| Fiziksel baski | ERTELENDI (PASS degil) | Kullanici su an yaziciya erisemiyor; kayitli cihazlar gecmiste kullanilan cihazlar. Diger kabul/release hazirligini bekletmez; yeni kontrol/kurulum/job/tekrar soru yok |
| Clean seed/genis SQL release kaniti | FAIL (onceki snapshot); guncel durum dogrulanmadi | Ana session ayri triage/replay kapsami belirler |
| Guncel entegre typecheck/build | BLOCKED | Documents RELEASE + ana session kaynak penceresi |
| Scoped commit/push/hosted release | BLOCKED | Ana session hunk/checkpoint karari ve gerekli teslimat yetkisi/hedef bilgisi |

Bu turda test/build/SQL/browser rerun, uygulama kurulumu, print job, DB/migration/hosted degisikligi, stage/commit/push, branch/worktree/stash veya zamanlanmis takip yok. Kullanici workbook'lari/save/security ayarlari korunur. Ana session'a sonraki uygulanabilir kabul adimi icin rapor gonderilir; ortak WORK/REUSE/BACKLOG yazilmaz.

Sonraki kullanici teyidi (ana session aktarimi): indirilen dosyanin bilgisayardaki Excel'de onarim uyarisi, kesilmis yazi veya eksik sekme olmadan acilip acilmadigi sorusuna "Gayet duzgun acildi" yaniti verildi. Native acilis/gorunur icerik kabulü kapandi; yukaridaki ilk envanter/arac engeli ve manuel checklist tarihsel hazirliktir, yeni zorunlu tekrar isi degildir. Bu teyit typed cell/freeze/printsetup kontrollerine veya fiziksel baskiya genisletilmez. Fiziksel baski ertelendi; kalan release/checkpoint Documents RELEASE ve ana session penceresini bekler. Bu guncelleme yalniz belge degisikligidir.
