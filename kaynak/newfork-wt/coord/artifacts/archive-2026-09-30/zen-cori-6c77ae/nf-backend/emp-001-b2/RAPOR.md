# EMP-001 B2 + B3: "yalnız yönetir"in shared, API ve ekrandan sökümü (nf-backend, 2026-09-30)

## 1. Nerede duruyor
Bitti, commit'li, tam kapı yeşil. Push yok. Açık kalanlar bölüm 3'te; hiçbiri bu dilimi tutmuyor.

| | |
|---|---|
| Dal | `task/emp-001-b2` (yerel) |
| Uç | `48588636` |
| Taban | `task/emp-001-b1-ek` @ `70a27ed1` (B1 + ek); onun tabanı `d261e51b` |
| Worktree | `.claude/worktrees/zen-cori-6c77ae` |

Commit'ler (eskiden yeniye; rebase sonrası kimlikler):
| Commit | Ne |
|---|---|
| `966bc2cc` | Söküm: shared, API, web. İlk üç rotanın kapısı. |
| `9b83bb9e` | K4 kuralı şemanın içinden yanına, saf fonksiyona taşındı. |
| `383adb82` | Matris dökümü (B1 sonrası; aşağıdaki son dökümle yenilendi). |
| `ab07020a` | Rol hafızası. |
| `2b25b85e` | Öteki üç rotanın kapısı ve dosyanın `authorize` sarmalayıcısı kalktı. |
| `2ba57efb` | İki yeni eylem TS ikizinde; son döküm (75 eylem). |
| `48588636` | Account formu: kalıcı ret için doğru cümle. |

Ara rapordaki kimlikler (`576e3f05`, `a666a9b4`, `134645e9`, `5eb8ba62`) rebase ile değişti; içerik aynı.

## 2. Ne yapıldı (etkisi)
**Söküm.** Employees ekranında müdürün "çalışmadan yönettiği lokasyonlar" diye ayrı bir listesi yok. Müdür yalnız atandığı lokasyonları yönetir; ekran, API ve ortak tipler bunu aynı şekilde söylüyor.
- Ortak tipler (`packages/shared`): çalışan kaydından `managed_locations`, liste satırından `managed_location_names`, izin cevabından `set_managed_locations` çıktı. `employeeManagedLocationsSchema` ve `employee.set_managed_locations` eylemi silindi.
- API: `PUT …/employees/:id/managed-locations` ucu ve servis sarmalayıcısı silindi. O adres artık 404 (rota yok).
- Web: çekmecedeki liste ve kaydı, listedeki "Manages <lokasyon>" çipi silindi. "No location" çipi duruyor.

**K4.** Remote olmayan her manager'ın en az bir lokasyonu olur; "Exclude from schedule" aranmaz.
- Okunur cümle (hint `employee.manager_location_required`): "A manager needs at least one location to manage. Choose a location, or turn on Remote." Sunucunun reddi ekrana bu cümleyle ulaşır (kayıt, "Remove", rol değişimi, davet).
- Çekmece önce kendisi söyler. Örnek: Derya manager, Beşiktaş'a atanmış ve işaretli. Beşiktaş'ın işaretini kaldırınca "Save changes" tutulur, alt çubukta bu cümle yazar, Locations alanı "Required" olur. "Remote" açılınca kayıt serbest kalır.
- İşaretli sıradan çalışan ve Remote kişi lokasyonsuz kaydolur (değişmedi).
- Yeni kişi eklerken manager rolüyle "Invite", kişi lokasyonsuzsa aynı cümleyle durur; davetsiz "Save" çalışır.
- İşaretsiz manager lokasyonsuz kalırsa çekmece yine manager cümlesini gösterir. Sunucu o durumda kayıt yolunda eski genel cümleyle cevap verir (`employee.location_required`); ikisi de okunur cümle.

**BL-443.** `employee-directory-routes.ts`'teki altı rotanın hiçbirinde dosya içi izin kapısı yok; sarmalayıcı silindi. Ret veritabanı çekirdeğinden gelir: 403 + `authz.*`, üye olmayana 404 + `authz.not_member`. Altı rota tek tablo testiyle sabitlendi (18 hücre).
- BL-280 (1) ölçümü: "employee" rolündeki kişi bugüne kadar kendi tercih edilen adını ve acil durum kişisini bu rotalardan kaydedemiyordu; rota `employees.read` izni istiyordu (kod okuması, `c5c5af9d`). Artık kaydedebiliyor: matris hücreleri `employee.save_own_contact | ali | self` = allow, `| ali | emre` = deny, erişimi alınmış `remzi | self` = deny (döküm, `2ba57efb`).

**BL-444, ekran tarafı.** Erişimi alınmış kişi ya da kapalı workspace'in çalışanı kendi acil durum kişisini artık yazamıyor. Account formu bu iki rette "Try again" demiyor; şunu yazıyor: "Your emergency contact can no longer be changed in <workspace>: your access there has ended or the workspace is closed."

**TS ikizi.** Çekirdekte 75 eylem. İkiz üç yeni matris satırını cevaplıyor (`settings.people`, `settings.people.read`, `employee.save_own_contact`). SQL'deki sıra da taşındı: kendi eylemi başkasının kaydında, onboarding'deki kişi için de "hayır".

**Benim hatam.** K4'ü ilk commit'te şemaya `is_manager_record` diye istemciden gelen bir ipucuyla koydum. Rol hafızamdaki BL-218 dersi bunu yasaklıyor; notu kodu yazdıktan sonra okudum. `9b83bb9e` ile düzeltildi: kural şemanın yanında saf fonksiyon (`managerLocationRefusal(rolSınıfı, kayıt)`); çekmece gösterdiği rolle sorar, payload ve API yeni alan görmez. Maliyet: shared kural, çekmece bağlaması ve testleri bir kez yeniden yazıldı.

## 3. Açık kalanlar
1. **Done when 11.** Üretim kodunda 0 satır. Testlerde 1 satır: API rota testindeki `…/managed-locations` adresi ("uç 404, rota yok" testi). Koordinatör kararı (a): kalır.
2. **Ekran görüntüsü alınmadı.** Davranış vitest'le kanıtlı; görsel kontrol birleşik dalda `nf-gorsel-qa`'da.
3. **K4 cümlesinin yeri.** İki cümle de çekmecenin alt çubuğunda görünüyor (bugünkü `employee.location_required` cümlesinin yeri), Locations alanının hemen altında değil. Taşımak görsel iş; `nf-gorsel-qa` bulgusuna ya da `nf-arayuz`'a bırakıldı.
4. **Rol sınıfı bulunamazsa form susar.** Çekmece manager'ı `references.inviteRoles` içinden `detail.role_id` ile tanıyor. Okuyan o rolü veremiyorsa liste rolü taşımaz; o zaman ret veritabanından aynı cümleyle gelir. Kaydı kaydedebilen admin ve owner için rol listede.
5. **`pnpm.cmd test:db` ve e2e koşulmadı** (görev dışı; migration ortak DB'ye uygulanmadı).
6. **`~/.claude/OBSERVATIONS.md` 30 maddeye ulaştı** (bu işin kaydı 30.); kural gereği dosyanın kullanıcıya gönderilme sırası. Kullanıcıya ben yazmıyorum; koordinatöre bırakıldı.

## 4. Ekranda ne değişti
**Employees → bir kişi → çekmece → Employment sekmesi**
- "Manages without working there" alanı yok.
- Manager kaydında Locations alanı, "Exclude from schedule" işaretli olsa da "Required".
- Manager lokasyonsuz kalınca alt çubukta yeni cümle; "Save changes" tutulur.
- Değişmeyenler: "Remove" düğmesi ve adları ("Remove from <lokasyon>", "Confirm remove from <lokasyon>"), soldaki "Employment" gezinti düğmesi. `nf-test`'in yeni e2e'sinin dayandığı adlara dokunulmadı.

**Employees listesi → Location sütunu (telefonda adın altı)**
- "Manages <lokasyon>" çipi yok. "No location" çipi duruyor.

**Account → profil formu (acil durum kişisi)**
- Erişimi bitmiş ya da kapalı workspace için yeni cümle (bölüm 2).

**Silinen kullanıcı metinleri**
- "Manages without working there"
- "Optional" (yalnız o alandaki)
- "Manager access where they don't work: no shifts and no Schedule row there."
- "No other locations."
- "Save" / "Saving" (o alanın düğmesi; erişilebilir adı "Save managed locations")
- "Manages <lokasyon>" (liste çipi)

**Yeni kullanıcı metinleri**
- "A manager needs at least one location to manage. Choose a location, or turn on Remote."
- "Your emergency contact can no longer be changed in <workspace>: your access there has ended or the workspace is closed."

**Artık ekrana gelmeyen API cümleleri** (yerine çekirdeğin "Not allowed" + `authz.*` cevabı): "Employee access required", "Employee management access required", "Workspace settings access required".

## 5. Sırada ne var
1. Koordinatör: `nf-test`'in e2e dalını birleşik dala almak; `nf-guvenlik` (R3), `nf-gorsel-qa`; kullanıcıya ultrareview önerisi.
2. Main'e alınmadan hemen önce iki migration'ın uygulanması, `pnpm.cmd test:db`, etkilenen e2e.
3. KARARLAR satırları (EMP-001.md "KARARLAR'da değişecek satırlar") aynı turda.

**Yolda bulunanlar (dokunulmadı; backlog önerisi)**
- Account formunda kalıcı ret alan workspace için taslak açık kalıyor: "Save" açık durur, her denemede aynı cümle gelir. Erişimi bitmiş workspace'in kaydı formun listesine hiç girmemeli ya da taslak o kayıt için düşmeli. leave: low / do: safe.
- `EmployeeDrawer.test.tsx` testler arasında mock'ları temizlemiyor; çağrı sayan yeni testler kendi `beforeEach`'inde temizliyor. leave: low / do: safe (B4'ün test planı bunu zaten istiyor).
- `employee-directory-routes.ts`'te `/me/avatar` rotası hâlâ `resolveWorkspaceMembership` ile kendi üyelik kontrolünü yapıyor (izin kapısı değil; 16a'nın saydığı altı rotadan biri değil). Çekirdeğe çevrilmesi ayrı madde. leave: low / do: moderate.

## Kanıt
**Tam kapı — `48588636`, 2026-09-30 12:33–12:37 UTC, CI koşmuyordu (`gh run list`), günlükler `artifacts/nf-backend/emp-001-b2/gate-*.log`:**
| Adım | Sonuç |
|---|---|
| `pnpm.cmd lint` | exit 0; 0 hata (web'de 20 uyarı, hepsi eski türden `react-hooks/exhaustive-deps`) |
| `pnpm.cmd typecheck` | exit 0; 7/7 görev |
| `pnpm.cmd test` | exit 0; ui 9, shared 185, api 1035, web 1908 geçti + 1 atlanan (221 dosya) |
| `pnpm.cmd build` | exit 0; 4/4 görev |

**Done when karşılığı**
| Madde | Durum | Kanıt |
|---|---|---|
| 11 | tamam (karar (a) ile) | `grep -rn "managed_location\|managedLocation\|ManagedLocation\|managed-locations\|Manages without" apps packages e2e` → 1 satır: `employee-directory-routes.test.ts:661`. `e2e/` 0. Liste testi: `EmployeeLocationParts.test.tsx` ("No location" durur, başka çip yok). |
| 12 (TS) | tamam | `authorization.test.ts` 20/20; döküm 75 eylem, 4182 hücre; "selin", `manages`, `employee.set_managed_locations` yok; "derya" ve `pl:can@K` var. |
| 14 (shared + çekmece) | tamam | `index.test.ts` K4 bloğu (5 test), `EmployeeDrawer.test.tsx` K4 bloğu (3 test), `EmployeeDrawer.create.test.tsx` (1 test). |
| 16a | tamam | `grep -c "await authorize(" …/employee-directory-routes.ts` → 0; `function authorize` → 0; rota tablosu 6 rota × 3 = 18 test. |

**Döküm yöntemi.** `AUTHZ_MATRIX_PRELUDE="supabase/migrations/20261001000000_….sql;supabase/migrations/20261001010000_….sql" pnpm.cmd --filter @newfork/shared dump:authz-matrix` → "wrote 4182 cells". İki migration dökümün kendi geri alınan işleminde koştu; kurucu yaması gerekmedi (döküm matrisin yalnız 2–5. bölümlerini okur). Ortak yerel veritabanı önce ve sonra aynı: 74 eylem, `membership_managed_locations` yerinde, son migration `20260930190000`. `db.lock` iki kez alındı ve bırakıldı.

**Kırmızı → yeşil.** Her kuralın testi önce düştü: çekmece testleri silinen alanı okurken çöktü; altı rota testi 403 "… access required" ve gerekçesiz 404 ile düştü; K4 testleri cümle ve fonksiyon yokken düştü; Account testi "Try again" cümlesiyle düştü. İkizdeki yeni sıra kuralı bir kez bozularak denendi: `employee.save_own_contact | aydan | ali: SQL deny, TS allow` düştü, geri alındı.

**Skill'ler.** `superpowers:writing-plans` (plan: `PLAN.md`), `superpowers:test-driven-development`, `superpowers:verification-before-completion` çağrıldı.

## Karar kaydı (kendi alanım)
| Karar | Dayanak | Geri alma maliyeti |
|---|---|---|
| K4 kuralı şemada değil, yanında saf fonksiyon | Rol hafızası `db-decides-client-mirrors` (BL-218 incelemesi); rol payload'da yok | Bir fonksiyon + çekmecede 3 çağrı |
| Çekmece rol sınıfını `references.inviteRoles` içinden `detail.role_id` ile bulur | Kayıt rol sınıfını taşımıyor; bulunamazsa veritabanı aynı cümleyle reddeder | Bir satır |
| Manager cümlesi "Exclude from schedule"ı önermez | Yeni kuralda işaret lokasyon ihtiyacını kaldırmıyor | Metin |
| Döküm betiğine `AUTHZ_MATRIX_PRELUDE` | Dal migration'ı ortak DB'ye yalnız main'e girerken uygulanıyor | 10 satır |
| Acil durum kişisi hatası `reason` taşır, cümle ekranda kalır | Ekran "tekrar dene" ile "artık olmaz"ı ayırmalı; sunucu cümlesi ekrana çıkmaz | 8 satır |
| Testler silinen alanları adıyla anmaz ("rota yok" testi hariç) | Done when 11 | — |
