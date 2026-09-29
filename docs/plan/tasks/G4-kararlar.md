# G4 — Zamanlanmış dışa aktarma: işçi oturumunun kararları

İşçi: G4 (nf-backend + nf-db), dal `task/g4-scheduled-export`, taban `origin/main` `4e980348`, 2026-09-29.
Kapsam: BL-101, BL-272, BL-225 (+KK-13), BL-330 (KK-10 a), BL-163, U63 kod kısmı.

## K1 — Yetki: ikiz kapı silindi, çekirdek tek kapı (BL-101)
- **Karar:** API'deki `revalidateScheduledExportCandidate` silindi. Servis rolüyle dört tabloyu kendisi okuyup
  yanlış parametreyle `service_actor_has_permission` çağırıyordu; her koşuda "permission denied" ile düşüyordu.
  Yerine ayrı bir çağrı konmadı: dışa aktarmanın kendisi (`preview_schedule_export_service`) zaten kuran kişi
  adına `app_private.authorize(…, 'schedule.export', lokasyonlar)` soruyor; elle indirmeyle aynı kapı.
  Workspace durumu (silinmiş, kapanmış, kurulumu bitmemiş) aday listesinde `workspace_allows_interactive_access`
  ile zaten eleniyor.
- **Sonuç:** tazelikte önerilen `authz_reason` için `public` sarmalayıcı gerekmedi → yeni `*_service` yok,
  katalog değişmedi. Çekirdek reddederse (`42501` + `authz.*`) dışa aktarma o koşuda kapanır ve nedeni yazılır (K2).
- **Dayanak:** CLAUDE.md §9 "route-yerel yetki kapısı yok, ikiz sistem yok"; aynı soruyu iki yerde sormak
  iki cevabın ayrışmasına kapı açar (BL-101 tam da buydu).
- **Geri alma:** düşük — commit geri alınır; eski kapı zaten hiç çalışmıyordu.

## K2 — Kalıcı hata anında kapatır ve nedenini söyler; geçici hata üç denemede (BL-225)
- **Karar:** Gelecek hafta da aynı biçimde düşecek hatalar ilk seferde dışa aktarmayı kapatır ve `last_error`'a
  sade İngilizce nedeni yazar:
  - bütün lokasyonlar silinmiş → "Every location in this export was deleted."
  - saat dilimi gerçek değil → `The time zone "…" is not a real time zone.`
  - kuran kişi artık bu lokasyonları dışa aktaramıyor → "The person who set up this export can no longer export these locations."
  - kayıt okunamıyor (ör. ayar şekli değişmiş) → "This scheduled export's saved settings can no longer be read. Edit and save it again."
  Geçici hatalar (e-posta sağlayıcısı, çizim) eskisi gibi 3 ardışık denemede kapatır.
- **Dayanak:** Schedule → Export → Scheduled listesindeki dışa aktarma satırı hata metnini yalnız
  "otomatik kapatıldı" durumunda gösteriyor (`ScheduleExportSchedules.tsx:101-105`). Üç hafta boyunca sessizce
  denemek BL-225'in şikâyeti ("kimseye haber vermeden durur").
- **Geri alma:** düşük — `schedule-export-cron.ts`'te `StoppedExport` için `autoDisableAfter` 1 → 3.

## K3 — Silinmiş lokasyon veritabanında düşülür; arşivli lokasyon G8'e bırakıldı (Q-C, KK-13)
- **Karar:** `list_schedule_export_cron_candidates_service` her adayı `live_location_ids` ile verir (Q-C'nin tek
  yeri). Kadıköy + Beşiktaş dışa aktarmasında Beşiktaş silinirse e-posta yalnız Kadıköy için gider; ikisi de
  silinirse aday boş listeyle gelir ve K2'ye göre kapanır. Kayıttaki `location_ids` yeniden yazılmaz. Haftanın
  başlangıç günü de aynı çağrıyla gelir (API'nin servis rolüyle ayrı tablo okuması kalktı).
- **Arşivli lokasyon (KK-13):** `live_location_ids` bugün yalnız silinmişi düşüyor; arşivliyi de düşmesi G8'in
  işi (KK-13 "Durum: G8'de"). Cron aynı fonksiyonu sorduğu için G8 main'e girdiğinde kendiliğinden uyar; G4
  ayrıca dokunmadı (aynı yetki fonksiyonunu iki işte açmamak). Bugün arşivli lokasyonlu dışa aktarma sessizce
  kapanmıyor: çekirdek arşivliyi hâlâ kapsamda sayıyor, gönderim geçiyor.
- **Geri alma:** orta — yeni migration ile fonksiyonun eski gövdesi geri konur.

## K4 — Zamanlanmış gönderimde notlar hiç gitmez (BL-330, KK-10 a)
- **Karar:** Cron, ön ayarda "include notes" açık olsa bile ekleri notsuz üretir; başarı kaydına
  `include_notes: false` yazılır. Ön ayar elle indirmede aynen kullanılır.
- **Açık kalan (yolda bulunan, nf-arayuz):** Schedule → Export penceresi zamanlanmış gönderim kurulurken notların
  gitmeyeceğini söylemiyor. Metin işi; G4 sunum dosyasına dokunmadı.
- **Geri alma:** düşük.

## K5 — Saat dilimi kuralı girişte; cron her satırı ayrı işler (BL-272)
- **Karar:** Zamanlanmış dışa aktarma kaydedilirken saat dilimi IANA olarak doğrulanır (paylaşılan şemada, lokasyon
  şemasının kullandığı `isValidIanaTimezone`; yanlışsa 400 "Select a valid IANA time zone"). Cron'da "zamanı geldi
  mi" kontrolü satırın kendi `try`'ında; bir satırın hatasını kaydetmek de düşerse döngü sürer ve olay loglanır.
  Aday listesi satır satır okunur: okunamayan satır yalnız kendisini kapatır.
- **DB CHECK eklenmedi:** saat dilimini yorumlayan tek yer Node'un `Intl`'ı; Postgres'in saat dilimi listesi
  ayrı ve sabit olmayan (immutable değil) bir kaynaktan geliyor. Kural, yorumlayan yerde duruyor.
- **Geri alma:** düşük.

## K6 — Tek e-posta gönderici (BL-163)
- **Karar:** `apps/api/src/email/resend-email.ts` → `sendResendEmail`. Davet, hesap kurtarma, parola sıfırlama ve
  zamanlanmış dışa aktarma bunu çağırır. Ortak kural: 30 sn zaman aşımı (çağıranın kendi süresi varsa o; parola
  sıfırlamanın rota bütçesi korunur), isteğe bağlı idempotency anahtarı, hata metni "<ne> failed (<durum kodu>)":
  Resend'in cevap gövdesi dışarı sızmaz. Ekler bir kez base64'lenir (çift kodlama giderildi; PDF/XLSX ekleri
  açılır).
- **Davranış farkı:** davet e-postası artık 30 sn'de kesilir (önce sınırsız bekliyordu).
- `account-deletion-worker.ts` kendi başına göndermiyor; anahtarı `createRecoveryEmailDelivery`'ye taşıyor, dokunulmadı.
- **Geri alma:** düşük.

## K7 — U63: anahtar yoksa açık hata ve log; `vercel.json`'a cron eklenmedi (koordinatöre soru)
- **Karar:** `RESEND_API_KEY` yoksa cron ucu eskisi gibi 503 "Email delivery is not configured" döner ve artık
  sunucu loguna "Scheduled exports cannot be emailed: RESEND_API_KEY is not set" yazar.
- **Eklenmeyen:** `vercel.json`'da hiçbir iç cron yok (zamanlanmış dışa aktarma, bildirim kuyruğu, hesap silme,
  workspace saklama). Zamanlanmış dışa aktarma saatlik çağrı ister (`send_hour`); Vercel'in ücretsiz planı cron'u
  günde bir kezle sınırlıyor ve saatlik ifade yayını düşürebilir. Plan, `CRON_SECRET` ve dış tetikleyici hosted
  karar → kullanıcıda. Bu yüzden zamanlanmış dışa aktarma kod olarak hazır, hosted'da tetiklenmesi açık.

## Doğrulama (2026-09-29, bu dal)
- API vitest: `src/schedule` 9 dosya 376 test, `src/account` + dışa aktarma 13 dosya 150 test,
  `src/email/resend-email.test.ts`, `src/app.test.ts` yeşil. Kırmızılar önce görüldü (cron 7, e-posta 4, servis 1, shared 1).
- pgTAP (ortak yerel DB, `db.lock`, tek transaction + rollback): yeni `scheduled_export_sends_only_live_locations`
  migration'sız kırmızı (silinmiş Beşiktaş → `authz.out_of_scope`), migration'la 8/8; migration'la
  `workspace_rls` 119, `deleted_location_counts_nowhere` 19, `authorization_coverage` 5,
  `schedule_templates_autofill_export` 43 yeşil. Migration ortak DB'ye kalıcı uygulanmadı.
- `pnpm typecheck` 7/7; değişen dosyaların eslint'i temiz.
