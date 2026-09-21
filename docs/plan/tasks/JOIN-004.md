# JOIN-004 Davet: sunucu sözleşmesi, altı hâl, admin yönetimi
Status: draft
Session: -   Branch: task/join-004   Worktree: newfork-wt/join-004   DB: KİLİT

Plan ID'leri: E2, E6, G4, S5, S6, S8, S9, S15, M4

Goal: Bir davet linkinin her hâli sunucudan adıyla gelsin, ekranda kendi ekranı olsun; admin daveti tek yerden yönetsin.

In scope:
- DB: `preview_employee_invitation_service` null yerine durum döner — `valid | expired | revoked | declined | accepted | workspace_unavailable | not_found`. Token bulunamazsa `not_found`; workspace `draft/suspended/closed` ise `workspace_unavailable`.
- API: errcode → HTTP eşlemesi. `42501` → **403**, `P0002` → **404**, `23505` → **409**, kalan → **500**. Ham Postgres mesajı artık gövdeye yazılmaz; yerine sabit `code` alanı döner. `app.ts:644-775` beş uçta.
- UI `AcceptInvitationPage`: altı hâl, her biri kendi başlığı + cümlesi + eylemiyle. Hiçbir hâl çıkmaz sokak değil ("Go to your account" / "Sign out"). Durum tespiti artık İngilizce cümle karşılaştırmasıyla değil (`AcceptInvitationPage.tsx:50-52` kalkar).
- E-posta uyuşmazlığı hâli maskeli adresi gösterir ve hesap değiştirmeyi önerir (S5).
- Admin davet yönetimi: çalışan drawer'ındaki dağınık eylemler tek davet bloğuna toplanır — durum, rol, davet eden, son geçerlilik; **link kopyala**, tekrar gönder, iptal. Link kopyalama için API davet linkini yalnız yetkili isteyene döner (bugün sadece DEV yanıtında var).
- `EmployeeDrawer.tsx:1242,2352,2524` `window.confirm` çağrıları `ConfirmButton`'a çevrilir.
- Sign-up metni: "Create your business account" → "Create your workspace account" + "You will name the workspace itself in the next step." (`SignInPage.tsx:69-71`).

Out of scope: davet e-postasının şablonu/teslimatı, yeni davet kanalı.
Done when: S5, S6, S8, S9, S15 elle turu geçmiş; her HTTP kodu için bir API testi; altı hâlin her biri için bir render testi; pgTAP preview durum testi.
Touches: `supabase/migrations/*`, `apps/api/src/app.ts`, `apps/api/src/employees/invitation-service.ts`, `apps/web/src/employees/AcceptInvitationPage.tsx`, `EmployeeDrawer.tsx`, `InvitationRow.tsx`, `SignInPage.tsx`, `packages/shared`.
Test plan: Vitest (API kodları + UI hâlleri) + pgTAP (`invitation_preview_states.test.sql`).
Risk: davet linkini API'den döndürmek sızıntı yüzeyi açar — yalnız `employee_access.manage` izni olana, yalnız pending davet için, log'a yazmadan.

## Notes / Result
