# SEC-A2-A3-TASARIM — takas onayında rütbe (A2) ve bağlantı token'ları (A3) düzeltme tasarımı

**ÖZET:**
- **A2 FB-6.4'e girmeli; zaten orada.** FB-6.4 A2.2 + D3 + Done when 6 eş rütbe onayını kapsıyor. Görev dosyasına üç boşluk eklenmeli:
  - (1) Rütbe hem vardiyayı verene hem alana karşı ölçülmeli.
  - (2) Onay bildirimi ve iki lokasyonlu takastaki "kim onayladı" sayımı aynı kuralla süzülmeli.
  - (3) Owner'ın kendi vardiyasının girdiği vakada onaylayacak kimse kalmıyor. KARARLAR "owner'ın talebi onaysız kaydolur" diyor ama takasa uygulanışı yazılı değil: **tek ürün sorusu**, önerisiyle aşağıda.
- **A3 ayrı, küçük bir iş.** Yalnız API ve web değişir, migration yok. Davet ve kurtarma bağlantısı `?token=` yerine `#token=` taşır; sayfa token'ı okuyup adres çubuğundan siler. Parola sıfırlamanın bugünkü deseni (`ResetPasswordPage.tsx:10-32`) birebir kullanılır.
- Tahmin: A2 FB-6.4'e +2 puan; A3 ~4 puan.

Rol: nf-guvenlik (salt okuma, plan), 2026-10-05 ~08:30Z. Kaynak:
- `origin/main` `04e48b26`.
- Yerel DB = main (`20261007030000`); yalnız SELECT.
- Kod yazılmadı.

---

## A2 — takas, devir ve pickup onayında rütbe

### Bugün (tazelik: geçerli)
- `shift_exchanges_command_service` onay ve ret dalı yalnız şunu soruyor: `schedule_actor_has_capability_service(actor, w, 'schedule.shift_change_requests.manage', lokasyon)` ("Manager scope required"). Çekirdeğe sorulmuyor.
- Kendi vakasını onaylamak engelli: `shift_exchange_preview` "A separate manager must approve your own exchange".
- Katalog kuralı hazır ama kullanılmıyor: `exchange.approve` → `place` / `write` / `schedule.shift_change_requests.manage`, `no_self = t`, `rank_below = t`.
- Eski yardımcı `schedule_actor_has_capability_service` 5 fonksiyonda: komut, önizleme, iki bildirim fonksiyonu, `time_off_event_released_assignments`. `schedule_actor_can_manage_service` 1 fonksiyonda (kurtarma). `schedule_actor_can_publish_service` 0 çağıran.
- FB-6.4 tazeliği (2026-10-03) bugün de doğru.

**Gerçek risk:** Kadıköy'de iki müdür var, Ali ve Ayşe. Ayşe Cuma vardiyasını garson Hande'ye vermek ister. Bugün Ali bu devri onaylayabiliyor. P07: "eş rütbe birbirini onaylamaz"; talep bir üst kademeye, admin ya da owner'a gitmeli. Veri sızmıyor; onay kuralı ihlal ediliyor.

### FB-6.4 ile ilişkisi
- FB-6.4 bunu kapsıyor ve **orada kalmalı**:
  - A2.1: altı fonksiyon çekirdeğe.
  - A2.2: komutta `exchange.approve` (D3: rütbe).
  - A2.4: üç `schedule_actor_*` yardımcısı silinir.
  - Done when 6: D3, pgTAP + e2e (e).
- Ayrı bir iş açmak, aynı fonksiyonu iki kez yeniden yazmak olur. FB-6.4 A1 uygunluk motoru için de aynı gövdeye dokunuyor; iki dal çatışır.
- **Yayın FB-6.4'ten önce gelirse** (FB-6.4 AVAIL-002'den sonra sırada, 17 puan): FB-6.4'ün A2 commit'inin ilk parçası yalnız rütbe olarak ayrı alınabilir. Aynı dalın ilk commit'i, ayrı main'e alınır; yaklaşık 3 puan.

### FB-6.4 görev dosyasına eklenmesini önerdiğim üç boşluk

**Boşluk 1 — rütbe kime karşı ölçülür.**
- D3 "müdürün kendi vakası admin ya da owner'a gider" diyor; vakada iki kişi olduğunu söylemiyor: vardiyayı veren (`c.owner_id`) ve alan (`a.employee_id`).
- Öneri: onaylayan **ikisini de** geçmeli. Komutta, `approvals_required`'daki her lokasyon için ve iki kişi için:
  ```
  app_private.authorize(actor, w, 'exchange.approve', array[lokasyon], target_person => <kişi>)
  ```
  `open_pickup`'ta veren yok (açık vardiya); yalnız alan sayılır.
- Örnek: Hande (garson) vardiyasını müdür Ayşe'ye verir. Ali, Ayşe'nin aldığı vardiyayı onaylayamaz; admin onaylar.
- Dayanak: P07 "eş rütbe birbirini onaylamaz". Eş müdürün lehine olan bir değişikliği eşi onaylamamalı.

**Boşluk 2 — bildirim ve oy sayımı aynı kuralla.**
- `shift_exchange_notification_allowed` "schedule_request_reviewers" kitlesini yalnız yetenekle süzüyor; vakadaki iki kişiyi dışarıda tutuyor.
- Rütbe gelince eş müdür onaylayamayacağı bir istek için bildirim almaya devam eder. Gürültü yaratır ve P07'nin "admin gürültüsü yok" ilkesine ters düşer.
- Alıcı süzgeci `app_private.authz_check(...)` ile aynı soruyu sormalı.
- Admin zaten her lokasyonda yetkili, bu yüzden "kimse onaylayamıyor" durumunda admin her zaman alıcı. Ayrı bir "waits for an admin" bildirimi gerekmez.
- İki lokasyonlu takasta `shift_exchange_preview` "eksik onay" sayımı (yerel DB gövdesi satır 28-31) oy veren kişinin yetkisini yetenekle ölçüyor. Aynı kurala geçmeli; yoksa eş müdürün oyu geçerli sayılabilir.
- Eski kayıt toleransı yazılmaz (P01; canlı veri yok).

**Boşluk 3 — owner'ın vardiyası (ürün sorusu).**
- Rütbe kuralıyla owner'ın verdiği ya da aldığı vardiyayı onaylayacak kimse yok: owner'ı kimse geçmez. Vaka sonsuza kadar bekler.
- KARARLAR "Rütbe" satırı: "Owner'ın talebi onay gerekmeden kaydolur, etkilenen manager'lara bildirim gider". Ama bu satır izin için yazılmış (BL-183); takasa uygulanışı yazılı değil.

Soru (koordinatör → Mert, tek tık):

| Seçenek | Ne olur |
|---|---|
| **a — Owner'ın girdiği vaka kabul edilince onaysız kaydolur, lokasyon müdürlerine "owner bu vardiyayı verdi/aldı" bildirimi gider (Önerilen)** | KARARLAR'daki owner kuralının takasa uygulanması. Dayanak P07 + KARARLAR "Rütbe" satırı + BL-183 deseni. |
| b — Owner'ın vakasını da lokasyon müdürü onaylar | P07'ye aykırı: alt kademe üst kademeyi onaylar. |
| c — Owner takasa / pickup'a katılamaz | Owner'ı vardiya yazan bir çalışan gibi kullanan küçük restoranlar için kısıtlayıcı. |

- Admin'in vakası owner'a gider; ek karar gerekmez.
- (a) seçilirse komutta owner dalı onay adımını atlar. Bildirim, izindeki BL-183 kitlesini kullanır.

### Değişen yerler (FB-6.4 A2'ye ek)

| Katman | Değişen | Rol |
|---|---|---|
| DB | `shift_exchanges_command_service` onay/ret dalı: Boşluk 1 çağrıları; owner dalı (Boşluk 3, karara göre) | `nf-db` |
| DB | `shift_exchange_preview` eksik onay sayımı; `shift_exchange_notification_allowed` ve `shift_exchange_emit_notification_base` alıcı süzgeci | `nf-db` |
| API | Değişiklik yok. "Hayır" sözleşmesi FB-6.4 A3.1'de: üye olmayana 404, öteki `authz.*` 403 | `nf-backend` |
| Ekran | Yöneticinin Requests ekranında onaylayamadığı vaka için düğme kapalı mı gizli mi: FB-6.4 B'nin varyantı | `nf-arayuz` |

**"Hayır" sözleşmesi:** eş rütbe `42501` + `authz.rank`; kendi vakası `authz.no_self` (çekirdeğin adı neyse); başka lokasyonun müdürü `authz.out_of_scope`; employee `authz.missing_permission`.

### Testler (FB-6.4 Done when 6'yı genişletir)

**pgTAP, `authorization_matrix.test.sql` `exchange.approve`** (bugün `:882-886` yalnız "kendini onaylamaz"):

| Onaylayan | Vaka | Beklenen |
|---|---|---|
| Kadıköy müdürü | garson → garson | geçer |
| Kadıköy müdürü | eş müdürün verdiği vardiya | `authz.rank` |
| Kadıköy müdürü | garsonun eş müdüre verdiği vardiya | `authz.rank` (Boşluk 1) |
| Kadıköy müdürü | kendi vakası | ret |
| Beşiktaş müdürü | Kadıköy vakası | `authz.out_of_scope` |
| Admin | müdürün vakası | geçer |
| Admin | başka admin'in vakası | `authz.rank` |
| Owner | admin'in vakası | geçer |
| Employee | herhangi | `authz.missing_permission` |
| — | owner'ın vakası | karara göre (a): onaysız kaydolur + bildirim |

İki lokasyonlu takas:
- Yalnız bir lokasyonun yetkili onayı varsa vaka kapanmaz.
- Eş müdürün oyu sayılmaz (Boşluk 2).

**Bildirim:** eş müdür "reviewers" bildirimi almaz; admin alır (tek pgTAP hücresi, `notification_outbox` + `notification_allowed`).

**e2e:** FB-6.4 C (e) "eş rütbe müdür onaylayamaz". Ek olarak aynı senaryoda admin onaylar ve vardiya el değiştirir.

**Sınıf:** R3; `nf-guvenlik` zorunlu; ultrareview FB-6.4'ün Reviewer satırında zaten var.

**Puan:** FB-6.4'ün 17 puanına +2 (Boşluk 1–3 hücreleri ve bildirim süzgeci). Ayrı ilk parça alınırsa ~3.

**Migration sırası:**
- Gövde değişikliği; alan eklemez ya da silmez, eski kodla da çalışır. OPS-03 sırası (önce canlı DB, sonra main) zarar görmez.
- FB-6.4'ün yardımcı silen commit'i alan silen iş sayılır: önce main, sonra canlı. FB-6.4'te zaten yazılı.

---

## A3 — davet ve kurtarma token'ları adres çubuğundan çıkar (BL-351)

### Bugün (tazelik: geçerli)

**Üretenler (API):**
- Kurtarma: `apps/api/src/account/account-security-service.ts:226`, `account-deletion-worker.ts:131` → `/account-recovery?token=`.
- Davet: `apps/api/src/employees/employee-create-service.ts:54`, `invitation-service.ts:108`, `:173` (geliştirme bağlantısı), `:224` (e-posta ve "Copy invite link") → `/invite/accept?token=`.

**Okuyanlar (web):**
- `apps/web/src/account/AccountRecoveryPage.tsx:9` `searchParams.get("token")`.
- `apps/web/src/employees/AcceptInvitationPage.tsx:33` ve `:36` (`invitePath` → sign-in'e `from` olarak gider).
- `apps/web/src/auth/resolveLanding.ts:105-109` `inviteToken` dalı. **Ölü:** `inviteToken` hiçbir çağırandan gelmiyor (`git grep` yalnız tanımı buluyor). Silinir; ikiz yok kuralı.
- `apps/web/src/views/SignInPage.tsx:207-212` `isInviteAcceptDestination` yalnız yola bakıyor; değişmez.

**Doğru örnek:** parola sıfırlama `#token_hash=` taşıyor. Sayfa açılınca okuyor ve `history.replaceState` ile adresten siliyor (`apps/web/src/views/ResetPasswordPage.tsx:10-32`).

**e2e bugünkü biçimi kilitliyor:** `e2e/flows/invite.spec.ts:81`, `e2e/flows/employee-onboarding.spec.ts:75` `toContain("/invite/accept?token=")`.

**Gerçek risk:** sorgu dizesindeki token web sunucusunun istek kaydına, tarayıcı geçmişine ve ortak bilgisayarın adres önerilerine düşer. Örnek: restoranın ortak bilgisayarında Ayşe davet bağlantısını açar. Bağlantı geçmişte ve sunucu kaydında `?token=…` ile kalır. Kabul e-posta eşleşmesi istediği için başkası daveti kabul edemez, ama tek kullanımlık sır gereksiz yerlere yayılmış olur. Kurtarma bağlantısı da aynı. Orta-düşük.

### Tasarım

**API (`nf-backend`):**
- Altı üretici `?token=` yerine `#token=` yazar (davet ve kurtarma; değer `encodeURIComponent`).
- Ortak tek yardımcı önerilir: `apps/api/src/lib/app-links.ts` → `appLink(appUrl, path, token)`. Altı yer aynı kuralı çağırır; ikinci bir kopya oluşmaz.
- Geliştirme cevabındaki `developmentUrl` de aynı yardımcıdan.

**Web (`nf-backend`, `apps/web/src/auth` + veri katmanı):**
- `AcceptInvitationPage`:
  - Token'ı ilk çizimde `location.hash`'ten okur (`new URLSearchParams(hash.slice(1)).get("token")`), sonra `history.replaceState(null, "", pathname)` ile adresten siler.
  - Token'ı bileşen durumunda tutar.
  - Oturum yoksa sign-in'e giderken `from: "/invite/accept#token=…"` yönlendirici **durumunda** taşınır (URL'de değil). Giriş sonrası sayfa yeniden açılınca aynı okuma-silme çalışır.
  - `safeSignInDestination` fragment'ı zaten koruyor (`SignInPage.tsx:201`).
- `AccountRecoveryPage`: aynı okuma-silme deseni.
- `resolveLanding.ts:105-109` ölü `inviteToken` dalı ve `LandingInput.inviteToken` alanı silinir.
- **Eski `?token=` bağlantısına tolerans yok** (P01; canlı kullanıcı yok, gönderilmiş gerçek e-posta yok). `?token=` ile açılan sayfa "bağlantı bozuk" ekranını gösterir. Bugün `token.length < 32` → `brokenLink`; değişmez.

**Tuzak (BL-336 için not):** Supabase'in e-posta onayı dönüş adresine kendi fragment'ını (`#access_token=…`) ekler. İleride BL-336, davet token'ını onay e-postası boyunca taşımak için `emailRedirectTo`'ya `#token=` koyarsa iki fragment çakışır. BL-336 token'ı `sessionStorage`'da taşımalı. A3'ün kapsamı değil; BL-336'ya not olarak yazılmalı.

**DB:** değişiklik yok. Token'lar API'de birleştiriliyor; DB'de yalnız özet (`token_hash`, `*_digest`) ya da teslim sırrı tutuluyor.

Yan bulgu: `employee_create_commands.invitation_token` da düz metin. BL-352'nin kardeşi; o maddeye eklenmeli, bu işe değil.

### Testler
- **API vitest:** altı üreticinin her biri `#token=` üretir, `?token=` üretmez. Ortak yardımcının tek testi + üreticilerin var olan testlerinde beklenti güncellenir.
- **Web vitest:**
  - `AcceptInvitationPage` `#token=` ile açılınca önizleme isteği doğru token'la gider; `history.replaceState` çağrılır ve adres `/invite/accept` olur.
  - Oturumsuz açılışta sign-in'e giden durum token'ı taşır.
  - `?token=` ile açılış "bağlantı bozuk" gösterir.
  - `AccountRecoveryPage` aynı üç hücre.
  - `resolveLanding` testlerinde `inviteToken` hücreleri silinir.
- **e2e (`nf-test`):**
  - `invite.spec.ts:81` ve `employee-onboarding.spec.ts:75` → `toContain("/invite/accept#token=")`.
  - Bağlantı açıldıktan sonra `expect(page.url()).not.toContain("token")`.
  - Davet kabulüne kadar web'e giden hiçbir isteğin adresinde token yok: `page.on("request")` ile sayım 0.
  - Kurtarma için e2e yoksa yeni senaryo gerekmez; web vitest yeter.
  - **Sınır:** e-posta içeriği `RESEND_API_KEY` yokken geliştirme bağlantısıyla geliyor; e2e bunu kullanıyor.

**"Hayır" sözleşmesi:** değişmez. Önizleme ve kabul uçları token'ı gövdede alıyor (`employee-data.ts:585-589`; BL-279 sonrası).

**Sınıf:** R3 (davet ve hesap kurtarma); `nf-guvenlik` zorunlu; ultrareview gerekmez (veri ve yetki değişmiyor, iki sayfa + altı satır).

**Migration:** yok. OPS-03 etkilenmez. Eski web yeni bağlantıyı açarsa token'ı bulamaz ve "bağlantı bozuk" der; yeni web ile API aynı commit'te main'e girer (ikisi aynı Vercel yayını değilse API önce). Bir yayın penceresinde gönderilen davetler bozuk görünebilir. Canlı kullanıcı yok; kabul edilebilir.

**Puan ve rol:**

| Rol | İş | Puan |
|---|---|---|
| `nf-backend` | API yardımcısı + altı üretici + iki sayfa + `resolveLanding` silme + vitest | 3 |
| `nf-test` | iki e2e beklentisi + "adres temiz" kontrolü | 1 |
| | **Toplam** | **~4** |

**Ekranda ne değişir:** görünürde hiçbir şey. Davet ve kurtarma sayfası açıldıktan sonra adres çubuğunda token görünmez. Örnek: Ayşe davet e-postasındaki bağlantıya basar; sayfa açılınca adres yalnız `…/invite/accept` olur.

---

## Önerilen sıra
1. **A3:** küçük, bağımsız, migration yok. Yayın paketinin bir sonraki işi olabilir.
2. **A2:** FB-6.4 içinde. Boşluk 3'ün cevabı FB-6.4 başlamadan Mert'ten alınır. Yayın FB-6.4'ten önce gelecekse rütbe parçası FB-6.4 dalının ilk commit'i olarak ayrı main'e alınır.

## Açık kalan ve nedeni
- **Boşluk 3** (owner'ın takas vakası) ürün kararı; önerisiyle soruldu.
- `authz.*` ipucunun `no_self` için adı çekirdekte nasıl yazılıyorsa o kullanılır. Ölçmedim; `nf-db` matristen alır.
- Kurtarma bağlantısı için e2e var mı tam taranmadı (`e2e/flows` listesinde ad olarak yok).

## Ekranda ne değişti
Hiçbir şey; plan.

## Sırada ne var
- FB-6.4 görev dosyasına Boşluk 1–3 (`nf-planlama`).
- BL-351'e "Tasarım 2026-10-05: SEC-A2-A3-TASARIM" satırı.
- BL-336'ya fragment tuzağı notu; BL-352'ye `employee_create_commands.invitation_token`.

## Kanıt (2026-10-05, bu oturumda, salt okuma)
| Komut | Sonuç |
|---|---|
| `git show origin/main:docs/plan/tasks/FB-6.4.md` | A2.1–A2.4, D3, Done when 6, Reviewer satırı |
| KARARLAR `:75` (Rütbe), `:164-169` (Takas uygunluk, Onay); ILKELER P07 `:134-137` | owner kuralı izin için yazılmış; takasta yok |
| `app_private.authz_actions` `exchange.*` | `exchange.approve` place / `no_self` / `rank_below` |
| `pg_proc` eski yardımcı çağıranları | capability 5, can_manage 1, can_publish 0 |
| `shift_exchanges_command_service`, `shift_exchange_preview`, `shift_exchange_notification_allowed` gövdeleri | onay = yalnız yetenek; kendi vakası engelli; bildirim yetenekle süzülüyor |
| `git grep` `?token=` / `get("token")` / `inviteToken` | 6 üretici, 2 okuyucu, ölü `inviteToken` dalı, 2 e2e beklentisi |
| `ResetPasswordPage.tsx:10-32` | fragment + `replaceState` deseni |
| `information_schema.columns` `token` | `employee_create_commands.invitation_token` düz metin |
