# FB-6.5 Availability — iki müsaitlik testi yeşile, eski mod geçişinin ölü yolları silinir
Status: ready — 2026-10-01 (Mert onayı ~22:45Z, koordinatörün penceresinde: "İkisini de yap (Önerilen)"; koordinatör beslemesi #89). Uygulama başlamadı.
Session: -   Branch: task/fb-6.5   Worktree: newfork-wt/fb-6.5   DB: `db.lock` (pgTAP ve migration denemesi); migration yeni dosya
Reviewer: koordinatör + `/code-review` (tek bağımsız inceleme, R2). `nf-guvenlik` gerekmez (yetki kuralı değişmiyor). Ekrandan kutu kalkıyor: koordinatör ekran görüntüsü (masaüstü + telefon, R1 düzeyi görsel); `nf-gorsel-qa` yok.

**Tazelik 2026-10-01 (`25c63a37`; `nf-planlama` alt ajanı salt okuma, koordinatör üç satırı elle doğruladı; kayıt oturumu `057ae525`'te yeniden ölçtü): değişmiş.** FOUNDATION-B'deki dilim cümlesinin iki parçası zaten main'de:
- `weekly_preference_manager_scope` tamamen `authz_reason` üzerinden — son tanım `supabase/migrations/20260926130000_manager_note_is_about_employees.sql:242-255` (BL-139, `f0ca450`); matris `supabase/tests/authorization_matrix.test.sql:309` (ölçüldü).
- Müsaitlik kartı `employees.read` ister — kapı web'de: `apps/web/src/views/AvailabilityPage.tsx:82` (`can(context, "employee.read")`), `:248`, `:272` (ölçüldü; BL-243); rol kaydı `availability.read`'i `employees.read`siz reddediyor (`supabase/migrations/20260914092711_bl051_roles_permissions.sql:50`, ölçüldü).
- FB-6.3 bu dilimi değiştirmedi. Kalan: iki kırmızı test dosyası ve BL-086.

Goal: müsaitliğin iki veritabanı testi bugünkü kurala göre yeşile ve CI yeşil listesine girer; eski mod geçişinin ölü yolları (BL-086) web'den, sunucudan ve testten silinir. Bir kişi için: My availability ve çalışan kartında artık hiç oluşamayan "Entry mode changed…" kutusu ve "Use current mode" uyarısı görünmez.

In scope:
- (a) İki kırmızı pgTAP dosyası, beklenti gevşetilmeden bugünkü kurala:
  - `supabase/tests/weekly_team_availability.test.sql` — hücre 2-3 ve 25: müdür `tests.works_at` ile çalışan kaydı alır; sayılar bugünkü kurala göre (müdürün kendi satırını listede görüp görmediği **doğrulanacak**: beslemede dayanak `KARARLAR.md:67` gösterildi, ama o satır "okuma = bildirim alıcıları" der, kendi satırını açıkça söylemez — kayıt oturumu ölçtü; `nf-db` kodda ölçer, cevabı yoksa koordinatöre soru olarak döner). Hücre 23: ürün içinden kurulamayan durum — silinir ya da kurulabilir duruma çevrilir. Hücre 24: "`availability.read` izni olmayan rol 42501 alır".
  - `supabase/tests/onboarding_composite_tenant_constraints.test.sql` — hücre 7 silinmiş `employee_availability_versions` tablosuna yazıyor; silinir, plan 8 → 7.
  - İkisi `supabase/tests/ci-not-green.txt:10`, `:13`'ten `supabase/tests/ci-green.txt`'e (ölçüldü: iki satır `ci-not-green.txt`'te, kırmızı kaydı CI 36588987982, 2026-09-29).
- (b) BL-086 ölü yollar:
  - web `apps/web/src/availability/WeeklyPreferencesForm.tsx:77` (`staleMode`), `:89` (`copiedOldMode`), `:134`, `:138`, `:363-393` ("Entry mode changed. Previous preferences remain in effect…" kutusu `:366`, "Previous preferences" açılır listesi `:370`, "Use current mode" `:393` — ölçüldü); `staleMode` / `copiedOldMode` 9 eşleşme (ölçüldü). İlgili web testi.
  - sunucu: `validate_weekly_preference_command`'ın modlar arası kopya ve `confirm_clear` dalları (son tanım `supabase/migrations/20260909041800_weekly_preferences_commands.sql:55-61`, BL-086 tazeliği) — yeni migration ile. Not: `copy_employee_revision` aynı modda kopya için de kullanılıyor; yalnız modlar arası dalı ölü (BL-086 tazelik eki).
  - test `supabase/tests/weekly_preferences_commands.test.sql:59-68` (modu SQL ile çevirip eski modda kopya kuran bölüm — ölçüldü).

Out of scope:
- BL-088 (mod dönüşümü bekleyen istek kontrolünü atlıyor) → FB-6.4'e taşındı (koordinatör kararı KK-81).
- `can_open`'a `employees.read` eklemek: yok. Kapı web'de ve rol kaydı zaten engelliyor; ikinci kontrol olur.
- Müsaitlik ekranının başka görsel değişikliği.

Done when:
1. `weekly_team_availability.test.sql` ve `onboarding_composite_tenant_constraints.test.sql` `supabase/tests/ci-green.txt`'te, `ci-not-green.txt`'te değil; main CI `db` yeşil.
2. `grep -c "staleMode\|copiedOldMode"` web kodunda 0; sunucuda modlar arası kopya ve `confirm_clear` dalı yok (son tanım yeni migration'da).
3. `weekly_preferences_commands.test.sql` yeşil (eski mod kopyası bölümü silinmiş).
4. My availability ve çalışan kartında (Employees → kişi → Availability) kutu yok — masaüstü + telefon ekran görüntüsü (koordinatör).
5. Migration canlıda (KARARLAR OPS-03 sırası, `nf-db`'nin raporuyla; kullanıcı onayı).
6. `/code-review` bulguları kapandı; Notes / Result'ta kanıtlar (komut + sonuç, sha, CI koşusu).

Touches: tek işçi oturumu, roller sırayla. Önce `nf-db`: `supabase/tests/weekly_team_availability.test.sql`, `supabase/tests/onboarding_composite_tenant_constraints.test.sql`, `supabase/tests/weekly_preferences_commands.test.sql`, `supabase/tests/ci-green.txt`, `supabase/tests/ci-not-green.txt`, yeni migration (`supabase/migrations/`). Sonra `nf-arayuz`: `apps/web/src/availability/WeeklyPreferencesForm.tsx` (+ ilgili test). Dal `task/fb-6.5`, worktree `../newfork-wt/fb-6.5`.

Test plan: migration önce tek transaction + rollback ile denenir (ortak yerel DB); `pnpm.cmd test:db` (`db.lock`) — iki dosya ve `weekly_preferences_commands` yeşil, başka dosya kırmızıya dönmez; web için `pnpm.cmd --filter @newfork/web exec vitest run` ilgili dosya, `typecheck`, `lint`; push öncesi tam kapı (lint, typecheck, test, build) + `test:db`; ekran görüntüsü masaüstü + telefon.

Risk: R2 — kaydetme doğrulaması (`validate_weekly_preference_command`) hem çalışanın hem yöneticinin kaydında ortak; yanlış dal silinirse aynı modda kopya bozulur (`copy_employee_revision`). Yetki kuralı değişmiyor. Tahmin ~0,3 kişi-hafta (ölçülmedi). Ölçülemeyen: hücre 2, 3 ve 25'in bugünkü gerçek sayıları; iki dosyanın bugünkü kırmızı listesi (son CI ölçümü 2026-09-29, CI 36588987982).

## Notes / Result
- 2026-10-01 (kayıt oturumu `local_43ff0725…`, koordinatör beslemesi #89; taban `057ae525`): görev dosyası açıldı. Kayıt oturumunun ölçtükleri: tazelikteki kod satırları (yukarıda "ölçüldü" yazanlar); BL-087 2026-09-24'te kapanmış (`BACKLOG.md:958`; beslemedeki `:943` değil); `KARARLAR.md:67` müdürün kendi satırını açıkça söylemiyor (In scope (a)'da "doğrulanacak").
