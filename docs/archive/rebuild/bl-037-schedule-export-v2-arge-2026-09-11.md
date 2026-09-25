# BL-037 Schedule Export v2 ARGE

Tarih: 2026-09-11  
Durum: ARGE / urun-teknik sozlesme; implementasyon baslamadi.  
Model onerisi: `gpt-5.5`, `medium`. Bu is su anda kod yazmaktan cok urun/teknik karar dokumani ve dar mimari plan; daha yuksek model ancak export v2 implementasyonu veya karmasik format/permission debug asamasinda gerekli olur.

## Kullanici karari

Schedule export mevcut hali patch edilmeyecek. Bu is, mevcut export yuzeyini yamalamak degil, export'u sifirdan yazacakmis gibi yeniden dusunmek ve daha sonra v2 implementasyonuna gecmek icindir.

Mevcut kod yalniz referans ve anti-pattern kaynagi olarak okunur:

- Hangi veri sozlesmeleri halihazirda var?
- Hangi formatlar ve permission noktalarina dokunuyor?
- Bugunku UX neden agir, belirsiz veya kirli?
- Hangi kisimlar MVP disina atilmali?

## Mevcut durum ozeti

Mevcut export kucuk bir buton degil; birden fazla urun davranisini tek akista topluyor.

- Web tarafinda `ScheduleExportDialog`, `ScheduleExportPanel`, `ScheduleExportWorkspaceDialog`, controls, presets, scheduled exports, recent events, preview dialog ve download helper var.
- API tarafinda export preview/download, print HTML, CSV, PDF, XLSX, preset CRUD, scheduled export CRUD, recent events ve cron delivery yuzeyleri var.
- Permission anahtari `schedule.export`.
- Phase 5D eski kararina gore temiz MVP icin asil hedef deterministic schedule-only CSV ve printable HTML idi; scheduled/email export, render worker, logo, localization ve payroll/labor/time-entry domainleri kapsam disiydi.
- Focused test kaniti var: web export/templates testleri 43/43 PASS; API export/cron testleri 19/19 PASS. Bu kanit mevcut kodun bazi sozlesmelerini korudugunu gosterir, fakat kullanicinin tarif ettigi kotu UX ve yeniden kurgulama ihtiyacini kapatmaz.

## Problem tanimi

Bugunku export deneyimi kullanici acisindan profesyonel ve net degil. Butona basinca ne olacagi, hangi formatin dogru oldugu, hangi verinin cikacagi, preview/download ayrimi ve ileri seviye ayarlar fazla karmasik.

MVP icin export, manager'in Schedule sayfasinda hizli ve guvenilir sekilde "bu haftanin kullanilabilir schedule ciktisini aliyorum" hissini vermeli. Export merkezi, otomatik email, preset kutuphanesi veya ileri PDF tasarimi degil.

## V2 urun hedefi

Bir manager/admin/owner:

1. Schedule sayfasinda `Export` butonuna basar.
2. Tek, sade ve ust seviye bir modal acar.
3. Kaynak, lokasyon ve format secimini acik gorur.
4. Gerekiyorsa cok az opsiyon degistirir.
5. Dosyayi indirir veya print/PDF icin tarayici print akisini kullanir.
6. Cikan dosyanin hangi hafta, hangi lokasyon ve hangi veri kapsamini icerdigini dosya adindan ve icerikten anlar.

## MVP v2 kapsam onerisi

Ilk build dar tutulmali:

- Kaynak: yayinlanmis hafta veya adlandirilmis draft. Dirty edit session export edilmez; once save gerekir.
- Tarih kapsami: Schedule'daki aktif hafta.
- Lokasyon kapsami: sayfadaki aktif lokasyon filtresi varsayilan olur; modal icinde net degistirilebilir.
- Formatlar:
  - `CSV`: ilk ve en guvenilir format.
  - `Print / Save as PDF`: tarayici print akisi; render worker yok.
- Varsayilan kolonlar: date, location, employee/open shift, job, shift type, start, end, overnight, hours.
- Opsiyonel kolonlar: labels, notes, open shifts, scheduled hours.
- Privacy: employee email/phone varsayilan olarak yok; eklenmesi ayri kullanici karari gerektirir.
- Empty state: export edilecek shift yoksa bos dosya yerine modalda anlasilir empty state.
- Dosya adi: `schedule-{workspace-slug}-{week-start}-{scope}.{csv|html}`.
- Permission: mevcut `schedule.export` korunur; schedule read yetkisi tek basina export yetkisi sayilmaz.

## MVP v2 disi birakilacaklar

Bu isler v2.1 veya post-MVP olarak ayrilmali:

- Scheduled/email export delivery.
- Export presets kutuphanesi.
- Recent export events paneli.
- XLSX.
- Server-side PDF render worker.
- Logo, brand layout designer, localization matrix.
- Payroll, labor cost, time entry, overtime, tips, compliance alanlari.
- Employee code veya private contact export'u.
- External sharing link.

Gerekce: Bunlar export'u bir ayar merkezine ceviriyor. MVP icin hedef hizli, guvenilir ve okunabilir schedule ciktisi.

## V2 UI sozlesmesi

Tasarim kullaniciyle ayrica konusulacak; burada yalniz davranis sozlesmesi var.

- Export butonu Schedule ust aksiyon alaninda kalir.
- Modal ilk ekranda scroll gerektirmeden ana kararlari gostermeli.
- Primary action `Download CSV` veya secilen formata gore `Open print view` olmali.
- Preview, modal icinde tam tablo iframe'i degil; summary + ilk birkac satirlik kompakt onizleme olabilir.
- Format secimi segmented control olabilir: `CSV`, `Print/PDF`.
- Advanced ayarlar kapali bir bolumde durmali; ilk export icin kullanici ayar okumak zorunda kalmamali.
- Hata metinleri teknik degil, aksiyon odakli olmali: permission, empty, stale draft, source not found, location scope blocked.

## V2 teknik mimari onerisi

Mevcut kodla guvenli gecis icin v2 yanyana kurulacak; eski export tamamen kabulden sonra kaldirilacak.

1. Shared schema
   - `ScheduleExportV2Request`
   - `ScheduleExportV2Projection`
   - `ScheduleExportV2Settings`
   - Eski schema ile karistirmamak icin v2 isimleri kullanilir.

2. API
   - Yeni endpoint onerisi: `POST /v1/workspaces/:workspaceId/schedule/exports/v2`.
   - Ikinci endpoint gerekirse: `POST /v1/workspaces/:workspaceId/schedule/exports/v2/preview`.
   - Permission: `schedule.export`.
   - Tenant, role ve lokasyon scope server tarafinda cozulur.
   - Export source read-model veya dedicated RPC ile tek kanonik projeksiyondan gelir.

3. Renderer
   - Pure function: `buildScheduleExportV2Rows(projection, settings)`.
   - Pure function: `renderScheduleExportV2Csv(rows, settings)`.
   - Print HTML ikinci pure renderer olarak eklenir; PDF engine yok.
   - CSV injection riskine karsi formula-leading hucreler escape edilir.
   - UTF-8 BOM, CRLF ve quote/newline escaping deterministik kalir.

4. Web
   - Yeni sade component: `ScheduleExportV2Dialog`.
   - Mevcut `ScheduleExportDialog/Panel/WorkspaceDialog` patchlenmez; kabul sonrasi silme planina alinabilir.
   - Feature flag veya tek import degisimiyle yeni modal acilir.
   - Eski scheduled/preset state'leri yeni modalin props zincirine tasinmaz.

5. Audit/telemetry
   - MVP icin zorunlu degil.
   - Eger event tutulacaksa sadece export action metadata: actor, workspace, source, week, format, location count. Export icerigi loglanmaz.

## Uygulama sirasi

1. Kullanici kararlarini netlestir.
2. V2 shared schema ve pure CSV renderer yaz.
3. API v2 preview/download endpointini ekle.
4. Sade web modalini ekle; eski export butonunu v2 modaline bagla.
5. Browser'da aktif hafta/lokasyon/draft/published temel UAT yap.
6. Kabulden sonra legacy export UI/API/preset/scheduled yuzeyleri icin silme planini cikar.

## Kullanici karari gereken noktalar

1. Ilk MVP export `CSV + Print/PDF` mi olsun, yoksa sadece CSV ile mi baslayalim?
2. Varsayilan scope sayfadaki aktif lokasyon filtresi mi, yoksa modal her zaman `All locations` ile mi acilsin?
3. Draft export'u MVP'de kalsin mi, yoksa sadece published schedule mi export edilsin?
4. Open/unassigned shifts varsayilan olarak dahil mi olsun?
5. Notes varsayilan olarak kapali mi olsun?
6. Employee email/phone export'u tamamen disari mi atilsin?
7. Weekly employee grid mi, yoksa row-per-shift operasyonel CSV mi asil ciktimiz olsun?

Benim onerim:

- MVP ilk surum: CSV + Print/PDF.
- Varsayilan scope: sayfadaki aktif hafta ve aktif lokasyon filtresi.
- Published + named draft desteklensin; dirty draft export edilmesin.
- Open shifts dahil, notes kapali, contact bilgisi yok.
- CSV ana format row-per-shift olsun; print gorunum insan okunur weekly layout olabilir.

## Kabul kosullari

- Export butonu tiklaninca sade v2 modal gorunur; eski bozuk panel/akordeon deneyimi gorunmez.
- Permission olmayan kullanici export yapamaz.
- Location scope yetkisiz lokasyonlari asla export etmez.
- Published ve named draft source davranisi net hata/empty state verir.
- CSV dosyasi deterministik, acilabilir, escape edilmis ve dogru dosya adiyla iner.
- Print/PDF akisi tarayici print view ile calisir; server render worker gerekmez.
- Schedule sayfasinda console error yok.
- Eski export preset/scheduled export ozellikleri MVP v2 akisini kirletmez.

## Test stratejisi

Asiri test yok; v2 icin bilgi getirisi yuksek hedefli kanit yeterli:

- Shared/API unit: request schema, permission guard, location scope, empty source, row projection.
- Renderer unit: CSV escape, BOM/CRLF, formula injection, overnight, open shift, notes on/off.
- Web focused test: modal default state, format switch, source/scope validation, download action.
- Browser smoke: localhost Schedule -> Export -> CSV download; Print/PDF view acilir.

Broad pgTAP, full app suite veya hosted proof implementasyon bitmeden kosul degil.

## BL-038 templates notu

Kullanici bu turda export'u sifirdan ARGE istedi. Schedule templates ayri backlog maddesi olarak kalir; bu dokuman BL-038'i kapatmaz veya implementasyonunu baslatmaz.
