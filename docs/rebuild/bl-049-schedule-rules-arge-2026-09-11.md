# BL-049 Settings > Schedule Rules ARGE

Tarih: 2026-09-11  
Durum: ARGE / kabul sozlesmesi; 2026-09-14 kullanici kararlari alindi, dar UI/copy implementasyonuna hazir.  
Model onerisi: `gpt-5.5`, `medium`. Bu tur mevcut ayarlari, gercek baglantilarini ve MVP kararlarini ayirma isi; genis UI redesign veya migration yazimi yok.

## Kullanici baglami

Kullanici Settings > Schedule Rules sayfasini bastan ele almak istiyor:

- Buraya eklenebilecek baska ayarlar var mi?
- Eklenmis ayarlar dogru calisiyor mu?
- UI daha anlasilir hale getirilebilir mi?

Kullanici gorsel/design degisikliklerinde plana dahil olmak istedigini soyledigi icin bu belge implementasyon degil, karar ve kabul zemini olarak tutulur.

## Mevcut sayfa ozeti

Ekran: `apps/web/src/settings/SchedulingSettingsPage.tsx`.

Sayfa su bloklari iceriyor:

1. Schedule temel ayarlari
   - Week starts on: Sunday / Monday
   - Publish by: weekday dropdown
   - Time format: 12-hour / 24-hour
   - Schedule conflicts: Warn / Block
   - Travel between locations: minimum travel minutes 0-240

2. Weekly availability preferences paneli
   - `WeeklyPreferenceSettingsPanel`
   - Availability input mode: time range / shift type
   - Warning policy: warn / confirm
   - Onboarding required toggle
   - Shift-type mode icin default hours guard'lari

3. Hidden/eski availability policy alanlari
   - Shared schema ve DB halen `availability_ownership`, `availability_approval`, `availability_initial_review`, `availability_notice_days`, `availability_enforcement` tasiyor.
   - Testlerde obsolete review controls UI'dan kaldirildigi dogrulaniyor.
   - Bu alanlar availability lifecycle icin DB tarafinda kullaniliyor ama Settings UI'da kullaniciya artik eski sekilde acilmiyor.

## Teknik baglanti ozeti

- API:
  - `GET /v1/workspaces/:workspaceId/scheduling-settings`
  - `PUT /v1/workspaces/:workspaceId/scheduling-settings`
  - Update service `update_scheduling_settings_service` RPC ile atomik yazar.
  - Write permission `workspace.manage`.
  - Route actor/workspace spoof body alanlarini yok sayiyor.

- DB:
  - Ana tablo `workspace_scheduling_settings`.
  - Defaults workspace yaratilirken otomatik olusuyor.
  - `week_start_day` Schedule read/navigation tarafinda kullaniliyor.
  - `schedule_deadline_day` publish deadline/status uyarisina bagli.
  - `conflict_policy` warn/block kararini tasiyor.
  - `time_format` Schedule/Line Up gosterimlerinde kullaniliyor.
  - `minimum_travel_minutes` Line Up staffing ve Shift Hub cover/swap eligibility tarafinda etkin travel buffer.
  - Weekly preference settings ayri RPC ile kendi optimistic revision/idempotency sozlesmesini kullaniyor.

## Mevcut kanit

Kod okuma ve mevcut test kapsamindan gorulenler:

- `SchedulingSettingsPage.test.tsx`
  - checklist mode'da week start ve time format explicit secim gerektiriyor.
  - normal settings route prefilled geliyor.
  - weekly policy ayri save ediyor ve schedule settings save'i tetiklemiyor.
  - obsolete availability review controls artik UI'da yok.
  - weekly settings server deny durumunda read-only oluyor.
  - minimum travel minutes bos/gecersiz giriste sessizce 0'a dusmuyor.
  - refetch, dirty local scheduling settings'i ezmiyor.
- `organization-settings-routes.test.ts`
  - scheduling settings read/write boundary.
  - workspace.manage requirement.
  - spoofed actor/workspace fields ignored.
  - PT409 transaction conflict mapping.
- `organization-settings-service.test.ts`
  - RPC actor ile cagriliyor.
  - omitted optional fields mevcut policy'i resetlemiyor.
  - invalid minimum travel values write oncesi reddediliyor.

Bu kanit local/focused sozlesme kanitidir; browser UAT veya kullanici kabul kaniti degildir.

## MVP icin urun ayrimi

Schedule Rules sayfasi su sekilde dusunulmeli:

### A. Core Schedule Rules

Bunlar Schedule MVP icin dogrudan gerekli:

- Week start.
- Time format.
- Publish deadline.
- Conflict policy.

### B. Cross-surface operational rules

Bunlar Schedule'a bagli ama sadece Schedule grid degil, employee request/Line Up akislarini da etkiliyor:

- Minimum travel minutes.
- Availability input/preference mode.
- Availability warning/confirmation policy.
- Availability required during onboarding.

### C. Legacy/advanced availability lifecycle

Bunlar MVP'de dikkatli saklanmali veya kullaniciyle ayri karar gerektirir:

- Manager/employee ownership policy.
- Approval scope: none/narrowing/all.
- Initial review.
- Advance notice days.
- Hard/soft availability enforcement.

Mevcut UI bu eski review controls'i gostermiyor; bu iyi bir sadeleştirme. Ancak DB/schema'da durduklari icin ileride Availability kabul kapisinda bilincli ele alinmali.

## Problem adaylari

1. Sayfa ismi "Scheduling" ama altinda availability preference ayarlari da var; kullanici hangi ayarin hangi yuzeyi etkiledigini karistirabilir.
2. `Schedule conflicts` copy'si hangi conflict'leri kapsadigini acik soylemiyor: availability, closed day, required document, overlap ayni policy ile mi davranir?
3. `Publish by` deadline ayari gorsel status warning uretse de, publish'i hard block ediyor mu etmiyor mu kullaniciya net degil.
4. `Travel between locations` Line Up ve Shift Hub'a bagli; Schedule grid uzerinde etkisi sinirli veya dolayli olabilir. Sayfa copy'si bunu acik soyluyor ama konum olarak core schedule rules ile ayni agirlikta.
5. Weekly availability paneli kendi save butonuna sahip; ayni sayfada iki save davranisi var. Test buna guveniyor ama UX olarak kullanici karari gerekebilir.
6. Hidden availability lifecycle alanlari ileride yeniden UI'a alinacaksa Schedule Rules sayfasi fazla genisleyebilir.

## Kullanici karari gereken noktalar

1. Bu sayfanin adi ve yapisi `Scheduling` olarak kalsin mi, yoksa `Schedule Rules` ve `Availability Rules` alt bolumleri net ayrilsin mi?
2. `Publish by` sadece warning/deadline mi, yoksa MVP'de publish icin hard policy olarak kullanilacak mi?
3. `Schedule conflicts` icindeki Warn/Block hangi conflict turlerini kapsamali?
4. Minimum travel minutes bu sayfada kalmali mi, yoksa Shift Hub/Line Up veya staffing rules bolumune mi tasinmali?
5. Weekly availability preference paneli bu sayfada kalacaksa ayni sayfada iki ayri save davranisi kabul mu?
6. Availability ownership/approval/notice gibi advanced policy'ler MVP oncesi tekrar acilacak mi, yoksa post-MVP mi?

Benim onerim:

- Sayfa iki belirgin bolume ayrilsin:
  - `Schedule basics`: week start, time format, publish deadline, conflict policy.
  - `Availability and staffing rules`: weekly availability preferences, minimum travel minutes.
- `Publish by` MVP'de hard block degil, warning/deadline copy'si olarak kalsin.
- Conflict policy'nin kapsami dokumante edilsin; hard conflicts yine her zaman block kalmali.
- Hidden advanced availability lifecycle ayarlari su an UI'a geri alinmasin; Availability kabul kapisinda ayrica konusulsun.
- Iki ayri save kalabilir ama baslik/copy ile ayrim netlestirilmeli.

## Kullanici kararlari - 2026-09-14

Kullanici BL-049 icin asagidaki karar setini onayladi:

1. Sayfa ayni sayfa olarak kalacak ama iki net bolume ayrilacak:
   - `Schedule basics`
   - `Availability and staffing`
2. `Publish by` MVP'de hard block olmayacak; warning/reminder/deadline bilgisi olarak kalacak.
3. Hard conflict'ler her zaman block kalacak; `Schedule conflicts` ayari sadece soft conflict'ler icin Warn/Block davranisini belirleyecek.
4. `Minimum travel minutes` bu sayfada kalacak ama `Availability and staffing` bolumunde konumlanacak.
5. Weekly availability preferences bu sayfada kalacak; kendi ayri save davranisi daha net anlatilacak.
6. Advanced availability lifecycle policy alanlari MVP sonrasina birakilacak; UI'a geri alinmayacak.
7. Deger katacak fikirlerden su uc aday MVP yakin fikir olarak kayitli kalacak:
   - Publish readiness checklist.
   - Open shifts publish warning.
   - Schedule change notice warning.

Bu kararlar genis redesign veya migration izni degildir. Siradaki implementasyon dar tutulacak: bolumleme, baslik/copy netligi, yardim metinleri ve mevcut ayarlarin dogru yerde gorunmesi.

## Deger katabilecek yeni ozellik fikirleri

Bunlar implementasyon karari degil; kullaniciyle birlikte secilecek aday fikirlerdir.

### MVP'ye yakin ve yuksek degerli adaylar

1. **Publish readiness checklist**
   - Publish oncesi ayni yerde sade bir policy listesi: unassigned shifts, missing shift type/default hours, closed day warning, availability conflicts, expired required documents.
   - Deger: manager publish'e basmadan once neyin schedule'i riskli yaptigini tek bakista gorur.
   - Dikkat: yeni conflict engine yazmadan mevcut publish preflight/read-model kanitlarina yaslanmali.

2. **Open shifts publish policy**
   - "Open/unassigned shifts ile publish edilebilir mi?" ayari: allow, warn, block.
   - Deger: farkli isletmelerin schedule yayina alma disiplini degisebilir.
   - MVP onerisi: once warn/block degil, sadece publish preflight'ta net warning olarak basla.

3. **Schedule change notice window**
   - Published schedule uzerinde son dakika degisiklik yaparken warning: "This change is within X hours/days of the shift."
   - Deger: employee tarafinda guven ve operasyon kontrolu.
   - Dikkat: compliance/payroll kurali gibi sunulmamali; sadece product warning.

4. **Publish deadline reminders**
   - `Publish by` ayarina bagli owner/admin/manager reminder notification.
   - Deger: ayar pasif bir tarih olmaktan cikip is akisini destekler.
   - Dikkat: notification platform kapisina bagli; burada sadece policy/config fikri olarak kalmali.

5. **Default schedule view preference**
   - Workspace icin default Schedule view: week/day, location grouping, hide unscheduled default gibi basit tercih.
   - Deger: manager her giriste ayni filtre/layout'i tekrar ayarlamaz.
   - Dikkat: kullanici-specific preference ile workspace-wide setting karistirilmamali.

### Daha buyuk / post-MVP adaylar

6. **Minimum rest gap between shifts**
   - Iki vardiya arasinda minimum dinlenme boslugu warning'i.
   - Deger: yorgunluk ve operasyon kalitesi.
   - Dikkat: compliance gibi davranirsa yuksek risk; post-MVP ve bolgesel hukuk iddiasi olmadan.

7. **Max shift length / max scheduled days warning**
   - Asiri uzun shift veya ust uste gun sayisi icin product warning.
   - Deger: manager hatalarini erken yakalar.
   - Dikkat: payroll/overtime/compliance motoruna donusmemeli.

8. **Location-specific schedule rules**
   - Farkli lokasyonlarda farkli publish deadline, travel buffer veya open-shift policy.
   - Deger: cok lokasyonlu isletmeler icin daha gercekci.
   - Dikkat: settings karmasikligini ciddi artirir; MVP icin global workspace setting yeterli.

9. **Role/job-specific schedule guardrails**
   - Bazi job/role'lar icin daha siki conflict veya open-shift rule.
   - Deger: kritik pozisyonlarda hata azaltir.
   - Dikkat: permissions, jobs ve schedule preflight birbirine daha cok baglanir.

10. **Schedule approval workflow**
   - Manager draft hazirlar, owner/admin onaylar, sonra publish edilir.
   - Deger: buyuk isletmelerde kalite kontrol.
   - Dikkat: MVP icin agir; role/permission ve notification tasarimi ister.

### Benim secim onerim

MVP icin bu sayfaya en iyi deger/karmasiklik orani:

1. Publish readiness checklist.
2. Open shifts publish warning.
3. Schedule change notice warning.
4. Publish deadline reminders, notification kapisi gelince.

Simdilik bunlari ayar olarak hemen eklemek yerine, Schedule publish/preflight deneyiminde gorunur uyari olarak baslatmak daha guvenli olur. Ayara donusturmek icin once gercek kullanimda hangi uyarilarin rahatsiz ettigini gormek gerekir.

## Onaylanan dar implementasyon

1. Baslik/copy sadeleştirme.
2. Sayfayi iki bolume ayirma.
3. `Publish by` ve `Schedule conflicts` icin daha net yardim metinleri.
4. Minimum travel minutes'i staffing/availability bolumune tasima.
5. WeeklyPreference panelinin save davranisini "ayri ayar grubu" olarak daha net gostermek.

Deger fikirleri bu patch'te ayar olarak eklenmeyecek. Publish readiness checklist, open shifts warning ve change notice warning daha sonra Schedule publish/preflight deneyimi icinde ayri kabul kosullariyla ele alinacak.

Kod/model rewrite gerekmez; mevcut API ve DB sozlesmesi korunabilir.

## Kabul kosullari

BL-049 kapanmadan once:

- Kullanici sayfa bolumleme/copy kararlarini onaylar.
- Mevcut ayarlarin hangi yuzeyi etkiledigi dokumante edilir.
- Gerekirse dar UI/copy patch'i yapilir.
- Focused testler:
  - `SchedulingSettingsPage.test.tsx`
  - `organization-settings-routes.test.ts`
  - `organization-settings-service.test.ts`
- Browser UAT:
  - normal settings load
  - scheduling settings save
  - weekly availability settings save
  - invalid minimum travel error
  - iki save davranisinin kullanicida karisik gorunmedigi manuel kontrol

Bu belge BL-049'u kapatmaz; sadece implementasyon oncesi ARGE ve karar zeminidir.
