# Arsivdeki 121 Fark: Tarih ve Davranis Karsilastirmasi

## Son Karar: Eski Arsivler Silinecek

2026-09-10 kullanici kalan eski kodun da tamamen silinmesini, mevcut uygulamanin esas alinmasini ve eski kodu arsivde tutmamami istedi. Kalan 114 farkin incelemesi iptal edildi. Silme hedefleri eski worktree kod ZIP'i, eski worktree config ZIP'i ve `artifacts/repo-checkpoint/4dfb-detail` altindaki 560 uretilmis karsilastirma dosyasidir. Guncel kaynak, Git gecmisi ve ana checkout'un ayri `preserved-local` yedegi bu silme kapsamina dahil degildir.

Hedef dizinin workspace altinda oldugu ve reparse point icermedigi dogrulandi; ancak silme komutu ortam politikasi tarafindan calistirilmadan engellendi. **Bu son toplu silme yapilamadi; iki ZIP ve karsilastirma dizini halen duruyor.** Onceki yedi-girdi silme islemi gecerlidir. Guncel durum [WORK BL-033](../project/WORK.md); asagidaki inceleme ve arsiv tutma onerileri tarihsel olup son kullanici kararinin ustune gecmez.

Is kaydi: [WORK BL-031](../project/WORK.md). Karsilastirilan guncel commit: `56b5d8c`. Eski kaynak: korunmus 4dfb ZIP arsivi. Analiz tarihi: 2026-09-09, America/Los_Angeles. Kod/arsiv degistirilmedi.

## Arsiv Guncellemesi: 10 Eylul

Asagidaki analiz 9 Eylul aninin 121-farklik tarihsel kaydidir. Kullanici 10 Eylul'de ekrandaki yedi ornegin eski kaynak kopyalarinin silinmesini istedi. Yalniz asagidaki yedi ana dosyanin ZIP girdisi ile incelemede uretilen 7 diff, 7 `.other` ve 6 `.merge` eski-icerik kopyasi kaldirildi. Bu silme iliskili testleri veya ayni ozelligin tum servis/controller dosyalarini kapsamiyor. Guncel kaynaklar ve Git gecmisi degismedi; `.base`/`.main` karsilastirma tabanlari tarihsel referans olarak durur.

- `apps/web/src/schedule/lib/shiftClipboard.ts`
- `apps/web/src/schedule/lib/shiftEditorEligibility.ts`
- `apps/web/src/settings/ImportantDatesSettingsPage.tsx`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/views/LineupPage.tsx`
- `apps/api/src/schedule/schedule-export-cron.ts`
- `apps/api/src/notifications/notification-outbox-worker.ts`

**Guncel arsiv: 226 girdi = 114 farkli eski dosya + 112 ayni eski dosya.** Kalan 226 girdinin icerigi onceki ZIP ile SHA-256 bazinda birebir dogrulandi. Secilen yedi guncel kaynagin hash'i degismedi. Kaldirma manifesti ignored `artifacts/repo-checkpoint/archive-removals-20260910.json` icindedir. Eski 233/121 sayilari ve asagidaki yedi satirin tarihleri artik tarihsel kayittir, arsivde bulunma iddiasi degildir.

Kalan farklar: Schedule 24; hesap/auth/workspace 16; settings 19; Line Up 5; bildirimler 16; calisan/onboarding 15; communications 8; ortak altyapi 11. Toplam 114, bunlarin 69'u kaynak/yapilandirma, 45'i testtir.

## Sonuc

- 121 yolun **tamami guncel repoda var**. 121'i de arsivdeki icerikten farkli.
- Bu 121 yolun **hicbiri son kaynak temizliginde silinmedi**. Onceki BL-028 inceleme tabani `fbdcaea` ile bugunku `56b5d8c` arasinda bu dosyalarin icerigi degismedi.
- 72 TypeScript kaynagi secilen aktif/public girislerin statik bagimlilik zincirinde. Bu tip importlarini da icerir; her export'un calistigi veya her route'a erisilebildigi kaniti degildir. 45 dosya test; 4 dosya package/lock/deploy/stil dosyasi.
- Onceki 121 dosyalik davranis tasnifi yeniden kullanildi; bu tur tum dosyalarda varlik/icerik/tarih/baglanti yenilendi ve asagidaki yuksek etkili farklar kaynak diff'iyle tekrar izlendi. Her satirin tum kosullarda runtime esdegerligi yeniden test edilmedi.
- **Somut olarak geri alinmasi gerektigi kanitlanmis bir eski davranis bulunmadi.** Bu, 121 dosyanin onemsiz oldugu degil, guncel karsiliklarinin zaten aktif oldugu anlamina gelir. Eski tam dosyalari ustlerine kopyalamak mevcut ilerlemeyi geri alabilir.
- Arsiv tutulur. Yeni davranis istenirse yalniz ilgili eski fikir/hunk guncel sozlesmeye uyarlanir; toplu geri yukleme yok. Bu analiz yeni bir silme veya implementasyon emri degildir.

## Tarihler Ne Soyluyor?

| Tarih kaynagi | Gozlem | Guven siniri |
|---|---|---|
| Eski ortak Git tabani | 2 Eylul 2026, `415b15f` | Worktree'nin baslangic commit'i; 233 WIP dosyasinin yazilma tarihi degil. |
| Arsivde korunmus dosya zamanlari | 2 Eylul: 31 dosya; 3 Eylul: 8; 4 Eylul: 82 | ZIP son-degisiklik metadata'si; kopyalama/checkout da bu zamani belirlemis olabilir. |
| Guncel dosya son-degisiklik zamanlari | 5 Eylul: 18; 6 Eylul: 23; 7 Eylul: 26; 8 Eylul: 35; 9 Eylul: 19 | Dosyanin son kaydi; icindeki her ozelligin o gun yazildigini kanitlamaz. |
| Guncel dosyalarin son Git kaydi | 9 Eylul 2026 toplu checkpoint `711da48` | WIP birlikte commit edildigi icin degisikliklerin ayri yazilma saatini vermiyor. |
| Ilk Git kaydi | Dosya bazinda asagidaki tabloda | Ilk kez bu yolla commit edilme tarihi; commit edilmeden once de var olmus olabilir. |

Ornegin notification worker arsivinde 2 Eylul dosya kaydi varken ilk Git kaydi 9 Eylul olabilir: eski worktree'de untracked olan kod, ana checkout'ta ancak toplu checkpoint'e girmistir. Bu bir tarih celiskisi degildir. Tarihler yonu destekliyor; karar icerik ve baglantiya dayanir.

## Hatirlamayi Kolaylastiran Davranis Farklari

Asagidaki tarihler **karsilastirilan dosyalarin metadata tarihleri**, ozelligin kesin yazilma tarihleri degildir. D kodlari [onceki davranis tasnifine](worktree-4dfb-disposition-2026-09-09.md) baglanir.

| Konu ve tarih izi | Eski icerik | Guncel icerik / nerede etkili | Onem ve onerim |
|---|---|---|---|
| Sekmeye ozel organizasyon: 4 -> 6-7 Eylul (D08) | Ortak aktif workspace secimine dayanan istekler | lib/supabase 6 Eylul: sessionStorage ve workspace header; AuthContext/workspace-context 7 Eylul: hedef workspace ve cache baglantilari | Yuksek. Farkli sekmelerde farkli organizasyon kullanimi icin guncel izolasyonu koru. |
| Tema tercihi: 4 -> 6 Eylul (D09) | Baslangicta alinan tema local state'te kaliyor | PreferencesPage: hesap yenilenince form temizse senkronize olur; kullanici degisikligi dirty ile korunur | Orta. Eski ekran yeni senkronizasyonu geri alir. |
| Calisan create/access: 2-4 -> 9 Eylul (D10) | Daha dar calisan request/directory sozlesmesi | employee-data ve employee-directory service/routes: create komutu, rol/davet/access baglantilari; guncel drawer tarafindan kullaniliyor | Yuksek. Eski dosyayla degistirme; buyuk onboarding planinin tumu tamamlandi iddiasi yok. |
| Availability adaylari: 4 -> 7-8 Eylul (D02/D03) | Availability cakismasi adayi listeden gizleyebiliyor veya drop'u kesin engelliyor | shiftEditorEligibility 7 Eylul ve drag/editor 8 Eylul: review edilebilir aday gizlenmiyor; gercek overlap/duplicate engelleri ayri | Yuksek. Eski hard-block'u geri getirmek son haftalik availability kararini tersine cevirir. |
| Gizli saat ve kopyala-yapistir: 4 -> 7-8 Eylul (D04) | Eski clipboard saat kaynagi/snapshot/timezone alanlarini tasimiyor; eski editor fallback saat uretiyor | shiftClipboard 7 Eylul yeni metadata'yi snapshot ve paste'e tasiyor; ShiftQuickEditor 8 Eylul yeni saat modeline bagli | Yuksek veri butunlugu. Eski kopya guncel vardiyanin saat anlamini kaybettirebilir. |
| Kapali gun gerekcesi: 4 -> 8 Eylul (D05) | En az 10 karakter yazili gerekce | Aktif editor acik onayla devam ediyor; kesin engeller ayri | Kullanici mevcut davranisi secti. Geri alma yok. |
| Line Up: 4 -> 6-9 Eylul (D06) | Buyuk tek sayfa, dogrudan move ve eski share akisi | views/LineupPage 6 Eylul artik LineupWorkspace'i aciyor; LineupEditor/Placements preview/apply kullaniyor. PNG kopyalama/indirme, PDF ve share LineupDialogs'ta bagli; lineup-data 9 Eylul | Yuksek. Sayfanin kuculmesi ozellik kaybi degil. Eski monolit geri yuklenmez. |
| Employee Hub: 4 -> 9 Eylul (D07) | Overview/team/availability/shift request akislari tek sayfada | EmployeeDashboard, EmployeeTeamView, WeeklyPreferencesPanel, ShiftExchangeHub, EarlierShiftRequests ve EmployeeLineup'a yonleniyor | Yuksek. Eski request gecmisi ile yeni exchange ayrimi korunuyor. |
| Otomatik export: 4 -> 5 Eylul (D11) | Vakti gelen export dogrudan isleniyor | schedule-export-cron guncel izin/lokasyon uygunlugunu yeniden kontrol edip uygun olmayan isi skipped sayabiliyor | Yuksek yetki etkisi. Eski worker ek kontrolu kaybettirir. Canli cron kaniti degil. |
| Important Dates: 4 -> 8 Eylul (D13) | Tek location alani | Birden fazla location_ids, eski alan icin uyumluluk okuma ve Schedule cache yenilemesi; guncel settings route'undan aciliyor | Orta-yuksek. Eski form birden fazla lokasyon secimini tasimaz. Bilinen typecheck hatasi ayridir. |
| Kataloglar: 3-4 -> 8 Eylul (D12) | Ayri/eski Shift Labels ve Types editor/menu bicimi | Ortak katalog/tabs/editor desenleri ve guncel varsayilan-saat revision kurallari | Orta. Eski UI dosyasi geri alinmaz; domain kurallari korunur. |
| Duyuru ve gorevler: 4 -> 5-8 Eylul (D16) | Daha dar duyuru/hedef kitle ve eski durum gorunumu | Guncel communication servisleri todo/checklist ve department/job scope; AnnouncementsPage 8 Eylul | Orta-yuksek. Eski tum sayfa yeni sozlesmeyi kaybettirir. |
| Bildirim worker'i: 2 -> 7 Eylul (D17) | Temel outbox isleme sonucu | Guncel worker Exchange maintenance'i batch oncesine ekliyor; processed/skipped ve maintenance hatasi ayri raporlaniyor | Yuksek. Bildirim motoru kayip degil; yeni exchange baglantisi eklenmis. |
| SSN ve menuler: 4 -> 6-9 Eylul (D01/D14/D15) | SSN/KMS bagimliligi, yan menu takvimi ve Time Entries girisi | SSN toplama kapali; takvim ust cubukta; Time Entries sayfa/API var fakat menu MVP disinda | Kullanici kararlari belirleyici. Eski bagimlilik/menu farklari otomatik geri getirilmez. |

### En Cok Dikkat Gerektirenler

Onem sirasi eski dosyayi geri yukleme sirasi degildir:
1. Saat metadata'si, availability ve batch paste: tek eski hunk yeni atama sozlesmesini bozabilir.
2. Workspace/employee yetkilendirmesi ve otomatik export: eski resolver/payload yeni tenant veya yetki kontrolunu atlayabilir.
3. Line Up ve Employee Hub: islevler baska dosyalara tasinmis; bir dosyadaki silinen satir sayisiyla kayip karari verilmez.
4. Bildirimler ve shared schema: tek eski kopya yeni event/payload sozlesmelerini geri alabilir.
5. Test/UI/stil farklari: daha dusuk veya dolayli etki; eski test sayisini esit tutmak icin eski beklenti geri yuklenmez.

## Dosya Bazinda 121 Kayit

Her satirin guncel dosyasi mevcut ve arsiv iceriginden farklidir. Her satir onceki incelemeden beri degismemistir. Tarihler 2026 yilindadir. **Aktif zincir** statik import/public-entry ulasilabilirligidir; tek basina runtime davranis testi degildir. Testler uygulama girisinden calismaz. package.json, pnpm-lock.yaml, vercel.json ve styles.css import grafiginden bagimsiz build/deploy/stil etkisine sahiptir.

### Hesap ve Workspace

Yuksek: tenant secimi, yetki, profil ve hesap islemleri. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/api/src/auth/workspace-context.ts` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/account/PreferencesPage.tsx` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/account/ProfilePage.tsx` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/account/WorkspacesPage.tsx` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/auth/AuthContext.tsx` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/auth/ProtectedRoute.tsx` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/lib/supabase.ts` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/views/SignInPage.tsx` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/views/WorkspacePage.tsx` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `supabase/tests/organization_basics_rls.test.sql` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D08,D09,D18 |
| `supabase/tests/workspace_rls.test.sql` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D08,D09,D18 |
| `apps/api/src/account/workspace-account-routes.test.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D09,D18 |
| `apps/api/src/account/workspace-account-routes.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/api/src/account/workspace-account-service.ts` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D09 |
| `apps/web/src/account/WorkspacesPage.test.tsx` | 2026-09-03 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D09,D18 |
| `apps/web/src/auth/ProtectedRoute.test.tsx` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D09,D18 |
| `apps/web/src/views/OwnerOnboardingPage.test.tsx` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D09,D18 |

### Duyurular ve Gorevler

Orta-yuksek: yayin, hedef kitle ve kullanici gorevleri. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/api/src/communications/communication-routes.ts` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D16 |
| `apps/api/src/communications/communication-service.ts` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D16 |
| `apps/web/src/communications/communications-data.ts` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D16 |
| `apps/web/src/views/AnnouncementsPage.tsx` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D16 |
| `apps/web/src/views/CommunicationPages.test.tsx` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D16,D18 |
| `packages/shared/src/communications.ts` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D16 |
| `supabase/tests/communication_operations.test.sql` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D16,D18 |
| `apps/api/src/communications/communication-service.test.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D16,D18 |

### Calisan ve Onboarding

Yuksek: calisan verisi, davet ve employee erisimi. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/api/src/employee-hub/employee-hub-service.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D02,D07 |
| `apps/web/src/employee-hub/employee-hub-data.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D02,D07,D08 |
| `apps/web/src/employees/EmployeesPage.tsx` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D10 |
| `apps/web/src/employees/employee-data.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D10 |
| `apps/web/src/employees/onboarding-data.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D01,D02,D10 |
| `apps/web/src/schedule/components/ScheduleEmployeeCard.test.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D10,D18 |
| `apps/web/src/schedule/components/ScheduleEmployeeCard.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D10 |
| `apps/web/src/views/EmployeeHubPage.test.tsx` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D02,D07,D18 |
| `apps/web/src/views/EmployeeHubPage.tsx` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D02,D07 |
| `packages/shared/src/employee-hub.ts` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D02,D04,D07 |
| `supabase/tests/employee_directory_rls.test.sql` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D10,D18 |
| `supabase/tests/employee_termination_offboarding.test.sql` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D10,D18 |
| `apps/api/src/employees/employee-directory-routes.test.ts` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D10,D18 |
| `apps/api/src/employees/employee-directory-routes.ts` | 2026-09-02 | 2026-09-09 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D10 |
| `apps/api/src/employees/employee-directory-service.ts` | 2026-09-02 | 2026-09-09 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D10 |

### Line Up

Yuksek: gunluk operasyon, atama ve paylasim. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/api/src/schedule/schedule-lineup-service.ts` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D06 |
| `apps/web/src/schedule/lineup-data.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D06 |
| `apps/web/src/schedule/lineup-share.test.ts` | 2026-09-04 | 2026-09-06 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D06,D18 |
| `apps/web/src/schedule/lineup-share.ts` | 2026-09-04 | 2026-09-06 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D06 |
| `apps/web/src/views/LineupPage.test.tsx` | 2026-09-04 | 2026-09-06 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D06,D18 |
| `apps/web/src/views/LineupPage.tsx` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D06 |

### Bildirimler

Yuksek: teslimat, olay katalogu ve tercih sozlesmesi. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/web/src/views/NotificationsPage.tsx` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D17 |
| `apps/api/src/notifications/notification-outbox-migration.test.ts` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `apps/api/src/notifications/notification-outbox-worker.test.ts` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `apps/api/src/notifications/notification-outbox-worker.ts` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D17 |
| `apps/api/src/notifications/notification-settings-routes.test.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `apps/api/src/notifications/notification-settings-routes.ts` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D17 |
| `apps/web/src/settings/NotificationSettingsNavigation.test.tsx` | 2026-09-03 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `apps/web/src/shell/AppShellNotificationBadge.test.tsx` | 2026-09-03 | 2026-09-09 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D14,D15,D17,D18 |
| `packages/shared/src/notification-catalog.test.ts` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `packages/shared/src/notification-catalog.ts` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D17 |
| `packages/shared/src/notification-display.ts` | 2026-09-02 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D17 |
| `packages/shared/src/notification-settings.test.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `packages/shared/src/notification-settings.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D17 |
| `supabase/tests/notification_outbox_relay.test.sql` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `supabase/tests/notification_platform_core.test.sql` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `supabase/tests/notification_preference_resolver_and_producers.test.sql` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |
| `supabase/tests/notification_settings_admin.test.sql` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D17,D18 |

### Schedule

Yuksek: atama, saat anlami, yayin ve export. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/api/src/schedule/schedule-export-cron.test.ts` | 2026-09-04 | 2026-09-05 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D11,D18 |
| `apps/api/src/schedule/schedule-export-cron.ts` | 2026-09-04 | 2026-09-05 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/api/src/schedule/schedule-service.test.ts` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D11,D18 |
| `apps/api/src/schedule/schedule-service.ts` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/schedule/components/ScheduleGrid.test.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D11,D18 |
| `apps/web/src/schedule/components/ScheduleGrid.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/schedule/components/ScheduleGridBody.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/schedule/components/SchedulePresetRows.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/schedule/components/ScheduleTopBar.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D14 |
| `apps/web/src/schedule/components/ScheduleTotalsRow.tsx` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/schedule/components/ShiftQuickEditor.test.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D04,D05,D18 |
| `apps/web/src/schedule/components/ShiftQuickEditor.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D04,D05 |
| `apps/web/src/schedule/hooks/useCellState.test.ts` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D02,D03,D18 |
| `apps/web/src/schedule/hooks/useCellState.ts` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D02,D03 |
| `apps/web/src/schedule/hooks/useScheduleGridDragControllers.test.ts` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D18 |
| `apps/web/src/schedule/hooks/useScheduleGridDragControllers.ts` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D19 |
| `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.test.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D18 |
| `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.ts` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03 |
| `apps/web/src/schedule/lib/shiftClipboard.test.ts` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D04,D18 |
| `apps/web/src/schedule/lib/shiftClipboard.ts` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D04 |
| `apps/web/src/schedule/lib/shiftEditorEligibility.test.ts` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Test; dogrudan runtime degil | D03,D18 |
| `apps/web/src/schedule/lib/shiftEditorEligibility.ts` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D03 |
| `apps/web/src/schedule/requests-data.ts` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/schedule/schedule-data.ts` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/views/SchedulePage.tsx` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `apps/web/src/views/ScheduleRequestsPage.tsx` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D03,D11 |
| `packages/shared/src/schedule.ts` | 2026-09-04 | 2026-09-07 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D11 |

### Ayarlar

Orta-yuksek: katalog, lokasyon, belge ve yetki sozlesmeleri. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/web/src/settings/GeneralSettingsPage.tsx` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/web/src/settings/ImportantDatesSettingsPage.tsx` | 2026-09-04 | 2026-09-08 | 2026-09-02 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/web/src/settings/SettingsLayout.tsx` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D12 |
| `apps/web/src/settings/documents-data.ts` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/web/src/settings/organization-data.ts` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/web/src/settings/signature-templates-data.ts` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `supabase/tests/document_types_rls.test.sql` | 2026-09-04 | 2026-09-05 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D08,D13,D18 |
| `apps/api/src/settings/document-types-routes.test.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D13,D18 |
| `apps/api/src/settings/document-types-routes.ts` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/api/src/settings/document-types-service.ts` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/api/src/settings/organization-settings-routes.test.ts` | 2026-09-03 | 2026-09-07 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D13,D18 |
| `apps/api/src/settings/organization-settings-routes.ts` | 2026-09-03 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/api/src/settings/organization-settings-service.ts` | 2026-09-03 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/api/src/settings/roles-routes.test.ts` | 2026-09-02 | 2026-09-06 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D13,D18 |
| `apps/api/src/settings/roles-routes.ts` | 2026-09-02 | 2026-09-05 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/api/src/settings/signature-settings-routes.test.ts` | 2026-09-02 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D08,D13,D18 |
| `apps/api/src/settings/signature-settings-routes.ts` | 2026-09-02 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/api/src/settings/signature-settings-service.ts` | 2026-09-02 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D13 |
| `apps/web/src/settings/ShiftLabelsSettingsPage.test.tsx` | 2026-09-03 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Test; dogrudan runtime degil | D12,D18 |
| `apps/web/src/settings/ShiftLabelsSettingsPage.tsx` | 2026-09-03 | 2026-09-08 | 2026-09-09 / 2026-09-09 | Aktif bagimlilik zinciri | D12 |

### Ortak Altyapi

Yuksek: ortak schema, route ve ortam baglantilari. Ayrinti D kodlari yukaridaki davranis gruplari ve onceki rapordadir.

| Dosya | Arsiv dosya tarihi | Guncel dosya tarihi | Ilk / son Git kaydi | Bugunku rol | Davranis |
|---|---|---|---|---|---|
| `apps/api/package.json` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Build/deploy/stil | D01 |
| `apps/api/src/app.test.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D01,D08,D10,D18 |
| `apps/api/src/app.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D01,D08,D10 |
| `apps/web/src/App.test.tsx` | 2026-09-04 | 2026-09-08 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D08,D18 |
| `apps/web/src/App.tsx` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D07,D08,D12,D15 |
| `apps/web/src/shell/AppShell.tsx` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D08,D14,D15,D17 |
| `apps/web/src/styles.css` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Build/deploy/stil | D07,D12,D14,D16 |
| `packages/shared/src/index.test.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Test; dogrudan runtime degil | D02,D08,D10,D13,D18 |
| `packages/shared/src/index.ts` | 2026-09-04 | 2026-09-09 | 2026-08-18 / 2026-09-09 | Aktif bagimlilik zinciri | D02,D08,D10,D13,D18 |
| `pnpm-lock.yaml` | 2026-09-04 | 2026-09-06 | 2026-08-18 / 2026-09-09 | Build/deploy/stil | D01 |
| `vercel.json` | 2026-09-04 | 2026-09-07 | 2026-08-18 / 2026-09-09 | Build/deploy/stil | D17 |

## Kanit ve Sinir

Arsiv ZIP'i degistirilmedi veya yeniden acilan bir worktree'ye tasinmadi. Makine envanteri ignored `artifacts/repo-checkpoint/4dfb-detail/dated-comparison.json` icindedir; tarih ve import analizi mevcut repo/arsivden uretildi. Onceki D01-D19 semantik tasnifinin degismemis dosyalar icin tekrar kullanildigi acikca belirtilmistir. Secilen kritik farklar tekrar kaynakta izlendi; test, DB, browser UAT veya provider smoke calistirilmadi. Typecheck'teki bilinen bes dosya BL-026'da ayri kalir. Bu rapor yeni bir release hazirligi veya tum davranislarin esdegerligi iddiasi degildir.
