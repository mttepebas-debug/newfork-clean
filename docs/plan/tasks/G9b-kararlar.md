# G9b — İzni kısaltıp atamak: kararlar (2026-09-29, işçi oturumu nf-db → nf-backend → nf-arayuz)

Dal `task/g9b-shorten-time-off` (taban `task/g9-timeoff-exchange` @78fa6fc3). Migration
`20260929190000_time_off_shortens_for_a_shift.sql`; test `supabase/tests/time_off_shortens_for_a_shift.test.sql`
(30 hücre, ci-green'e eklendi). KK-19'a göre.

## Verilen kararlar
1. **Tek ortak parça:** `app_private.shorten_time_off(actor, w, employee, cut, note, source)`. İznin o saatleri için
   sistemin yazdığı, aynı işlemde onaylanan bir iptal talebi (`time_off_cancellation` + link + parça + `submitted`
   olayı, `apply_time_off_period_decision` ile onay, üst iznin `partially_approved`/`revoked` olayı). Yani çalışanın
   onaylanmış iptaliyle aynı satırlar; `time_off_effective_ranges`'i okuyan her yer (atama tetikleyicisi, takas kabulü,
   aday listesi, önizleme, Schedule uyarıları) kısalmayı aynı anda görür. İkinci bir kısaltma yolu yok.
2. **Yeni çekirdek eylemi açılmadı.** Yöneticinin kısaltması `time_off.decide` ile yetkilenir
   (`authorize_time_off_decision(..., 'shorten')`): izni karara bağlayabilen onu kısaltabilir (bir üst kademe, kendi
   iznini değil). Gerekçe: kısaltma, o iznin iptalini onaylamakla aynı yetki; G7'nin çekirdek gövdelerine ve matrise
   dokunulmadı. Yeni giriş noktası `shorten_time_off_service` kapsama testinde `time_off.decide` olarak sınıflandı.
3. **Rıza yalnız iznin sahibinden, yalnız kendi eylemiyle** (BL-182). Pickup başvurusu, takas açma ve daveti kabul
   anında sorulur; onay sorusu mevcut "yine de devam et" parmak izidir (`availability_warning`), izin saatleri
   parmak izine ve cevaba (`time_off_intervals`) girer. Rıza verilen saatler başvuruda (`time_off_consent`) ya da
   takasın öbür tarafı için talepte (`owner_time_off_consent`) saklanır; aday kontrolü izni yalnız bu saatler için ve
   izin tek engelse geçer. Başvurudan sonra onaylanan yeni izin rıza kapsamında değildir, engel kalır
   (`weekly_exchange_acceptance.test.sql:87-88` bu yüzden değişmedi).
4. **Değişmeyen kilitler:** cover aday listesi, olası alanlara giden bildirim, davet edilecek kişinin kontrolü ve
   yöneticinin Schedule'ı rıza taşımaz: onaylı izinli kişi yine görünmez/yazılamaz (KARARLAR). Üç "kilitleyen" test
   (`weekly_exchange_acceptance:87-88`, `weekly_exchange_changed_terms:116`, `shift_exchanges_v1:170`) rızasız izni
   sınıyor ve yeni kurala uyuyor; değiştirilmedi.
5. **Kısaltma anı (KK-19):** takasta yöneticinin son onayında (iki lokasyonlu takasta ikinci onayda), atamadan hemen
   önce. Reddedilen başvuru izinden bir şey yakmaz (test hücresi).
6. **Bildirim:** yeni tür `requests.time_off.shortened` (katalog + üretici `notify_time_off_shortened` + şablon).
   Alıcılar: izni onaylayanlar (karar olayının aktörleri), kısaltanı ve çalışanı saymadan. Yönetici kısalttığında
   çalışana da gider (rızası sistemde kayıtlı değil); takasta çalışana gitmez (kendisi istedi). Sahibin kendi izni
   (kendisi onayladı) kimseye gitmez. Sistemin iptal satırları "yeni izin/iptal talebi" ve "durum değişti"
   bildirimlerini tetiklemez; bildirim sağlık kontrolü bunları eksik saymaz (`time_off_event_is_shortening`).
7. **BL-127'nin ekrandaki yeri (koordinatöre önerildi, cevap gelmeden (a) ile ilerlendi):** Requests → Time off →
   onaylı iznin detayı → "Shorten time off". Yönetici geri vereceği saatleri çalışanın iptal formundaki saat
   seçiciyle seçer; anında geçerli olur; sonra vardiyayı Schedule'da normal yazar (engel kalkmıştır). Uç
   `POST /v1/workspaces/:id/time-off/:requestId/shorten` (`apps/api/src/time-off/`, route'ta kapı yok, çekirdek karar
   verir). `apps/api/src/schedule/**` ve `SchedulePage.tsx` bu turda yasaktı.
   Klasör kararı (KK-20 şart 2): schedule klasörü dışında izinle ilgili tek API dosyası Employee Hub'ın
   çalışan uçları (`employee-hub-routes.ts`, çalışanın kendi izni); yöneticinin izin uçları yalnız
   `schedule-requests-routes.ts`'te. Bu yüzden `apps/api/src/time-off/` açıldı. **Birleşme Schedule turundan
   sonra:** kısaltma ucu `schedule-requests-routes` ile tek izin rotası altında toplanır (ikiz sistem kalmasın;
   backlog maddesi aşağıda).

## Kanıt
- Kırmızı: migration'sız 4. hücreden düşüyor ("Ali may take the shift inside his own leave": have NULL).
- Yeşil: migration'la 30/30 (rollback'li, db.lock `nf-db/isci-g9b`).
- Etkilenen 34 pgTAP dosyası migration'lı ve migration'sız koşturuldu: kırmızılar birebir aynı (6 dosya, hepsi
  migration'sız da düşüyor; 4'ü ci-green dışında bilinen kırmızı, `shift_exchanges_v1` 3 hücre ve
  `time_off_published_assignment_disposition` saat dilimi kaynaklı; ortak yerel DB kayması, CI karar verir).
- API vitest `src/time-off` + `src/shift-exchanges` 24/24; web vitest Shift Hub 50/50, Requests 22/22; web/api/shared
  typecheck temiz.
- e2e `e2e/flows/shift-hub-time-off.spec.ts` yazıldı, koşturulmadı (toplu tur).

## Yolda bulunanlar (backlog adayı)
- **Madde metni (KK-20 şart 3):** "Schedule → hücre: yönetici onaylı izinli kişiyi vardiyaya yazmaya
  çalıştığında engelin yanında 'Shorten time off and assign' eylemi. Tek adımda iznin vardiya saatlerini
  `app_private.shorten_time_off` ile kısaltır ve atamayı yapar (yetki `time_off.decide` + `schedule.edit`);
  çalışana ve izni onaylayana bildirim. Neden önemli: bugün iki adım (Requests'te kısalt, Schedule'da ata).
  Neden bekliyor: `SchedulePage.tsx` Schedule turunda. İşaret: leave: medium / do: moderate."
- **Madde metni (KK-20 şart 2):** "İzin API'si iki klasörde: yöneticinin kısaltma ucu `apps/api/src/time-off/`,
  diğer yönetici izin uçları `apps/api/src/schedule/schedule-requests-routes.ts`. Schedule turundan sonra tek
  izin rotası altında birleştir; eski route-yerel izin kapılarını (`permissions.includes`) da çekirdeğe taşı.
  İşaret: leave: low / do: moderate."
- Schedule hücresinde "izni kısalt ve ata" kısayolu: yönetici onaylı izinli kişiyi yazmaya çalıştığında engelin
  yanında aynı ortak parçayı çağıran eylem. Schedule turunda (`SchedulePage.tsx` bu turda yasaktı).
- Sistemin yazdığı iptal satırı Requests → Time off → Closed listesinde "Cancellation" olarak görünür (doğru geçmiş,
  ama "shortened for a shift" diye ayrı etiketlenmiyor). Ekran kararı gerekirse nf-arayuz.
- `20260926170610_approved_time_off_always_blocks.sql:5-6`'daki eski yanlış varsayım yorumu uygulanmış migration'da
  kalıyor; değiştirilemez, bu dosya kaydı düzeltir.
