# nf-guvenlik — FB-6.2 `.7b` görsel QA düzeltmesi (R2)

**KARAR: ONAY @ef466825**. Kritik, Yüksek ya da Orta bulgu yok. Bir Düşük bulgu var (Q1).

İncelenen: `task/fb62-7b-qa-fixes` @`ef466825` (taban `840b92a7`). Commit'ler: `dfb11860` (web +
shared), `e49032a1` ve `d6fa3a82` (migration `20260930190000`), `ef466825` (lint). Bulgu kaynağı:
`nf-gorsel-qa` `fb62-7b/RAPOR.md` maddeler 1–3. Tarih 2026-09-30.

## Önce: `.7b` incelemesindeki hatam
`.7b` raporunda (`fb62-7b/RAPOR.md` §4, "D3 sorun değil") "davet düğmeleri yalnız hesabı bağlı
olmayan kişide çıkıyor" yazdım. Bu yanlıştı. Yalnız Access bölümünün düğmelerine baktım.
Çekmecenin alt çubuğundaki "Invite" / "Resend" düğmesini (`EmployeeDrawer.tsx:1329`) gözden
kaçırdım. O düğme `canManageAccess && draft.invitation_email` ile açılıyordu ve sunucu
(`allowed.invite`) bağlı hesapta da `true` diyordu. QA bunu ekranda yakaladı.

Yetki açığı değildi: komut bağlı kayıtta `P0002` ile reddediyordu. Ama raporum yanlış bir güvence
verdi. Bu kez çekmecedeki her davet tetikleyicisini sıraladım (aşağıda §2).

## Kontrol edilenler (sorun yok)

**1. `private_contact`: "izin yok" ile "kayıt yok" ayrımı (QA madde 1)**
- **İzinsiz okuyana hiçbir şey gitmiyor.** Yeni kural `when not reads_private then null`: izni
  yoksa cevap her durumda `null`, kişinin özel profili olsun ya da olmasın. İzinsiz kişi "bu kişinin
  özel kaydı var mı" sorusunun cevabını öğrenemiyor. Eskiden `null`, iki farklı nedenden
  geliyordu; artık tek bir anlamı var: izin yok.
- **İzni olan okuyanın durumu:** kayıt yoksa boş nesne alıyor (ad anahtarları yok, alanlar
  `null`, `''` ya da `false`). Bu kişi zaten okuyabileceği için "kayıt yok" bilgisi ona sızıntı
  değil.
- İzin hesabı değişmedi: owner ya da `employees.private.read`, `authorize('employee.read')`'den
  sonra.
- Testli (pgTAP, bu dalda):
  - Owner Emre'nin dolu kaydını okuyor.
  - Owner, kaydı olmayan Pia için boş nesne alıyor.
  - İzinsiz yönetici Ayşe hem Emre hem Pia için `null` alıyor.
  - Shared şema boş nesneyi kabul ediyor.
  - Web boş nesnede alanları gösteriyor.

**2. `allowed.invite` komutla aynı kuralı soruyor (QA madde 2)**
- **Sunucu tarafı:** `allowed.invite` artık çekirdek cevabına ek olarak `employee.user_id is null and
  employee.archived_at is null` istiyor. Bu, `prepare_employee_invitation_service`'in `P0002`
  şartıyla (`20260930140000:136-143`) aynı. Yeniden gönderme, bağlantı ve iptal zaten yalnız
  bekleyen davette çalışıyor; bekleyen davet de hesabı bağlanmamış kayıtta olur.
- Testli: hesabı olmayan Pia'yı owner ve yönetici davet edebiliyor. Bağlı Selin ve Emre `false`,
  arşivli Ola `false`.
- **Ekrandaki her davet tetikleyicisi (bu kez tek tek):**

  | Tetikleyici | Yer | Açılma şartı |
  |---|---|---|
  | Yeni kayıt alt çubuğu "Invite" | `EmployeeDrawer.tsx:1222` | `can(employee.invite)`, hesap henüz yok |
  | Kayıt alt çubuğu "Invite" / "Resend" | `:1329` | `!readOnly && canManageAccess (= allowed.invite) && !user_id && e-posta` |
  | Access: e-posta ekle, yeniden dene | `AccessSection` | yalnız bağlı olmayan durumlar (`no_email`, `failed`) ve `readOnly` değilse |
  | Access: hatırlatma, bağlantı, iptal | `AccessSection` | bekleyen davet ve `readOnly = archived \|\| !allowed.invite` değilse |

  Bağlı hesapta dördü de kapalı. Kayıt alt çubuğunda iki kilit var: sunucunun `false`'u ve ekranın
  `user_id` kontrolü. Web testi: "offers no invitation to somebody whose account is already linked".
- Çekirdekte yeni kural ya da izin yok. Eklenen şart yalnız daraltıyor; kimseye yeni yetki
  vermiyor.

**3. "Manages without working there" seçenekleri (QA madde 3)**
- Web, kişinin çalıştığı lokasyonları bu listeden çıkarıyor (`detail.locations` filtresi). Kalan
  seçenekler yine yalnız owner ya da admin'in referans listesi; düzenleme `set_managed_locations`
  ile açık. Web testi var.

**4. Migration güvenliği**
- `20260930190000` yalnız `get_employee_detail_service`'i `create or replace` ediyor. Yetkiler
  korunuyor; `security definer`, `search_path ''`.
- Gövde `62a611b6`'lı hâlle karşılaştırıldı (`diff -w`). Tek farklar `private_contact` bloğu ve
  `invite` şartı. `managed_locations` süzgeci, `removable` ve eksik eylem satırı reddi (D5) aynen
  duruyor.
- Uygulanmış migration değiştirilmedi, yeni dosya açıldı (CLAUDE.md §7).

## Bulgular

**Q1 — Düşük: "çalıştığı yeri yönetilen olarak ekleme" kuralı yalnız ekranda.**
`set_employee_managed_locations_service`, kişinin zaten çalıştığı bir lokasyonu da kabul ediyor;
yalnız web süzüyor. Yetki açısından zararsız: kişinin lokasyonları zaten çalıştığı ve yönettiği
yerlerin birleşimi, erişim büyümüyor. Ama doğrudan API çağrısıyla ya da kişi sonradan o
lokasyonda işe başlayınca çift kayıt olabilir. Öneri: komut bunu 22023 ile reddetsin; ya da
atama kaydedilince yönetilen kaydı düşsün. Backlog (`nf-db`).

## Öneri
- Boş `private_contact` için `emergency_contact_email: ''` ve `false` varsayılanları dolu kayıtlarda
  da `null` yerine gidiyor. Web ikisini aynı okuyorsa sorun yok (test bu yönde). Bir yazma yolu
  bunu geri kaydederse, `null` `''` olur; zararsız.

## Kanıt
- `git fetch origin`; `git diff --stat 840b92a7 origin/task/fb62-7b-qa-fixes` → 5 dosya.
- `diff -w`: `20260930180000` (`62a611b6` hâli) ile `20260930190000` arasındaki fonksiyon gövdesi.
- `EmployeeDrawer.tsx` dal hâlinde `prepareEmployeeInvitation`, `inviteMutation` ve `Invite`
  aranarak bütün tetikleyiciler bulundu (`:401`, `:1222`, `:1329`, `AccessSection`).
- Dalın CI koşusu `36641483937` (`ef466825`): check, db ve e2e **success**;
  `employee_drawer_reads` ok, `Files=142, Tests=11704, Result: PASS`.
- Yerelde test koşturmadım; aynı commit'te CI yeşil.
