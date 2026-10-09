# nf-guvenlik — FB-6.2 `.7b` incelemesi (R3)

**KARAR: ONAY @893cc89f**. Şart: main'e alınırken `.7b`, `.7b-db`'nin son hâlinin (`62a611b6`)
üstüne taşınmalı (B1). Kritik, Yüksek ya da Orta bulgu yok.

İncelenen: `task/fb62-core-b-7b` @`893cc89f` (taban `a5a43ebd`). Yeni fark üç commit'te:
`935bf539`, `d6e91fbd`, `893cc89f`. `90d91cf7` ise `.7b-db` `02162f94`'ün kopyası; o ayrıca
onaylandı. Bakılan: `git diff origin/main...origin/task/fb62-core-b-7b -- apps packages` ve işçi
raporu (`youthful-montalcini-5c90e3/artifacts/nf-backend/7b/RAPOR.md`). Kararlar: KK-31 S3, KK-35
S1–S4, KK-36, BL-413, BL-414. Tarih 2026-09-30.

## Kontrol edilenler (sorun yok)

**1. Davet ve kayıt oluşturma rotaları (BL-414)**
- **Kapısı kalkan her yol veritabanında çekirdeğe soruyor.** Kapısı kalkan rotalar: gönder, yeniden
  gönder, iptal, bağlantı ve "Add employee". Servisleri:
  - `prepare_…`, `load_…_retry`, `load_…_link`, `revoke_…`, `store_…_delivery_secret`,
    `mark_…_delivery`: hepsi `authorize('employee.invite', target_person)` yapıyor
    (`20260930140000:130,213,266,346,396,443`).
  - Rol verme ayrıca `can_invite_with_role`'e soruyor (kendi rütbesinin altı ve `employee.create`).
  - `create_employee_command_service` kaydın lokasyonlarıyla `employee.create` soruyor, tekrar
    denemede de rolü yeniden kontrol ediyor.
- **Eski kapıyla yeni kural arasındaki fark bilerek yapıldı.** Eski kapı `employee_access.manage`
  istiyordu, çekirdek `employees.manage` istiyor. Yöneticinin kendi lokasyonunda davet etmesi T5b
  `.5` kararı; BL-414 tam olarak bu ayrışmayı kapatıyor.
- **403 ile 404 doğru ayrılıyor.**
  - Üye olmayan ya da bilinmeyen workspace: `resolveActor`'dan 404 `authz.not_member`.
  - Oturum yoksa 401 (`session.required`). Bağlantı rotasındaki eski özel 401 kalktı, aynı cevap
    genel yoldan geliyor.
  - Çekirdeğin öteki retleri: `rpcFailure` üzerinden 403 ve `authz.*` gerekçesi.
  - Testli (`invitation-routes.test.ts`): her rota için rütbe reddi 403, üye olmayan 404,
    veritabanının kendi cümlesi dışarı çıkmıyor.
- **E-posta sağlayıcısının metni dışarı sızmıyor.** Teslim hatası artık 409 ve sabit metin
  "Invitation delivery failed" (`deliveryFailed`). Sağlayıcının metni yalnız teslim kaydında
  (`mark_…_delivery`) ve log'da (`replyWithError`, `warn` + `err`) kalıyor. Eskiden her hata
  `error.message` ile 409 dönüyordu; o sızıntı yolu kapandı.
- **Kayıt oluşturmada eski ikinci kapı da kalktı** (davet rolü varken `employee_access.manage`).
  Rol kontrolü veritabanında: `can_invite_with_role`, rütbe reddi 403 `authz.rank`.

**2. Yeni uçlar: lokasyondan çıkarma ve yönetilen lokasyonlar**
- `DELETE …/employees/:e/locations/:locationId`:
  - Parametreler zod ile uuid olarak doğrulanıyor.
  - Servis `authorize('employee.remove_from_location', array[lokasyon], kişi)` soruyor.
  - Rütbe (`rank_below`, `no_self`) ve kapsam (`place`, yöneticinin lokasyonu) çekirdekte.
  - Başka workspace'in ya da bilinmeyen bir lokasyon kimliği çekirdekte `out_of_scope` alır
    (lokasyon workspace'te ve silinmemiş olmalı). Kişinin orada ataması yoksa yine aynı
    `out_of_scope`; iki durum ayırt edilemiyor (CLAUDE.md §9).
- `PUT …/employees/:e/managed-locations`:
  - Gövde `employeeManagedLocationsSchema`: uuid dizisi, en çok 500.
  - Servis `authorize('employee.set_managed_locations', kişi)` soruyor; bu yalnız admin ve owner'a
    açık (hedef yönetici, `rank_below`).
  - Yeni eklenen lokasyon bu workspace'in canlı ve arşivsiz bir lokasyonu olmalı; değilse 403
    `authz.out_of_scope`. Başka workspace'in kimliği bu yüzden reddediliyor.
  - Hedef yönetici değilse 400 ve `employee.not_a_manager`.
  - Testli (`employee-directory-routes.test.ts`).
- Cevaplar zod ile okunuyor (`employeeLocationRemovalSchema`); veritabanı alanı ham olarak dışarı
  gitmiyor.

**3. Workspace ana sayfası rotaları (BL-413, KK-36)**
- Pano, to-do ekleme ve to-do kapatma rotalarında `workspace.read` ve rol adı kapısı kalktı.
  Servisleri çekirdeğe `workspace.todos` soruyor (T5b-4, `20260930172000`).
- **Düzen rotasının kapısı SQL'den sonra kalktı.** Ayrı commit `893cc89f`, `90d91cf7`'den (düzen
  servisi `workspace.todos`) sonra, aynı dalda. Sıra doğru. Main'e ikisi birlikte girmeli;
  rota tek başına girerse kapısız rota eski servise düşer (bkz. B1).
- Silinen "çalışan panoyu açamaz" API testlerinin yerini çekirdek reddini 403 olarak taşıyan
  testler aldı. Kuralın kendisi pgTAP'ta: `communication_operations`, `employee_drawer_reads`
  (düzen hücreleri).

**4. Web**
- **Eksik alan izin açmıyor (fail-closed).**
  - `removable` yalnız `true` olan lokasyona düğme koyuyor.
  - `allowed.invite`, `allowed.onboarding_review` ve `allowed.set_managed_locations` için yedek
    değer `false`.
  - Paylaşılan şemada bu anahtarların hepsi zorunlu. Sunucu eksik gönderirse çekmece hata verir,
    düğme açmaz.
- **D3 (önceki incelemede not ettiğim `invite` iyimserliği) sorun değil.** Davet düğmeleri
  (e-posta ekle, yeniden dene, hatırlatma, bağlantı, iptal) yalnız hesabı bağlı olmayan kişide
  çıkıyor: `linked = Boolean(detail.user_id)`, bağlıysa yalnız rol seçimi ve erişim kaldırma.
  Onboarding düğmesi hâlâ KK-33 boşluğunu taşıyor: yönetici butonu görür, sunucu P0002 döner.
  Bilinen durum, FB-6.6'da kapanacak.
- **Özel iletişim bilgisi kuralı (KK-35 S3) doğru.** `canReadPrivate = privateContact !== null`;
  sunucu bu alanı yalnız `employees.private.read` sahibine dolduruyor.
- **Çalışan görünümü rotası (KK-35 S4) doğru.** `/app/employee-hub` artık
  `ActionRoute action="employee_hub.read"`. Çekirdekte bu eylem her aktif üyenin kendisine açık
  (`own`, izin anahtarı yok). Açamayan kişi bulunduğu yere geri gönderiliyor. Kendi kaydı olmayan
  kişi sayfanın erişim-yok kartını görüyor (`EmployeeHubPage.tsx:107`, `isNoAccess`).
  `ProtectedRoute`'un içinde, bağlam yüklenmeden karar vermiyor.
- **Yönetilen lokasyon editörü tam listeyle açılıyor.** Yalnız owner ya da admin'de düzenlenebilir
  (`set_managed_locations`), ve onların referans listesi bütün lokasyonlar. Başkasında salt okunur
  liste görünüyor, sunucunun süzdüğü adlarla.
- **Çekmecede `permissions.includes` kalmadı** (işçinin grep'i 0 / 0; ben de diff'te kontrol ettim).
  Owner kaydını kilitleyen `role_name === "Owner"` kaldırıldı. Owner hesabı bağlı olduğu için davet
  düğmesi zaten çıkmıyor; erişim kaldırma `allowed.remove_access`'e bağlı, owner hedefte rütbe
  kuralıyla kapalı.

## Bulgular

**B1 — Düşük (entegrasyon): aynı migration dosyasının iki hâli var.** `.7b`,
`20260930180000_the_drawer_reads_what_the_core_allows.sql`'in eski hâlini taşıyor (`90d91cf7` =
`02162f94`). `.7b-db` dalında aynı dosya artık `62a611b6` ile değişti: tek yardımcı ve eksik eylem
satırında ret. Main'e yanlış hâli girer ya da ortak DB'ye eski hâli uygulanırsa, sonradan
değiştirilemez; düzeltme yeni migration ister (CLAUDE.md §7). Yapılacak: `.7b`'yi `.7b-db`'nin
son hâlinin üstüne taşımak, `90d91cf7`'yi bırakmak. Ekranın ve API'nin okuduğu alanlar iki hâlde
aynı, `.7b` kodu değişmez. Main'e ve ortak DB'ye yalnız `62a611b6`'lı hâl gitmeli.

**B2 — Düşük: taslak workspace'te owner artık API'den davet gönderebilir.** Eski rota kapısı
kurulum bitmemiş workspace'i reddediyordu (`onboarding.status !== "complete"`, 404). Çekirdek
taslak workspace'i owner'a açık sayıyor (`workspace_open_to_actor`). Web'de owner kurulum bitene
kadar Employees ekranına giremiyor (`ProtectedRoute.tsx:64-73`); yani fark yalnız doğrudan API
çağrısında. Owner kendi ekibini davet ediyor, başka workspace'e dokunan bir şey yok. Aynı durum,
onboarding'i sıfırlanmış aktif bir workspace'teki yönetici ve admin için de geçerli
(`reset_owner_onboarding_service`). Kurulumun kendi davet kuyruğu ("niyet") atlanabilir. Ürün
açısından kabul ediliyorsa not yeter; edilmiyorsa çekirdek bir kural ister (backlog).

**B3 — Düşük (işçinin (a) notu, katılıyorum):** `loadEmployeeInvitationLink` hâlâ elle yazılmış
`fetch` kullanıyor ve her hatayı "bağlantı yok" diye gösteriyor. Rütbe reddi (403 `authz.rank`)
ekranda "yetkin yok" olarak görünmüyor. Güvenlik açığı değil, yanlış mesaj. Backlog.

**B4 — Düşük (işçinin (b) notu):** `ownOwnerRecord` hâlâ `role_name === "Owner"` ile
hesaplanıyor. Rol adına bakan, çekirdeğe sormayan son satır bu. Owner rolü yeniden adlandırılırsa
kişi kendi acil durum kişisi alanını kaybeder; kapı açmaz, kapatır. Backlog.

## Öneri
- Bu dal davet ve katılım yüzeyine dokunuyor. CLAUDE.md §5'e göre kullanıcıya ultrareview önerisi
  uygun; koordinatör iletir.
- `ActionRoute`'un FB-6.8'de `PermissionRoute`'un yerine geçmesi doğru yön.

## Kanıt
- `git fetch origin`; `git diff --stat origin/main...origin/task/fb62-core-b-7b` → 24 dosya.
  Kaynak farkı: `app.ts`, `communication-routes.ts`, `employee-directory-routes.ts`,
  `employee-directory-service.ts`, `invitation-service.ts`, `App.tsx`, `ActionRoute.tsx`,
  `EmployeeDrawer.tsx`, `employee-data.ts` ve shared `index.ts`, satır satır okundu.
- Çekirdek ve servisler okundu:
  - `20260930140000` (davet ve oluşturma)
  - `20260930120000` (`authz_check`, `remove_employee_from_location_service`)
  - `20260930130000` (`set_employee_managed_locations_service`)
  - `20260921190000` (`workspace_open_to_actor`)
  - `http-error.ts` (`rpcFailure`, `replyWithError`)
  - `workspace-context.ts` (`resolveActor`)
- Dalın CI koşusu `36623023170` (`headSha 893cc89f`): check, db ve e2e **success**.
- İşçi raporu: yerel tam kapı yeşil (typecheck 0, lint 0 hata; vitest shared 178, api 1021,
  web 1873). Değişiklik önce kırmızı test, sonra kodla yapılmış. CI bunu bağımsız doğruladı.
- Yerelde test koşturmadım; aynı commit'te CI yeşil.
