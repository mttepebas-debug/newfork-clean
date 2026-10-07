# BILDIRIM Bildirim sistemi sıfırdan: motor, kurallar, arayüz
Status: draft (plan; kod yok — Mert'in 6 temel model cevabı ve varyant seçimi bekleniyor)
Session: oturum/bildirim   Branch: task/bildirim   Worktree: ../newfork-wt/bildirim   DB: -
Risk: R3 (yetki, RLS, grant, tablo silme, canlı DDL)
Reviewer: nf-guvenlik (her dilim ve paketin tamamı); ekran değişen dilimde masaüstü 1440 + telefon 390 görüntüsü
Skills: brainstorming (mimari yol: model önerisi bu dosya, onay Mert'te) → supabase-postgres-best-practices (B1–B6) → test-driven-development (her dilim, önce kırmızı test) → receiving-code-review → verification-before-completion

## Mert için özet

1. Bugünkü bildirim sistemi 18 tablo, 49 fonksiyon ve iki ayrı gelen kutusundan oluşuyor; Settings → Notifications'taki 267 kontrolün çoğu hiçbir şeyi değiştirmiyor. İnceleme: [`research/BILDIRIM-INCELEME.md`](../research/BILDIRIM-INCELEME.md).
2. Öneri: **tek tablo, tek kural, tek kutu.** Bildirim olayla aynı anda yazılır (kuyruk ve zamanlayıcı yok), karar bekleyen bildirim karar verilince herkesin kutusunda kendiliğinden kapanır, aynı konu aynı kişiye tek satır olur.
3. **Kime:** kararı verecek kişiye ve işi doğrudan etkilenene. Karar bildiriminde önce lokasyon müdürü, müdür yoksa admin/owner. Senin açık istisnaların (müsaitlik, tercih edilen ad, önemli tarih) korunur.
4. **Kanal:** uygulama içi her zaman; e-posta kısa bir listede (Resend ücretsiz katman, $0); telefona anlık bildirim telefon uygulamasıyla, MVP sonrası.
5. **Ayar:** workspace ayar sayfası kalkar (ya da salt okunur olur); kişi yalnız e-postayı kategori kategori açıp kapatır.
6. Eski sistem tek seferde silinir (ikiz yok, eski bildirimler taşınmaz). Kod, EKRAN-02 paketi main'e girdikten sonra başlar.
7. **Senden 6 karar** (§10): kanal, ayar, owner/admin ne alır, karar sonrası, program yayını, cover duyurusu. Görsel varyantlar: https://claude.ai/artifact/M8yVRt1fWEY8Sg24ze8Wmv (bildirim merkezi A/B/C, ayar sayfası A/B/C, telefon, bugünkü ekranlar).
8. Dilimler B0–B8, hepsi tek paket olarak main'e (R3, her dilimde `nf-guvenlik`).

Goal: Newfork'un bildirim motorunu, kurallarını ve arayüzünü sıfırdan kurmak: doğru kişiye, tek kez, anlaşılır metinle, gürültüsüz; eski sistemin tamamını silmek.

In scope:
- Uygulamadaki 162 olayın (inceleme §4) hepsine karar: bildirim üretir mi, kime, hangi kanaldan.
- Yeni veri modeli, alıcı kuralı, okundu / karar kapanışı, saklama, canlı güncelleme, e-posta kanalı (Soru 1'e bağlı).
- API, bildirim merkezi, rozet, Settings → Notifications, Account → Notifications, telefon görünümü, Publish penceresindeki "Notify" adımı (Soru 5), Workspace ana sayfası kutucuğu.
- Eski motorun söküm listesi (inceleme §6.1) ve `retired_objects_stay_gone`.
- Bildirim olan backlog maddeleri (inceleme §9).

Out of scope:
- Telefon uygulaması ve push, SMS, sessiz saat, özet (digest) e-postası: MVP sonrası (Soru 1'de anılır).
- Duyuru ekranındaki "onaylar kalsın / sıfırlansın" penceresi ve Remind düğmesi (EKRAN-07 ekran işi; teslim kuralı burada).
- Faturalama bildirimleri: tür kataloğuna yer açılır, üretici Stripe işiyle gelir.
- Supabase Auth e-postaları (kayıt, e-posta değişikliği doğrulama): motor dışı; yalnız Resend SMTP önerisi (`mvp/RESEND.md` adım 6).
- Vardiya hatırlatması ("shift starts in 2 hours"), "hafta yayınlanmadı" hatırlatması: MVP dışı önerisi (zaman takibi ve push ile birlikte).

Done when:
- §4'teki katalogdaki her tür için pgTAP'ta alıcı testi (kim alır, kim almaz) yeşil; inceleme §4.5'teki 18 eksik ve 10 gürültü maddesinin her biri ya kapandı ya da Mert kararıyla bilerek bırakıldı.
- Eski 18 tablo, 49 fonksiyon, 3 tetikleyici, `notification-outbox` zamanlayıcısı ve 6 ölü izin yok; `retired_objects_stay_gone` bunları kapsıyor; `authz_catalog` sayaçları düştü (yasaklı ad 12 → 2, `service_actor_has_permission` 10 → 6, `auth.uid()` politikası 1 eksik).
- Bildirim merkezi, rozet, Account → Notifications ve Settings → Notifications Mert'in seçtiği varyantta; masaüstü 1440 ve telefon 390 görüntüleri `artifacts/BILDIRIM/` altında.
- e2e: izin talebi → karar → tek bildirim; yayında vardiyası alınan kişi bildirim alır; ret gerekçesi sahibe gitmez; çalışan telefonda bildirimden programına gider.
- Tam kapı, `test:db`, etkilenen e2e yeşil; canlı migration koordinatörün "gönder" izniyle, yedekle; main CI yeşil.

Touches: inceleme §6 (SİL / DÜZENLE listesi). Yeni dosyalar §3–§5'te.

Test plan: §7. Risk notes: §9.

## 1. Temel model (önerilen)

### 1.1 Altı kural

1. **Kime:** bildirim yalnız (a) kararı verecek kişiye ve (b) işi doğrudan etkilenene gider (ILKELER P07, A anti-hedef). İşi yapan kişi kendi bildirimini hiç almaz (KK-89'un genelleşmesi; BL-890).
2. **Karar veren tek kural:** önce olayın lokasyonunda karar yetkisi olan müdür(ler); o lokasyonda karar verebilen yoksa admin ve owner (KK-158; izindeki yedek kuralı K:125; EKRAN-02 a1a2'nin `exchange_decision_reason`'ı). Rütbe kuralı korunur: müdürün talebine admin/owner, admin'inkine owner. Mert'in açık istisnaları korunur: müsaitlik güncellemesi (K:72), tercih edilen ad (K5, 2026-10-06), önemli tarih teslimi (K5).
3. **Tek konu tek satır:** aynı konu (talep, vaka, hafta, belge) için bir kişinin kutusunda en çok bir satır olur; yeni gelişme o satırı günceller ve okunmamış yapar, yeni satır açmaz (K:131, K14, EKRAN-02 R2-13'ün genel hâli).
4. **Karar bekleyen satır kendiliğinden kapanır:** biri karar verince (ya da talep geri çekilince, süresi dolunca) bütün karar vericilerin satırı "kapandı" olur, sonucu aynı satıra yazılır ("Approved by Can · 2 shifts open"); ayrıca bildirim gitmez (Soru 4).
5. **Bilgi eksikse kimseye:** lokasyonu ya da kişisi bilinmeyen olay geniş kitleye düşmez (fail-closed); alıcı yalnız yetki çekirdeğinden seçilir (`authz_reason` / `scope_set`), geçmiş onay ya da rol adıyla değil (`nf-guvenlik` G3).
6. **Serbest metin yalnız yazıldığı kişiye:** ret gerekçesi, özel not, belge içeriği bildirim metnine yalnız muhatabına girer; başkasına genel metin (BL-910).

### 1.2 Kanal (Soru 1)

- **Uygulama içi:** her bildirim, her zaman. Kapatılamaz (kayıttır; karar kaybolmasın).
- **E-posta (önerilen kısa liste):** uygulamayı açmayan kişinin kaçırmaması gerekenler: çalışana program yayını/değişikliği, kendi talebinin sonucu, belge son tarihi ve kısıtlanma; yöneticiye karar bekleyen iş 24 saat açık kalırsa tek hatırlatma; herkese hesap güvenliği. Kişi kategori kategori kapatabilir, hesap güvenliği hariç.
- **Push / SMS:** MVP sonrası, telefon uygulamasıyla. Veri modeli kanal başına teslim satırı tuttuğu için eklemek yeni bir gönderici demek.
- **Sessiz saat ve özet:** MVP'de yok (push olmadan anlamı yok; e-posta listesi zaten kısa). Push geldiğinde yeniden sorulur.

### 1.3 Ayarlar (Soru 2)

- Önerilen: **workspace düzeyinde bildirim ayarı yok.** Settings → Notifications sayfası ve iki izni (`notifications.settings.read/write`) kalkar; doğru varsayılan herkes için aynı (A anti-hedef "ayar cehennemi").
- Kişisel: Account → Notifications'ta yalnız e-posta, kategori başına (Schedule, Requests, People, Announcements); tek Save sağ altta (P20). Uygulama içi satırı kapatılamaz.

### 1.4 Okundu, kapanış, silme, saklama

| Satır türü | Durumlar | Kişi ne yapabilir |
|---|---|---|
| Karar bekleyen (`needs_action`) | açık → kapandı (sonuç yazılı) | açar; okundu sayılır ama "To decide"da kalır; silemez, kapanınca kendiliğinden düşer |
| Bilgi | okunmadı → okundu | okundu / okunmadı yapar, siler |

- Okundu: satıra tıklamak ya da çoklu seçim + "Mark as read" (tek istek; BL-597).
- Saklama: okunmuş bilgi satırı ve kapanmış karar satırı 90 gün sonra silinir (günlük iş). Hesap güvenliği satırı 1 yıl.
- Geri çekme: duyuru yayından kalkınca / süresi dolunca (K8, K12) satır silinir; vardiya düşmesi bildirimi (K14) kapalı gün geri alınsa da **kalır** (P09; BL-883).
- Yetki kaybında: okuma, satırın kaydettiği yetkiyi (eylem + lokasyon + kişi) bugünkü yetkiyle yeniden sınar; lokasyondan alınan müdür eski satırı görmez (`nf-guvenlik` G2).

### 1.5 Canlı güncelleme

Kişiye özel private kanal `notifications:<user>`; yalnız "yenile" sinyali taşır (metin, kimlik yok). Rozet ve liste sinyalle yenilenir; sinyal kaçarsa 5 dakikalık yedek yoklama. Bugünkü 60 sn yoklama ve `account-notifications` kanalı kalkar.

## 2. Üç yaklaşım

| | Y1 Senkron tek tablo (önerilen) | Y2 Kuyruk + işçi (bugünkünün sadeleşmişi) | Y3 Okurken hesapla |
|---|---|---|---|
| Nasıl | Domain işlemi aynı veritabanı işleminde `notify()` çağırır, satır o an yazılır. Yalnız e-posta kuyruktan gider. | Olay kuyruğa, dakikada bir işçi alıcıyı hesaplayıp satır yazar. | Bildirim satırı yok; "ne bekliyor" domain tablolarından okunurken hesaplanır. |
| Artı | Anında; zamanlayıcıya bağlı değil (bugün yerelde 1.537 satır bekliyor); olayla bildirim tutarlı; tablo sayısı 18 → 3-4 | Domain işlemi hafif; dış kanala doğal | Hiç bayatlamaz; yayılım yok |
| Eksi | Domain işleminde ~100 kişiye kadar satır yazılır (ölçülecek; hedef ≤20 ms) | Gecikme, zamanlayıcı bağımlılığı, iki durum (bekleyen / işlenmiş), bugünkü sorunların kaynağı | Okundu ve geçmiş tutulamaz; "bilgi" bildirimi olmaz; her açılışta ağır okuma |
| Karar | ✅ | ✗ (e-posta için yalnız küçük bir kuyruk) | ✗ (ama Requests ekranındaki sayaçlar zaten böyle; dokunulmaz) |

## 3. Veri modeli ve yetki

### 3.1 Tablolar

| Tablo | Sütunlar (özet) | Not |
|---|---|---|
| `notification_kinds` | `key` PK, `category` (schedule / requests / people / communications / account / billing / platform), `needs_action`, `email` (never / eligible / always), `mandatory`, `label`, `description` | Migration ile tohumlanır; tek kaynak. `packages/shared`'de katalog kopyası olmaz; ekran etiketi API'den gelir (bugünkü 10 ↔ 35 kayması biter). |
| `notifications` (yeni şekil) | `id`, `workspace_id` (hesap satırında null), `recipient_user_id` (silinince CASCADE), `kind`, `group_key`, `subject_type`, `subject_id`, `title`, `body`, `action_url` (`^/(app\|account)(/\|$)`), `needs_action`, `scope_action`, `scope_location_ids`, `scope_person`, `resolved_at`, `resolved_text`, `read_at`, `created_at`, `updated_at`; UNIQUE (`recipient_user_id`, `group_key`) | Tek kutu. İndeks: (`recipient_user_id`, `workspace_id`) `where read_at is null`; (`recipient_user_id`, `workspace_id`, `needs_action`) `where resolved_at is null`. |
| `notification_emails` | `id`, `notification_id` (CASCADE), `recipient_user_id`, `send_after`, `status` (pending / sent / failed / dead / not_configured), `attempts`, `last_error`, `sent_at` | Yalnız Soru 1 e-posta derse. Adres teslim anında `auth.users`'tan okunur, saklanmaz. |
| `notification_email_preferences` | (`user_id`, `workspace_id`, `category`) PK, `email_enabled` | Yalnız e-posta. |

Bildirim durumu taşıyan domain sütunları sadeleşir: `announcements.delivered_to` ve `important_dates.delivered_to` yerine "kim aldı" `notifications` satırlarından okunur (K4 / K7 "yalnız yeni eklenenlere" kuralı için); `reminded_at` / `fallback_notified_at` kalır (zamanlayıcı durumu, bildirim değil).

### 3.2 Fonksiyonlar

- `app_private.notify(kind, workspace, recipients uuid[], group_key, subject_type, subject_id, title, body, action_url, scope jsonb)`: her alıcı için ekle ya da aynı `group_key` satırını güncelle; işi yapanı (`app_private.actor()`), üye olmayanı, arşivliyi ve yetkisi tutmayanı atar; e-posta satırını kuyruğa koyar (tür + tercih); kişiye sinyal yollar.
- `app_private.resolve_notifications(group_key, resolved_text)`: açık karar satırlarını kapatır.
- `app_private.withdraw_notifications(group_key, recipients uuid[] default null)`: satırları siler (duyuru geri çekme).
- `app_private.notification_deciders(workspace, action, location_ids, person)`: kural 2; içerde `authz_reason` / `scope_set`. EKRAN-02'nin `exchange_decision_reason`'ı ve `time_off_deciders` bu fonksiyonu kullanır ya da onun özel hâli olur (tek kaynak).
- Kullanıcıya açık servisler (API'den, `service_role`): `list_notifications_service`, `count_notifications_service`, `mark_notifications_service` (id listesi ya da "hepsi", okundu/okunmadı), `delete_notifications_service`, `get_notification_preferences_service`, `save_notification_preferences_service`.
- İşçi servisleri (yalnız zamanlayıcı): `lease_notification_emails_service`, `finish_notification_email_service`, `purge_notifications_service` (saklama), `documents_daily_service` (bugünkü Workspace-açılınca yan etkisinin yerine; BL-806).

### 3.3 RLS ve yetki

- Dört tabloda RLS açık; anon / authenticated'a tablo izni yok; servisler `SECURITY DEFINER`, `search_path=''`, yalnız `service_role`'e açık.
- Her servis `app_private.authorize(actor, workspace, 'notifications.read_own')` (okuma, okundu, silme) ya da `'notifications.preferences.write_own'` (tercih) ile başlar; hesap satırları `account.self` ile. Bilinmeyen ve başkasının satırı aynı cevabı alır (`authz.out_of_scope`). API: `resolveActor` + `authorize`; `authz.not_member` → 404, öteki `authz.*` → 403.
- Okuma süzgeci: `scope_action is null` ya da satırın lokasyonu kişinin bugünkü `scope_set(actor, workspace, scope_action)` kümesinde.
- Realtime: `realtime.messages` SELECT politikası `notifications:<uid>` konusunu `rls_can(null,'account.self',null,null,<uid>)` ile sınırlar; sunucu `realtime.send(..., true)`.
- Yetki matrisi (`authorization_matrix.test.sql` + `authorization-matrix.expected.json`) ve katalog (`authz_catalog.test.sql`) her yeni `*_service` için sınıflanır; silinen 6 izin ve 2 çekirdek eylem matristen çıkar.

## 4. Tür kataloğu (öneri; 34 tür)

"Karar" = karar bekleyen satır, kapanır. "E-posta" = Soru 1-a'daki kısa liste. Alıcıdan işi yapan her zaman çıkar.

| Tür | Olaylar (inceleme §4) | Alıcı | Karar | E-posta |
|---|---|---|---|---|
| `time_off.needs_decision` | T01, T11, T12, T13, T14 | karar verenler (kural 2); 12 saat kala aynı satır güncellenir; "admin bekliyor" admin/owner'a satır açar | ✓ | 24 saat açıksa tek |
| `time_off.decided` | T04, T06, T07, T08, T09, T10, T15 | çalışan, sonuç başlıkta ("Time off approved · Oct 14") | | ✓ |
| `time_off.shortened` | T16, T17 | çalışan (T16) + izni onaylayan herkes | | |
| `schedule.shifts_open` | T02, T05 (müdürsüz lokasyon), N09, N12, I04 (müdüre sayı) | boşalan yayınlanmış vardiyanın lokasyon müdürü; yoksa admin/owner | | |
| `shift_change.needs_response` | S01, S02 | adı verilen arkadaş | ✓ | |
| `shift_change.needs_decision` | S04, S06, S07, S10, S16 | karar veren müdür (EKRAN-02 a1a2 kuralı); başvurular tek satırda "3 candidates" | ✓ | 24 saat açıksa tek |
| `shift_change.updated` | S05, S08, S09, S11, S12, S13, S14, S15 | katılımcılar; vaka başına tek satır güncellenir; gerekçe yalnız başvurana | | yalnız son sonuç |
| `shift_change.cover_available` | S03, SCH-14 | Soru 6 | | |
| `availability.updated` | A01 | K:72 kitlesi; kişi başına günde tek satır; değişiklik yoksa yok (A02) | | |
| `availability.check` | A03 | bütün çalışanlar; haftası olmayana farklı metin (BL-793) | | |
| `schedule.changed` | SCH-09…13, SCH-17, SCH-18, I04 (K14) | vardiyası eklenen, değişen, alınan, silinen kişi; hafta başına tek satır, değişikliği yazar ("Tue Oct 14: 5–11 PM → 4–10 PM") (Soru 5) | | ✓ |
| `announcement.posted` | C01, C02, C04, C06, C08, C12 | hedef listesi (K24), K4 / K27 / K12 yeniden teslim kuralları; onay isteniyorsa karar satırı | onaylı ise ✓ | |
| `announcement.publish_failed` | C03 | yalnız yazar (K21) | ✓ | |
| `announcement.reminder` | C14 | "Not yet" kişiler (K23) | ✓ | |
| `important_date.posted` | I01, I02, I03, I06 | K5 kitlesi; değiştiren hariç; tarih geçince geri çekilir (I09) | | |
| `onboarding.needs_review` | O02 | lokasyon müdürü; yoksa admin/owner | ✓ | |
| `onboarding.legal_name` | O05 | owner + admin (alt rütbe kuralı, K:90) | ✓ | |
| `onboarding.changes_requested` | O04 | çalışan | ✓ | ✓ |
| `onboarding.complete` | O06 | çalışan | | ✓ |
| `preferred_name.needs_decision` | N01 | K5: owner + admin + karar veren müdür; ilk karar herkesin satırını kapatır | ✓ | |
| `preferred_name.updated` | N02, N03 | N02: K:272 (müdür); N03: çalışan | | |
| `document.needs_review` | D05 | Soru 3 | ✓ | |
| `document.decided` | D07, D08 | çalışan (ret: düzeltme karar satırı) | ret ✓ | ✓ |
| `document.requested` | D01, D02, D03, W05 | çalışan; aynı gün gelenler tek satır; isteyenin adı yok (K:98) | ✓ | ✓ |
| `document.due` | D09, D10, D12 | çalışan; son tarihten 7 ve 1 gün önce ve gününde (her gün değil, BL-823) | ✓ | ✓ |
| `document.expiring` | D11 | belge karar verenleri; uyarı gününde ve süre dolunca (günlük iş) | | |
| `access.changed` | D12 (kısıt), D13 | çalışan | | ✓ (kısıt) |
| `employee.no_location` | N10 | işten çıkarabilen owner/admin (K:79); metin ekranın yapabildiğini söyler | ✓ | |
| `employee.restored` | N14 | dönen kişi + lokasyon müdürü (S1 satır 10) | | ✓ (kişiye) |
| `invitation.cancelled` | J04 | davet eden; genel metin (hesap silmeyi söylemez) | | |
| `ownership.transfer` | N15, N16 | hedef (karar), sonra karşı taraf | ✓ (hedef) | ✓ |
| `account.security` | H01 (tek satır), H02, H03, H04, H05, H06, H08, H10 | kişinin kendisi (hesap satırı) | | ✓ zorunlu |
| `export.disabled` | M03 | kural sahibi | | ✓ |
| `workspace.closing` | M01 | bütün üyeler | | ✓ |

Motor dışında, bugünkü gibi doğrudan e-posta kalanlar: J01–J02 davet (K:375 "Send reminder / Resend" ayrımı B4'te), SCH-22 zamanlanmış program e-postası, H11–H12 ve J08 Supabase / parola e-postaları.

Bildirim üretmeyecekler (bilerek): SCH-01…08, SCH-15, SCH-16, SCH-19, T03, A02, A04…A08, J03, J05…J07, O01, O03, O07, N04…N08, N11, N13, N17, D04, D06, D14, D15, C05, C07, C09, C10, C11, C13, I05, I07, I08, W02…W04, W06, W07, H09, M02. Faturalama (B01…B08): `billing.*` türleri Stripe işinde, owner'a (kilitlenince herkese).

## 5. API

| Uç | Ne | Servis |
|---|---|---|
| `GET /v1/workspaces/:w/notifications?view=to_decide\|updates&state=unread\|read&category=&cursor=&limit=` | liste + `unread_count`, `to_decide_count`, `next_cursor` | `list_notifications_service` |
| `GET /v1/workspaces/:w/notifications/count` | rozet (`unread`, `to_decide`) | `count_notifications_service` |
| `POST /v1/workspaces/:w/notifications/read` `{ ids?: uuid[], all?: true, read: boolean }` | okundu / okunmadı, tek istek | `mark_notifications_service` |
| `DELETE /v1/workspaces/:w/notifications` `{ ids: uuid[] }` | bilgi satırlarını sil | `delete_notifications_service` |
| `GET/PUT /v1/workspaces/:w/me/notification-preferences` | e-posta, kategori başına | `get_/save_notification_preferences_service` |
| `GET /v1/account/notifications`, `POST /v1/account/notifications/read` | hesap satırları | aynı servisler, workspace null |
| `POST /api/internal/cron/notification-emails`, `/notification-purge` | işçi | sır sabit sürede karşılaştırılır (`timingSafeEqual`) |

Silinenler: `/v1/workspaces/:w/communications/notifications` (+ `/action`), `/v1/workspaces/:w/notification-settings` (+ `/reset`, `/test`), eski `/me/notification-preferences` şekli, `/v1/account/notification-preferences`, `/api/internal/cron/notification-outbox`. Rota-yerel kapı ve `permissions.includes` yok (BL-898'in bildirim payı). Cevap şekli `packages/shared`'de tek zod şeması.

## 6. Arayüz

| Yer | Öneri | Varyant |
|---|---|---|
| Bildirim merkezi (`/app/notifications`) | "To decide" ve "Updates" ayrı; karar satırı kapanınca sonucu gösterir; satır tıklanınca ilgili ekranın tam kaydını açar | artifact: **A** bugünkü DOC-TABLE kararı + yeni içerik, **B** iki şerit sayfa, **C** zil paneli + geçmiş sayfası |
| Rozet | Sol menüde tek sayı (okunmamış + açık karar), canlı | hepsinde aynı |
| Settings → Notifications | Soru 2 | artifact: **A** sayfa kalkar, **B** salt okunur "kim neyi alır", **C** 3 anahtarlı küçük sayfa |
| Account → Notifications | e-posta kategori başına, uygulama içi açıklama, tek Save | her ayar varyantında |
| Telefon (çalışan) | Notifications alt çubuğa çıkar (bugün "More" altında); "To do" üstte, kart satırları (KARARLAR telefon liste kararı) | artifact: telefon görünümleri |
| Schedule → Publish | "Notify" adımı kalkar; pencerede "Ali, Bob and 3 others will be told about their changes" satırı (Soru 5) | — |
| Workspace ana sayfası | bildirim kutucuğu yeni okuma ucundan (BL-533, BL-816) | — |

Metin kuralları: başlık tek cümle, sonuç başta ("Time off approved", "Your Tue shift was removed"); kişi adı yerine rol yalnız erişim yönlendirmesinde (P21); tarih ve saat workspace biçiminde (BL-055); ham kod ekranda yok.

## 7. Test planı

- **Önce kırmızı:** her dilim, kapattığı her bulgu için kırmızı testle başlar (BL-910 gerekçe sızıntısı, SCH-11 vardiyası alınan kişi, KK-174 işten çıkarma, BL-730 çift bildirim, G2 lokasyondan alınan müdür).
- **pgTAP — alıcı testi (tür başına):** kim alır; kim almaz: işi yapan, öteki lokasyonun müdürü, lokasyondan alınan müdür, rütbesi düşen müdür, arşivli kişi, müdür varken admin/owner, lokasyonu bilinmeyen olayda herkes (fail-closed).
- **pgTAP — tek satır:** izin onayı (vardiya açan) her kişiye tam bir satır; karar vericilerin satırı kapanır; yeniden yayın aynı satırı günceller; takas başvuruları tek "N candidates" satırı.
- **pgTAP — gizlilik:** ret gerekçesi yalnız başvurana; okuma süzgeci yetki kaybında satırı gizler; Realtime yayınında başlık / metin yok.
- **pgTAP — sökülenler:** `retired_objects_stay_gone` (inceleme §6.1); `authz_catalog` sayaçları; yetki matrisi her yeni servis için gerçek imzayla.
- **API (vitest):** her uç için yetki sözleşmesi (404 `authz.not_member`, 403 `authz.*`), toplu okundu tek istek, tercih doğrulaması, işçi sırrı.
- **Web (vitest):** merkez sekmeleri / süzgeç / çoklu seçim, kapanmış karar satırı, rozet sinyalle yenilenir, Account sayfası tek Save.
- **e2e (Playwright):** (1) Ali izin ister → Ayşe (Downtown müdürü) "To decide"da görür → onaylar → Ali tek "Time off approved", Zeynep (admin) hiçbir şey; (2) Ayşe Ali'nin Salı vardiyasını Emre'ye verip yayınlar → Ali "removed", Emre "added", ötekiler hiçbir şey; (3) gerekçeli ret sahibe görünmez; (4) telefonda çalışan bildirimden programına gider; (5) Settings / Account Soru 2'nin cevabına göre.
- **Ölçüm:** liste ≤50 ms, sayaç ≤10 ms (10.000 satırlık fixture); `notify()` 100 alıcıda ≤20 ms (Schedule ızgarası ≤50 ms kuralı bozulmaz).

## 8. Dilimler

Hepsi `task/bildirim` dalında; her dilimin sonunda `nf-guvenlik` ONAY @sha; main'e **tek paket** (ikiz sistem yok: yeni motor ile eski motor main'de hiç yan yana durmaz).

| Dilim | İçerik | Risk | Önkoşul |
|---|---|---|---|
| B0 | Mert'in 6 cevabı + varyant seçimi; KARARLAR'a işlenir (koordinatör) | R0 | — |
| B1 | Çekirdek: 4 tablo, `notify` / `resolve` / `withdraw` / `notification_deciders`, servisler, RLS, Realtime politikası, matris + katalog, pgTAP | R3 | B0; EKRAN-02 paketi main'de |
| B2 | Requests + Availability üreticileri (izin, takas, müsaitlik); EKRAN-02 a1a2/a3 kuralları genel kurala; BL-910 (açıksa), BL-200, BL-736, BL-738, BL-740, BL-790, BL-793 | R3 | B1 |
| B3 | Schedule + duyuru + önemli tarih üreticileri (yayın farkı, K14, K21, K23, K24, K27 teslimi, K12); BL-614, BL-858 (teslim), BL-864, BL-867, BL-883, BL-890 | R3 | B1; EKRAN-07 / EKRAN-08 ile dosya sırası |
| B4 | People + Documents üreticileri, günlük belge işi, onboarding, işten çıkarma (KK-174), Restore (S1); BL-768, BL-776, BL-806, BL-807, BL-822, BL-823 | R3 | B1; EKRAN-03 / EKRAN-06 ile dosya sırası |
| B5 | Hesap güvenliği + e-posta kuyruğu, işçi, Resend şablonları, tercihler (Soru 1-2) | R3 | B1; canlı doğrulama için Resend (Mert) |
| B6 | Söküm: eski 18 tablo, 49 fonksiyon, 3 tetikleyici, zamanlayıcı, izinler, eski API uçları, `packages/shared` dosyaları; `retired_objects_stay_gone` | R3 | B2–B5 |
| B7 | Arayüz: merkez, rozet, telefon, Account / Settings → Notifications, Publish penceresi, Workspace kutucuğu; BL-258, BL-348, BL-596, BL-597, BL-601, BL-651, BL-533, BL-816 | R2 | B1, B0 varyant seçimi |
| B8 | e2e senaryoları, tam kapı, `test:db`, canlı migration (yedek + "gönder") | R3 | B1–B7 |

Sıra önerisi: B1 → (B2, B3, B4, B5 aynı oturumda sırayla; P17 tek sahip) → B6 → B7 → B8.

## 9. Bağımlılıklar ve riskler

- **EKRAN-02 veri paketi önce** (KK-203): takas alıcı kuralı ve "tek karar tek bildirim" orada main'e girer; B2 onları genelleştirir. Dosya çakışması: `shift_exchange_emit_notification_base`, `notify_schedule_request_event_service`, `time_off_*`.
- **GUVENLIK-A** (KK-206): GA-3 bildirim ayarı rotasını ve 4 fonksiyonu BILDIRIM'e bıraktı; Roles ekranındaki "Notifications: Edit" (GA-2) Soru 2-a ile tamamen kalkar. `authz_catalog` sayaçlarına iki iş birden dokunur; sıra koordinatörde.
- **EKRAN-07 / EKRAN-08 / EKRAN-03 / EKRAN-06 / EKRAN-10:** üretici fonksiyonları ve Settings menüsü aynı dosyalarda; koordinatör sırayı "aynı dosyaya iki oturum yok" kuralıyla verir.
- **Resend canlıda yok** (`mvp/RESEND.md`): e-posta kodu canlıya anahtarsız girerse satırlar `not_configured` kalır, kullanıcıya hata çıkmaz; gerçek teslim Mert'in 7 adımından sonra. Maliyet: ücretsiz katman $0 (günde 100, ayda 3.000); 100 kişilik ekipte günlük yayın + kararlar sınıra yaklaşırsa Pro $20/ay.
- **Büyük yüzey:** ~30 domain fonksiyonu düzenlenir; her dilimde alıcı testi ve `nf-guvenlik`.
- **Canlı:** canlıdaki eski bildirimler taşınmaz (P01, §2.A.5); migration öncesi yedek (`pg_get_functiondef` + silinen tabloların tanımı), koordinatörün "gönder" izni.
- **Ölçülmedi:** canlı kuyrukta bekleyen / ölü satır sayısı (söküm bunları zaten siler).

## 10. Mert'e 6 temel soru

Sorular önce sohbette konuşulur (ILKELER P18); koordinatör tek tıklık biçime çevirir.

**Soru 1 — Bildirim hangi kanaldan gitsin?**
Bugün: bütün bildirimler yalnız uygulamanın içinde (sol menü → Notifications). E-posta ve telefona anlık bildirim kodu yok; canlıda e-posta anahtarı da yok.
Örnek: Ayşe (Downtown müdürü) Pazar akşamı haftayı yayınlar. Ali (garson) uygulamayı açmazsa Salı vardiyasının 16:00'ya alındığını bilmez.
- **Uygulama içi + kısa listede e-posta (Önerilen):** her şey uygulamada; e-posta yalnız çalışana program ve kendi talebinin sonucu, belge son tarihi; yöneticiye 24 saat açık kalan karar için tek hatırlatma; herkese hesap güvenliği. Kişi e-postayı kategori kategori kapatabilir. Telefona anlık bildirim telefon uygulamasıyla gelir. Maliyet $0 (Resend ücretsiz: günde 100, ayda 3.000).
  Dayanak: ILKELER P06, P13; A anti-hedef "bildirim gürültüsü"; `mvp/RESEND.md`.
- **Yalnız uygulama içi (bugünkü gibi):** e-posta ve anlık bildirim MVP sonrası. Ali programı uygulamayı açınca görür.
- **Uygulama içi + her bildirimin e-postası:** kişi kapatabilir. Müdüre günde onlarca e-posta.
- **Uygulama içi + tarayıcıdan anlık bildirim (web push):** telefonda ana ekrana eklenmiş uygulamaya bildirim; iPhone'da yalnız ana ekrana eklenince çalışır, kurulum adımı ister.

**Soru 2 — Bildirim ayarı kimde olsun?**
Bugün: Settings → Notifications'ta owner ve admin 29 türün her birine Enabled, 3 kanal, sıklık, gerekçe, Reset, Save ve "Safe test" görüyor (267 kontrol); kanal ve sıklık hiçbir şeyi değiştirmiyor, 19 türün adı ham kod. Account → Notifications'ta herkes 5 kategoride "In app" kutusunu kapatabiliyor.
Örnek: Zeynep (admin) "Time-off requests to review"ı kapatırsa Ayşe izin taleplerini artık hiç görmez; ikisi de bunu fark etmez.
- **Workspace ayarı yok, kişisel yalnız e-posta (Önerilen):** Settings → Notifications sayfası kalkar. Uygulama içi bildirim kapatılamaz; kişi Account → Notifications'ta yalnız e-postayı kategori kategori açar / kapatır, tek Save. Varyant A.
  Dayanak: ILKELER A anti-hedef "ayar cehennemi", P20, P07.
- **Salt okunur kurallar sayfası:** Settings → Notifications "kim neyi alır" tablosu olur, değiştirilemez; kişisel ayar aynı. Varyant B.
- **Birkaç workspace anahtarı:** Settings'te 3 anahtar (ör. "owner ve admin talep kopyası alsın", "program e-postası", "cover duyurusu"); kişisel ayar aynı. Varyant C.
- **Bugünkü gibi** tür tür kural.

**Soru 3 — Owner ve admin hangi karar bildirimlerini alsın?**
Bugün: izin talebi lokasyon müdürüne gidiyor (müdür yoksa admin/owner'a). Vardiya değişikliği ise owner'a, bütün admin'lere ve öteki müdürlere de gidiyor (yerel ölçüm: owner 138, admin 138, müdür 428 satır). Belge incelemesi owner, admin ve müdürlere birlikte (ortalama 4,6 kişi). Tercih edilen ad senin 2026-10-06 kararınla owner + admin + müdür.
Örnek: Ali Downtown'da sağlık sertifikasını yükler. Ayşe (Downtown müdürü), Zeynep (admin) ve Burak (owner) üçü de "Document ready for review" alır.
- **Lokasyon müdürü önce, müdür yoksa admin/owner; senin iki istisnan kalır (Önerilen):** izin, takas, belge, onboarding hep aynı kural. Ali'nin belgesi yalnız Ayşe'ye gider; Downtown'da müdür yoksa Zeynep ve Burak'a. Owner / admin işleri ekranlarında (Requests, Employees → Documents) görür. Tercih edilen ad (2026-10-06) ve müsaitlik güncellemesi (2026-09-26) bugünkü gibi owner ve admin'e de gider.
  Dayanak: ILKELER P07 ("admin gürültüsü yoktur"), KK-158; Mert'in 2026-10-06 ve 2026-09-26 kararları.
- **Aynı kural, istisnasız:** tercih edilen ad ve müsaitlik de yalnız lokasyon müdürüne (iki eski kararın değişir).
- **Karar verebilen herkes alır:** Ayşe, Zeynep, Burak üçü de alır; biri karar verince üçünün de satırı kapanır (Soru 4).

**Soru 4 — Bir karar verilince öteki kutulardaki bildirim ne olsun?**
Bugün: aynı işi birden çok kişi aldıysa ilk karardan sonra ötekilerde "incelenecek" diye kalıyor (belge, tercih edilen ad). İzinde karar ayrıca yeni bildirim olarak geliyor; vardiya açan bir onay aynı müdüre iki bildirim gönderiyor.
Örnek: Ali'nin 14 Ekim izni Downtown ve Midtown'a gider. Can (Midtown müdürü) son onayı verir; bugün Ayşe "Time off approved" ve "2 shifts are open" diye iki yeni bildirim alır, eski "to review" satırı da kalır.
- **Satır kendiliğinden kapanır, sonuç aynı satıra yazılır (Önerilen):** Ayşe'nin satırı "Approved by Can · 2 shifts open" olur, yeni bildirim gelmez. Ali sonucu söyleyen tek bildirim alır.
  Dayanak: KARARLAR "Aynı turda tek izin bildirimi" (2026-10-01), K14 (tek bildirim); A anti-hedef.
- **Satır kutudan tamamen kalkar:** sonuç için ayrı bilgi bildirimi gelir.
- **Bugünkü gibi:** her adım ayrı bildirim.

**Soru 5 — Program yayınında kime bildirim gitsin?**
Bugün: Schedule → Publish penceresinin "Notify" adımında yayınlayan kime gideceğini seçiyor (değişen herkes işaretli gelir). Yeniden yayında her seferinde içeriksiz yeni bir "New schedule published" satırı. Vardiyası başkasına verilen, açığa alınan ya da silinen kişiye bildirim gitmiyor; yayından kaldırma sessiz.
Örnek: Ayşe Ali'nin Salı vardiyasını Emre'ye verip yeniden yayınlar. Emre bildirim alır, Ali almaz; Ali Salı işe gelir.
- **Otomatik, yalnız vardiyası değişen kişiye, değişikliği yazan tek satır (Önerilen):** eklenen, değişen, alınan, silinen vardiya; aynı haftanın tekrarları tek satırda birleşir ("Tue Oct 14 removed · Thu 5–11 PM added"). "Notify" adımı kalkar; pencerede "Ali, Emre and 3 others will be told" yazar.
  Dayanak: ILKELER P07 ("işi doğrudan etkilenen"), A anti-hedefler; rakip emsali (When I Work "Notify users with changes", Deputy "Publish updates").
- **Otomatik + "herkese bildir" seçeneği:** varsayılan aynı, pencerede ek seçenek.
- **Bugünkü gibi yayınlayan seçer,** yalnız vardiyası alınan / silinen kişi listeye eklenir.

**Soru 6 — Cover isteği ve açık vardiya kime duyurulsun?**
Bugün: çalışan vardiyasını devretmek için cover açınca uygun her çalışana ayrı bildirim gidiyor (ortalama 5, en çok 11 kişi). Açık vardiya yayınlanınca kimseye gitmiyor. KARARLAR'da kural yok.
Örnek: Ali Cuma 17:00 vardiyası için cover ister; Downtown'daki 11 uygun garsonun hepsi bildirim alır. Aynı hafta 3 cover açılırsa her biri 3 bildirim alır.
- **Uygun kişilere günde tek satır (Önerilen):** "3 shifts need cover this week" satırı her gün en çok bir kez güncellenir, Shift Hub'ı açar; açık vardiya yayını da bu satıra katılır.
  Dayanak: yok — yeni karar (P07'nin "etkilenen"i adayları kapsamıyor; gürültü sınırı A anti-hedef).
- **Bildirim yok:** çalışan Shift Hub'da görür.
- **Bugünkü gibi:** her cover isteğinde her uygun kişiye ayrı bildirim; açık vardiyaya da.

## 11. Bu planda verdiğim teknik kararlar (koordinatör onayına)

| Karar | Neden |
|---|---|
| Y1 senkron tek tablo; kuyruk yalnız e-posta için | §2; bugünkü bekleyen 1.537 satır; P19 en az bakım |
| Katalog yalnız veritabanında; `packages/shared`'de kopya yok | 10 ↔ 35 kayması; tek kaynak |
| `notification_deciders` tek alıcı kaynağı; EKRAN-02'nin fonksiyonu onun hâli | §2.A.1 yetki tek merkezde |
| Saklama 90 gün (hesap güvenliği 1 yıl) | `nf-guvenlik` G9; rakip 7shifts 3 ay |
| Sessiz saat ve özet MVP'de yok | push yok; e-posta listesi kısa (A anti-hedef) |
| Hesap satırları ayrı; workspace'te "hepsini okundu yap" onlara dokunmaz | G7 |
| Canlı kanal yalnız sinyal; 5 dk yedek yoklama | G8; DATA-07 |
| Eski bildirim verisi taşınmaz | P01, §2.A.5 |
| Paket tek seferde main'e | §2.A.4 ikiz yok |

## Notes / Result

### Aşama 1 — inceleme ve plan (2026-10-07, oturum/bildirim)

- **Karar:** aşama 1 bitti; kod, migration, test dosyası ve ağır koşu yok. Yerel DB'de yalnız SELECT.
- **İzin:** yok gerekmedi (yalnız `.md`; `main.lock` ile gönderildi).
- **Risk:** 🟠 bildirim motoru iki kutulu ve gürültülü; bir gizlilik açığı (BL-910) açık, düzeltmesi EKRAN-02'de ya da B2'de.
- **Soru:** Mert'e 6 temel model sorusu (§10) + iki görsel seçim (merkez A/B/C, ayar A/B/C).
- **Sonraki:** koordinatör soruları sohbete taşır; cevaplar KARARLAR'a işlenince B1, EKRAN-02 paketi main'e girdikten sonra (KK-203).

**Ne yapıldı:**
- Settings → Notifications dört rolde gezildi ve her kontrolün gönderime etkisi koddan satır satır izlendi; 267 kontrolün yalnız "Enabled" ve kişisel "In app" kutusu bir şeyi değiştiriyor (inceleme §1).
- Motor haritası (Mermaid + tablo), 18 tablo, 49 fonksiyon, ikiz ve ölü yollar (inceleme §3).
- 162 olayın envanteri: 77'si bugün mesaj üretiyor, 18 eksik, 10 yüksek gürültü (inceleme §4).
- Dokunan kod listesi SİL / DÜZENLE ve `retired_objects_stay_gone` adayları (inceleme §6).
- Paralel işlerle bağ: EKRAN-02 a1a2 / a3 / a4, GUVENLIK-A, EKRAN-07 / 08 / 03 / 04 / 05 / 06 / 10 (inceleme §7).
- Rakipler, kaynak ve tarihle (inceleme §8). Plan ve 6 soru (bu dosya).
- Görsel: https://claude.ai/artifact/M8yVRt1fWEY8Sg24ze8Wmv — bildirim merkezi A (bugünkü DOC-TABLE kararı) / B (iki şerit) / C (panel), telefon A/B/C, ayar A (sayfa yok) / B (salt okunur) / C (üç anahtar), bugünkü ekranlar. Kaynak `artifacts/BILDIRIM/bildirim-varyantlari.html`.

**Açık kalan ve nedeni:**
- "Ayarı değiştir → olayı tetikle → ne gitti" uygulamada uçtan uca ölçülemedi: `db.lock` bütün oturum boyunca başka oturumlardaydı ve yerel kuyruk zaten işlenmiyor (1.537 bekleyen). Etki koddan ve kayıtlı karar satırlarından ölçüldü (inceleme §1.4).
- Canlı kuyruk durumu ölçülmedi (canlıya dokunulmadı).

**Ekranda ne değişti:** hiçbir şey (salt okur).

**Yolda bulunanlar (numarayı koordinatör verir):**
1. 🔴 Başvuru reddinin gerekçesi vardiya sahibine gidiyor — koordinatöre 2026-10-07 08:46Z bildirildi, **BL-910** oldu.
2. Yayın toast'ı "N employees notified" hiç görünmüyor: web `notification_count`, DB `notification_enqueued_count` (`schema.sql:17262-17264`, `apps/web/src/views/SchedulePage.tsx:3173-3176`). B7'ye.
3. "Onboarding complete" bildirimi hiç üretilmiyor: tetikleyici `onboarding_events`'te `employee.activated` bekliyor, o tabloya yazılmıyor (`schema.sql:4174-4177`, `:20289-20297`). B4'e.
4. Bildirim satırları `auth.users`'a RESTRICT bağlı (`schema.sql:32234, 32269`); hesap silme kullanıcıyı anonimleştirdiği için bugün kırılmıyor, ama silinen hesabın bildirimleri süresiz kalıyor. B1 (CASCADE + saklama).
5. `test.admin@meyhouse.test` sihirli bağlantıyla oturum açamıyor (sign-in'de kalıyor); nedeni ölçülmedi. Düşük.

**Kanıt:** `artifacts/BILDIRIM/` (ana klasör): dört rolün 1440 ve 390 görüntüleri ve metin dökümleri, `owner-tall-app_settings_notifications-1440.png`, varyant ön izlemeleri `look-*.png`. Alt ajan raporları bu oturumda okundu; kilit iddialar ✓ ile işaretli.

**Skill:** brainstorming (mimari yol; tasarım bu dosya, onay Mert'te), artifact-design.
