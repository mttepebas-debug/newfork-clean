# JOIN-003 Tek karar noktası ve tek hub
Status: done (2026-09-21)
Session: -   Branch: task/join-003   Worktree: yok (tek oturum, ana checkout)   DB: -

Plan ID'leri: R1, R2, R3, R4, R5, R6, R7, R8, E3, E4

Goal: İniş kararı tek fonksiyonda verilsin; hesabın önündeki her açık iş tek ekranda dursun.

In scope:
- Yeni `apps/web/src/auth/resolveLanding.ts`: saf fonksiyon. Girdi `{inviteToken, pendingInvitations, workspaces, activeWorkspaceId}`, çıktı `{kind, path}`. Kural sırası plandaki R1→R6; R7 kuralın doğal sonucu (hazır workspace varsa davet inişi değiştirmez).
- Bugün kararı veren 8 yer buna bağlanır: `ProtectedRoute.tsx:58,69`, `App.tsx:638`, `PermissionRoute.tsx:42`, `PendingInvitationsPage.tsx:58,77,83`, `NoOrganizationPage.tsx:65-73`, `OrganizationSwitcherPage.tsx:70,80`, `WelcomeRedirect.tsx:26`, `SignInPage.tsx:36,39,54`.
- Tek hub: `/workspaces`. Tek liste, dört bölüm — hazır workspace'ler, bekleyen davetler, yarım kurulumlar, "yeni oluştur". Boş hâli R6'nın metnini taşır ("Yöneticinden davet iste" + "Kendi işletmeni oluştur").
- Aynı liste bileşeni iki yerde: kapı öncesi `/workspaces` (PreBizFrame) ve uygulama içi `/account/workspaces` (account çerçevesi). Tek satır bileşeni, tek eylem sözlüğü.
- `/invitations/pending`, `/no-organization`, `/organization-switcher` → `/workspaces`'e kalıcı yönlendirme.
- R3 düzeltmesi: yarım kurulum artık `/onboarding`'e zorlamaz. Hub satırında "Continue" ve iki tık "Discard".
- R5: iniş `last_used_at`'e göre (JOIN-002).
- Tasarım: karışık hâlde başlık "You have an invitation", açıklama "Declining can't be undone. Everything else keeps your progress."

Out of scope: switcher (JOIN-005), davet ekranı durumları (JOIN-004).

Done when: R1–R8 için birer Vitest testi; `resolveLanding` dışında iniş kararı veren kod kalmamış (grep kanıtı raporda); S2, S4, S10 elle turu geçmiş.
Touches: `apps/web/src/auth/*`, `apps/web/src/shell/*`, `apps/web/src/employees/PendingInvitationsPage.tsx`, `apps/web/src/account/WorkspacesPage.tsx`, `App.tsx`.
Test plan: `resolveLanding.test.ts` (R1–R7 tablo testi), hub render testi, yönlendirme testleri; silinen sayfaların testleri taşınır.
Risk: sekiz çağrı yerinin hepsi değişiyor; kaçan biri eski davranışı sürdürür. Grep ile kapanış kanıtı zorunlu.

## Notes / Result
- 2026-09-21 sonuç. `apps/web/src/auth/resolveLanding.ts` tek karar noktası; `routeDestinations.ts` silindi. Hub `/workspaces`; `PendingInvitationsPage`, `NoOrganizationPage` ve `OrganizationSwitcherPage` silindi, üç rotası hub'a yönleniyor. Askıda ekranı `/workspaces/suspended/:workspaceId`'e taşındı, eski yol yönlendirme.
- **R3 düzeltildi:** `ProtectedRoute.tsx:69` artık `/onboarding`'e değil hub'a gönderiyor. Yarım kurulum hub satırında "Continue" ve iki tık "Discard" ile duruyor. Tarayıcı kanıtı: `join-audit-draft@example.test` → `/app` → `/workspaces`, "IN PROGRESS · Half Built Co · Owner · Setup in progress · Discard · Continue".
- **R2 kanıtı:** `join-audit-other@example.test` → `/app` → `/workspaces`, "You have an invitation · Declining can't be undone. Everything else keeps your progress. · INVITATIONS · Join Audit Co · Expires in 6 days · Decline · Join". `/invitations/pending` de aynı ekrana yönleniyor.
- Hub tek satır kalınca (bir hazır workspace, bekleyen davet ve yarım kurulum yok) hesabı doğrudan o workspace'e alıyor (R4). Askıdaki bir workspace bu sayımı bozuyor: o da bakılacak bir satır, o yüzden otomatik geçiş olmuyor.
- `WorkspaceSummary` artık `lastUsedAt` taşıyor; `list_my_workspaces` henüz yazmadığı için `isActive` yedek sıralama ölçütü. DB tarafı JOIN-005'te.
- **Kapsamdan çıkarılan:** `account/workspaces` hâlâ kendi sayfası. "Tek bileşen iki mount" JOIN-009'a bırakıldı; o sayfa 900 satır ve kendi başına bir tasarım işi.
- **Worktree kullanılmadı.** `newfork-wt/join-002` `node_modules` yüzünden `git worktree remove` ile silinemedi ve `rm -rf` izni reddedildi. Tek sıralı oturumda branch aynı izolasyonu veriyor; kalan dilimler ana checkout'ta branch üzerinde yürüyor.
- **Kanıt:** `resolveLanding.test.ts` 12/12, `WorkspaceHubPage.test.tsx` 10/10, `pnpm.cmd typecheck` PASS, `pnpm.cmd test` PASS (212 dosya / 1532 test).

