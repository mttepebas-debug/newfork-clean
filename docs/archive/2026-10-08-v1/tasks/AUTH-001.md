# AUTH-001 Kayıt sonrası döngüyü kır, switcher UI, sign-in prod metni (plan T1)
Status: done
Session: -   Branch: task/auth-001   Worktree: newfork-wt/auth-001   DB: yok
Öneri: Sonnet 5, medium. Küçük ama akış kritik; birkaç web dosyası değişiyor.
Kaynak plan (kararlar dahil, bağlayıcı): `C:/Users/TheWe/.claude/plans/kay-t-olduktan-sonra-login-idempotent-eich.md` → bölüm "T1".
İlişki: OPS-010 hosted smoke'unu blokluyor (sign-up → workspace adımı geçmiyor). Devamı: AUTH-002.

Goal: Davet linki olmadan kayıt olan kullanıcı ilk workspace'ini yaratıp `/onboarding`'e ulaşsın. Organization switcher, kardeş sayfalarla aynı görünsün. Sign-in sayfasında dev metni kalmasın.

Kök neden:
- `WorkspacesPage.tsx:76` `canCreate`, yalnızca owner üyeliği olan hesapta true dönüyor.
- Sıfır workspace'te boş durum butonu kullanıcıyı switcher'a gönderiyor; switcher ise geri `/account/workspaces`'e gönderiyor. Sonuç kapalı bir döngü.
- DB ve API ilk workspace'in yaratılmasına zaten izin veriyor.

In scope (ayrıntı planda):
- **WorkspacesPage:**
  - `canCreate = !loading && (hiç workspace yok || owner üyeliği var)`.
  - Boş durumda "Create workspace" CTA gösterilir (aynı state setter kullanılır; `id` tekrarı yok).
  - `location.state.openCreate` gelirse dialog otomatik açılır.
- **Yönlendirmeler:** NoOrganizationPage ve PendingInvitationsPage `:134` linkleri `state={{ openCreate: true }}` taşır.
- **OrganizationSwitcherPage:**
  - Boş listede `/no-organization`'a yönlendirir; boş durum bloğu silinir.
  - Markup `main.sign-in-page > section.sign-in-panel` + `p.product-mark` kalıbına alınır.
- **styles.css:** `.text-button` için tek kural. Light token'lar kullanılır; dark kuralı yazılmaz.
- **SignInPage:** varsayılan e-posta boş olur. Metin "Sign in with your email and password." olur.
- **Testler:** WorkspacesPage, OrganizationSwitcherPage, SignInPage ve NoOrganizationPage (planda listeli).

Out of scope:
- Davet guard'ı, "Not now", çoklu üyelik onboarding ve DB değişikliği (AUTH-002).
- Vercel ya da hosted ayarları.

Done when:
- Local: yeni auth user → sign-in → `/no-organization` → create dialog açık → ad girilir → `/onboarding`.
- Switcher, üyeliği olan kullanıcıda kardeş sayfalarla aynı panel görünümünde.
- Planda listelenen 4 test dosyası ve web typecheck PASS.
- Branch push edilmiş, rapor gönderilmiş.
- Merge sonrası OPS-010 hosted smoke'u tekrar denenecek (koordinatör).

Test plan: değişiklikler bitince 4 test dosyası ve typecheck; ardından tek bir local browser akışı (5558 portu, API 5556).

Risk:
- THEME-002 aynı anda styles.css'e dokunuyor. `.text-button` tek kural olduğu için rebase'de çakışma küçük olur.
- Mockup kuralı: switcher görünümü mevcut kardeş sayfa kalıbına alındığı için ayrı mockup gerekmez.

## Notes / Result
- 2026-09-16 ara rapor (task/auth-001 @ 8532d6a):
  - Döngü kırıldı: local'de yeni kullanıcı → /no-organization → create → 201 → /onboarding.
  - Switcher panel görünümüne alındı. `loaded` bayrağı eklendi (fail-closed korunuyor).
  - 39 test PASS; typecheck PASS.
- Engel bulundu: yeni owner workspace'te GET /v1/context 503 dönüyor.
  - workspace-context.ts, `get_employee_document_access_service`'i çağırıyor; bu fonksiyon onboarding'i tamamlanmamış workspace'i `workspace_allows_interactive_access` ile reddediyor (P0002).
  - Koordinatör kararı: hedefi engellediği için bu task'ta çözülüyor. Document access yalnızca onboarding complete iken hesaplanır (yalnızca API; DB değişmez); API testi eklenir.
- Ek: `.sign-in-panel .workspace-row .nf-button { width: auto; }` onaylandı.
- Local'de test verisi var: "AUTH001 Test Kitchen".
- 2026-09-17 kapanış (koordinatör): task/auth-001 main'e rebase edildi (çakışma yok), ff-merge a69276e, push edildi; hedefli web 45/45, api 118/118, typecheck PASS. Plan madde 7 (docs/archive/rebuild notu) atlandı (tarihsel belge).
  - Rapor takipleri: madde 1 (owner onboarding çıkışı) ve 2a (switcher recovery) ve 2b (revoke edilmiş oturum, kök çözüm web'de) → tasks/AUTH-UX-001 (S1, S2, S6). T1 açığı ("Start my own" davetliye açık) → AUTH-UX-001 S4 + AUTH-002 DB guard'ı.
  - OPS-010 hosted smoke: Vercel redeploy sonrası temel akış denenebilir; tam smoke AUTH-002 + AUTH-UX-001 sonrası.
