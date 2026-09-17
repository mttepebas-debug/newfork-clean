# AUTH-004 Owner kurulumu yarım workspace'te owner olmayan üye owner onboarding'e yönleniyor
Status: done
Session: "AUTH-004: owner olmayan üye owner sihirbazına düşüyor" (local_2e3cd091; AUTH-UX-001 worker'ı, hatayı o buldu)   Branch: task/auth-004   Worktree: newfork-wt/auth-004   DB: -
Öneri: Sonnet 5, medium. Tek guard ve küçük bir durum paneli.

Goal: Owner kurulumu bitmemiş bir workspace'te aktif olan admin/manager/employee, owner kurulum sihirbazını görmesin; ne olduğunu anlatan bir durum ekranı görsün.

Kök neden (AUTH-UX-001 uçtan uca bulgusu, 2026-09-17): `apps/web/src/auth/ProtectedRoute.tsx` `workspace === "complete" && context.onboarding.status !== "complete"` durumunda rol ayırmadan `/onboarding`'e yönlendiriyor. Owner 4. adımda ekip davet edebildiği için gerçek hayatta olur: employee onboarding'i bitirip aktive olan kişi owner sihirbazına düşer. `/onboarding` route'u (`workspace="any"`) da rol kontrolü yapmıyor.

In scope:
- ProtectedRoute: `/onboarding` yönlendirmesi yalnız `context.membership.role === "owner"` için. Diğer rollerde auth ailesi paneli (`main.sign-in-page > section.sign-in-panel`): h1 "Workspace setup in progress", muted "The owner has not finished setting up {workspace}. You will get access when setup is complete.", `nf-button` "Check again" (`refresh()`), `secondary-button` "Switch organization" (yalnız >1 workspace) ve "Sign out". Tasarım mevcut recovery paneliyle aynı kalıp; ayrı mockup gerekirse gerçek uygulamada tek ekran.
- `/onboarding` route'una owner olmayan doğrudan gelirse aynı panel.
- API tarafında owner onboarding mutasyonlarının owner kontrolü yaptığını doğrula (yalnız kontrol; eksikse raporla).
- Testler: ProtectedRoute (employee + incomplete → panel; owner + incomplete → /onboarding).

Out of scope: owner onboarding akışının kendisi, bildirim ("kurulum bitti") gönderimi.

Done when: iki rol senaryosu testte ve local'de doğrulandı; web typecheck PASS; branch push + rapor.
Risk: düşük; yönlendirme kuralı değişiyor, döngü testi şart.

## Notes / Result
- 2026-09-17: kullanıcı local fixture temizliğini onayladı; temizlik AUTH-004 doğrulamasından SONRA yapılır (fixture'lar hatayı yeniden üretmek için gerekli). Temizlik öncesi local DB yedeği repo dışına alınır.
- 2026-09-17 kapanış: main dfe6fb4 (ff-merge, push). ProtectedRoute: onboarding incomplete + rol owner değil → `WorkspaceSetupPending` paneli (render, redirect değil); owner → `/onboarding`. `/onboarding`'e doğrudan gelen non-owner da paneli görür. Testler: 9 dosya / 103 test, typecheck PASS (worker). Local doğrulama: test2'de active employee → panel, Check again döngü yok, Switch organization, owner → sihirbaz. API: owner onboarding mutasyonları employee token'ıyla 403; DB'de ayrıca `role = 'owner'` kontrolü var.
  - Ekran görüntüsü: `artifacts/auth-004/workspace-setup-in-progress.png`.
