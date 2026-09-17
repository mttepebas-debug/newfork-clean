# AUTH-002 Niyet ayrımı: davet guard'ı, "Not now", çoklu üyelik onboarding (plan T2)
Status: draft (AUTH-001 merge edildikten sonra)
Session: -   Branch: task/auth-002   Worktree: newfork-wt/auth-002   DB: lock (2 yeni migration)
Öneri: Opus 5, high. Yetki guard'ı, RPC imza değişikliği ve çok yüzeyli akış birlikte değişiyor.
Kaynak plan (kararlar dahil, bağlayıcı): `C:/Users/TheWe/.claude/plans/kay-t-olduktan-sonra-login-idempotent-eich.md` → bölüm "T2" ve "Edge case'ler".

Goal: Davetli kişi employee olarak yönlendirilsin, işveren kendi workspace'ini kursun. Workspace'i olan kullanıcı yeni daveti login'de görsün. Çoklu üyelikte doğru organizasyonun onboarding'i açılsın.

Kullanıcı kararları (2026-09-16, özet; ayrıntı planda):
- **Create workspace izni** (UI ve DB aynı kural): active owner üyeliği varsa yaratabilir; üyeliği yoksa ve bekleyen davet de yoksa yaratabilir; bekleyen davet varsa ve owner üyeliği yoksa yaratamaz; owner olmayan üyeliği olan hesap yaratamaz.
- **KİLİTLİ KARAR DEĞİŞİKLİĞİ:** docs/rebuild `onboarding-master-implementation-plan-2026-09-05.md:283-293`'teki "Start my own organization daveti bekler bırakır" kararı sert engelle değiştirildi. Gerekçe: davetli kişi employee'dir; yanlışlıkla işveren hesabı açılmasını ve ortaya çıkan hatalı kurulum döngüsünü önlemek.
- **Korunan kararlar:**
  - Switcher org yaratmayı öne çıkarmaz.
  - Login ve sayfa odağında kontrol yapılır, polling yok.
  - E-posta tam eşleşmeli.
  - Decline geri alınamaz.
- **Decline sonrası:** active 0 → `/no-organization`; 1 → rolüne göre o workspace; >1 → switcher.
- **Yeni davet:** workspace'i olan kullanıcıya login'de "Active invitation found" gösterilir. "Not now" tab oturumu başına bir kez çalışır (sessionStorage); davet kartı switcher'da ve Workspaces'te kalır.
- **Onboarding workspace bazlı:** `get_employee_onboarding_service(target_user_id, target_workspace_id default null)`; `/welcome/:workspaceId`; `pending_activation` üyelik için "Onboarding in progress · Continue".
- **Listeleme:** terminated üyelikler listede görünmez; pending ve suspended status kartıyla görünür.
- **Başka e-postaya gelen davet:** açık uyarı gösterilir, e-posta lookup'ı yapılmaz. Switch account ekranı sıkılaştırılır.
- **Billing notu (kod yok):** workspace = şirket = abonelik; trial bir kez.

In scope: plan T2 madde 1–6.
- DB guard ve onboarding getter için 2 migration ve pgTAP.
- ProtectedRoute login-time davet kontrolü.
- PendingInvitationsPage: "Not now", "Start my own" kaldırılır, decline yönlendirmesi.
- Davet kartı.
- `/welcome/:workspaceId`.
- Token'ın sessionStorage'da tutulması.
- terminated filtresi.
- Revoke edilmiş ya da sunucuda sonlanmış session (getUser "Auth session missing!"): uygulama sign-in'e yönlendirir; davet ekranı ya da "Valid bearer session required" hatası gösterilmez (THEME-004 bulgusu).

Out of scope: billing, e-posta lookup'ı, polling.

Done when:
- Plan T2 "Doğrulama" senaryoları (a), (b) ve (c) local'de geçiyor.
- pgTAP (account_workspace_controls ve onboarding), API ve web focused testleri, typecheck PASS.
- Migration'lar local'e uygulanmış (DB lock). Hosted push OPS akışıyla ayrıca yapılacak.

Risk:
- `get_employee_onboarding_service` imza değişikliği: mevcut çağıranlar default parametreyle çalışır.
- pgTAP fixture drift (memory `local-db-test-fixture-drift`).
- UI-DOC-001 da DB kilidi isteyecek; ikisi aynı anda çalışmaz.
- Mockup: davet kartı ve "Onboarding in progress" UI kararı gerekirse kullanıcı onay beklemeden gerçek mockup gönderilmesine izin verdi (memory `realistic-mockups`).

## Notes / Result
