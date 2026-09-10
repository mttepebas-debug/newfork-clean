# 4dfb Davranis Farki Tasnifi

Bu belge BL-028'in teknik ciktisidir; durum ve ilerleme [WORK](../project/WORK.md) icinde tutulur. Urun kabul raporu veya worktree silme izni degildir.

## Karsilastirma Siniri

- Ana checkout: `C:/Users/TheWe/Documents/Codex/newfork-clean`, `codex/phase-1-foundation`, kaynak HEAD `fbdcaeaa0eca6b831ba098626b5808c9253f29c6`.
- Eski worktree: `C:/Users/TheWe/.codex/worktrees/4dfb/newfork-clean`, detached HEAD ve ortak taban `415b15f77180fbf2f7aaa1a7a9740d886c86a967`.
- 233 status dosyasi: 137 tracked modified, 96 untracked. Ana checkout ile 112 ayni, 121 farkli; satir sonlari normalize edildi.
- 121 farkin 76'si kaynak/yapilandirma, 45'i test. Eski worktree'nin degisen 20 migration ve 8 dokumaninin tamami ana checkoutta ayni.
- "Ana checkoutta eksik dosya yok" yalniz bu 233 yola aittir. Ortak tabandan ana HEAD'e iki silinmis dosya vardir: `apps/api/src/employees/ssn-encryption.ts` ve testi. Bunlar 4dfb HEADinden degismedigi icin status listesinde yoktur.
- Salt okunur uc yonlu birlestirme simule edildi. `git merge-file -p` yalniz ignored artefakt kopyalarinda calisti; index, branch ve asil dosyalar degismedi.

## Mekanik Kanit

| Sonuc | Dosya | Anlami |
|---|---:|---|
| Ayni icerik | 112 | Yeniden tasinacak dosya farki yok. |
| Farkli ama uc yonlu sonuc ana dosyanin aynisi | 32 | 4dfb'nin tabandan gelen patch'i ana dosyaya yeni metin eklemiyor; tam davranis kabulu anlamina gelmez. |
| Metinsel cakisma | 88 | Add/add dosyalari ve ayni bolgedeki farkli entegrasyonlar dahil; 88 kayip ozellik demek degildir. |
| Cakismasiz ama ek degisiklik | 1 | `useScheduleGridDragControllers.ts`: simule sonuc eski group-drop fonksiyonunu ikinci kez ekliyor. Kayip davranis degil, otomatik merge tuzagi. |

API AST taramasinda eski kaynakta 206, ana kaynakta 237 sabit `get/post/put/patch/delete` route kaydi bulundu; eski method/path ciftlerinden kaybolan yok. Dinamik kayitlar ve runtime erisilebilirlik bu sayimin disindadir. Ayni route adinin bulunmasi ayni davranis demek degildir: emekli SSN/availability endpointleri 410 dondurur.

## Davranis Kararlari

| ID | Eski davranis / fark | Guncel karsilik ve kanit | Bu incelemenin karari |
|---|---|---|---|
| D01 | SSN toplama, KMS bagimliligi ve encryption modulu | Kullanici bu session'da toplamama kararinin kendisine ait oldugunu dogruladi. [Guncel urun karari](employee-invite-onboarding-decisions-2026-09-09.md), bolum 1; `onboarding-routes.ts` SSN icin 410. | Bilincli kaldirilmis; geri getirme. Eski kayitlari topluca silme yetkisi degil. |
| D02 | Onboarding/Employee Hub eski availability yazicilari | `WeeklyPreferencesPanel`, `availability-data.ts`, API weekly routes; eski endpointler `legacyAvailabilityGone`. [Yeni sozlesme](availability-redesign-spec-2026-09-08.md). | Yeni akis karsiligi var; eski dated/windows yazicilarini yeniden baglama. |
| D03 | Availability nedeniyle adayi gizleme veya drag/drop'u kesin engelleme | `shiftEditorEligibility.ts`, `useScheduleGridDragControllers.ts`, `useSingleShiftPointerDrag.ts`, `useScheduleDropReview.ts`; haftalik uyarilar ve gercek assignment blocker'lari ayriliyor. Spec bolum 5. | Guncel sozlesmeyi koru; eski hard-block davranisini geri getirme. |
| D04 | Saati gizlenen vardiyaya 00:00/00:01 uydurma; clipboard saat metadata eksigi | `ShiftQuickEditor.tsx` gercek/snapshot/unresolved saat temeli; `shiftClipboard.ts` time_basis/time_snapshot/time_timezone tasiyor. [Redesign ilerleme](availability-redesign-progress-2026-09-08.md). | Guncel saat modelini koru; eski fallback kodunu tasima. |
| D05 | Kapali gun soft uyarisi icin kullanicinin yazili gerekcesi | Eski editor en az 10 karakter istiyor; guncel editor onay sonrasi `Manager acknowledged schedule warning.` kaydediyor. Guncel test adi `continues closed-day warnings without a written override reason`. Availability gerekce kaldirma karari belgeli, genel kapali gun davranisi ayrica dogrulanmadi. | Kullaniciya soruldu; cevap gelmeden bu davranisi ne geri al ne kesin onaylanmis say. |
| D06 | Tek buyuk LineupPage, dogrudan move endpointi ve eski paylasim | `views/LineupPage.tsx` -> `lineup/LineupWorkspace.tsx`; editor/board/dialogs/placements ayrilmis. `LineupEditor.tsx` preview/proposal/apply; `lineup-data.ts` eski istemci fonksiyonlarini da koruyor. [Line Up tasarimi](lineup-redesign-spec-and-implementation-plan-2026-09-06.md). | Tasinmis/genisletilmis karsilik var. Eski sayfayi veya dogrudan move akisini topluca geri getirme. |
| D07 | Employee Hub overview/team/shift hub/lineup yerel fonksiyonlari | `EmployeeDashboard`, `EmployeeTeamView`, `ShiftExchangeHub`, `EarlierShiftRequests`, `EmployeeLineup` baglantilari mevcut. Eski request gecmisi ayri adapter ile kalmis. | Islev yalniz dosya adina gore kayip sayilamaz; eski monolitik UI'yi tasima. |
| D08 | Aktif hesaba/global workspace secimine bagli yetkilendirme | `auth/workspace-context.ts` hedef workspace, membership/onboarding ve permission yardimcilari; `lib/supabase.ts` tab-local header/sessionStorage; `AuthContext.tsx` tenant query temizligi. [Onboarding plani](onboarding-master-implementation-plan-2026-09-05.md) tab-local karari. | Guncel izolasyon sozlesmesini koru; eski resolver/helper kopyasini tasima. |
| D09 | Hesap profili/tema ve temel workspace listesi | Dirty form senkronizasyonu, telefon, closure/cancel, ownership transfer, account deletion, pending/suspended gorunumleri ekli. WorkspacesPage aktif gorunse de sekme hedefini dogruluyor. | Guncel karsilik mevcut; eski ekranlari ustune yazma. |
| D10 | Calisan save/invite/access/directory baglantilari | Create komutu, retry/revoke ayrimi, avatar, access/unlink/rol, nullable onboarding okuma; app route kayitlari ve `employee-data.ts`. [Guncel urun karari](employee-invite-onboarding-decisions-2026-09-09.md). | Eski hazirlama/access kodunu geri getirme; genis onboarding planinin tamamlandigi iddiasi yok. |
| D11 | Tek tek paste; export ve publication onceki akis | Batch/idempotency, availability review, default hours, publication preflight donusu, document review, Exchange recovery; scheduled export yetki revalidation. | Guncel baglantilari koru; eski loop veya recovery oncesi akisla degistirme. |
| D12 | Ayri Shift Types/Labels menusu ve eski editorler | Shift catalog/tabs, ortak CatalogDrawer/List; default-hours revision korumalari ve kaydetme/degisiklik durumu. [Jobs UI sozlesmesi](jobs-settings-ui-spec.md). | Yeni katalog karsiligi var; eski menu/editor kopyasini tasima. |
| D13 | Important Dates tek location; belge ve imza ayarlari | location_ids, Schedule projeksiyonu, expiry_schedule_impact; signature unpublish/unapprove ekleri; ortak yetki yardimcilari. | Guncel UI/API/kontrat karsiligi var; eski dar payload ile uzerine yazma. |
| D14 | Sidebar mini-calendar | Jobs UI sozlesmesi sidebar calendar kaldirmasini kaydediyor; MiniCalendar ScheduleTopBar icinde bagli. | Kayip takvim motoru degil; sidebar kontrolunu yeniden ekleme. |
| D15 | Manager Time Entries sidebar baglantisi | Sayfa, API ve `App.tsx` route'u mevcut. Kullanici kaldirma kararini hatirlamiyor; bu session'da Time Entries'in MVP'ye kadar kapsam disi oldugunu belirtti. | Kaynaklari koru, bu is kapsaminda menuye geri ekleme. Eski kaldirmanin bilincli oldugu iddiasi yok; kapsam donunce yeniden degerlendir. |
| D16 | Announcements eski durum sekmeleri/editoru; manuel todo yok | Guncel sayfa publish/cancel/save eylemlerini koruyor; cancelled arsiv gorunumu, department/job scope, ortak guvenli action URL. Communication routes/service workspace todo ve checklist ekliyor. | Guncel karsilik var; eski tum sayfayi geri getirme. UI kabulunu bu kaynak incelemesiyle kapatma. |
| D17 | Bildirim platformunun temel worker/katalog/policy/preference akisi | 38 bildirim dosyasi ayni. Farkli worker maintenance/skipped ayrimi; katalog staffing/belge expiry ekleri; UI shift detaylari ve action URL helper; temel preference/policy endpointleri korunmus. | Temel bildirim isi kayip degil. Eski worker/schema kopyasi yeni eventleri geri alir; tasima. Cron config canli teslim kaniti degil. |
| D18 | Ortak schema, fixture ve test farklari | Schema exportlari guncel Time Off/weekly/account/Line Up kontratlariyla genislemis. TS test-basligi taramasi silinen adlari cikardi; SSN, fallback, aday filtreleme, move, dashboard ve onboarding isimlerinin yeni davranis karsiliklari izlendi. SQL degisiklikleri katalog sayilari/yeni fixture/RLS assertionlari iceriyor. | Eski testleri sayisal esitlik icin kopyalama. Baslik korunmasi veya test sayisinin artmasi yeterli kapsam/green kaniti degildir. D05 testi acik kararla birlikte ele alinacak. |
| D19 | Group-drop otomatik birlestirme sonucu | 069 simule patch ayni interface/fonksiyonlari iki kez tanimliyor; ana dosyada tek uygulama var ve warning status destekli. | Simule patch uygulanmaz; kurtarilacak yeni bir group-drop implementasyonu bulunmadi. |

## Kabul ve Koruma Siniri

Bu ilk teknik tasnif, geri tasinmasi gerektigi kanitlanmis bagimsiz bir ozellik belirlemedi. Bu, her satirin tum runtime kosullarinda esdeger oldugu veya 4dfb'nin artik silinebilecegi iddiasi degildir. Metinsel kanit ile davranis kaniti ayri tutulur. D05 acik urun sorusudur; D01 ve D15 yeni kullanici yanitlariyla cozuldu.

Urun kodu/test/migration degistirilmedi, test/DB/browser/provider komutu calistirilmadi. Mevcut PASS sonuclari tekrarlanmadi. Worktree, stash, branch ve arsivler korundu; push/merge/reset/delete yok. Cevaplar sonucu bir duzeltme gerekirse yalniz ilgili davranis ve hedefli dogrulama ele alinacak.

Tek tek 121 dosya karar eslestirmesi ve ham mekanik kanit ignored yerel `artifacts/repo-checkpoint/4dfb-detail/` altindadir: `disposition.md`, `three-way.json`, `contracts.json`, `NNN.diff` ve `three-way/NNN.merge`. Bunlar yeni session'in bastan tum diff'i taramasini onlemek icindir; yerel artefaktlarin varligi dis yedek veya hosted kanit degildir.
