# AUTH-004 Owner kurulumu yarım workspace'te owner olmayan üye owner onboarding'e yönleniyor
Status: draft
Session: -   Branch: task/auth-004   Worktree: newfork-wt/auth-004   DB: -
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
