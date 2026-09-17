# THEME-005 İkincil buton cascade hatası: `<Button className="secondary-button">` birincil gibi render oluyor
Status: draft (kullanıcı onayı bekliyor; AUTH-UX-001 merge'ünden sonra)
Session: -   Branch: task/theme-005   Worktree: newfork-wt/theme-005   DB: -
Öneri: Sonnet 5, medium. Tek kök kural ve görsel tarama.

Goal: `@newfork/ui` `Button` ile kullanılan `secondary-button` uygulamanın her yerinde tasarlandığı gibi (beyaz zemin, çerçeveli) görünsün.

Kök neden (AUTH-UX-001 worker bulgusu, koordinatör doğruladı 2026-09-17): `apps/web/src/styles.css`'te `.secondary-button` (~3366) kuralı `.nf-button` (~3401) kuralından önce ve aynı özgüllükte. `Button` her zaman `nf-button` sınıfını eklediği için `.nf-button` background/color/border kazanıyor. Etkilenenler: Owner onboarding "Start over", switcher "Open", ownership-transfer "Reject", Workspaces "Open" ve diğerleri (yaklaşık 39 dosyada `<Button … secondary-button>` kullanımı). Düz `<button className="secondary-button">` etkilenmiyor. Tek mevcut istisna: `.employee-drawer-create .nf-button.secondary-button` (2607).

In scope:
- Tek kök kural: `.nf-button.secondary-button` (+ `:hover`, `:disabled`); değerler mevcut `.secondary-button` ile aynı, token'lı. `.nf-button` bloğundan sonra konur.
- AUTH-UX-001'in kapsamlı (scoped) üç seçicisi (`.sign-in-panel`, `.onboarding-header-actions`, `.workspace-row-actions`) kaldırılır.
- Görsel tarama: etkilenen tüm tüketiciler light temada gözden geçirilir (liste grep ile çıkarılır); beklenmeyen görünüm değişikliği varsa rapora yazılır, sessizce sayfa bazlı override eklenmez.
- `compact-button` ve `danger-*` kombinasyonları kontrol edilir.

Out of scope: buton sistemi redesign'ı, yeni varyantlar, THEME-003 ton birleştirme.

Done when:
- Kök kural yerinde; scoped kopyalar silinmiş; `light-theme.test.ts`, web typecheck ve build PASS.
- Etkilenen yüzeylerin önce/sonra listesi raporda; kullanıcı görsel onayı.

Test plan: CSS işi; sonda typecheck, build, light-theme testi bir kez. Web 5558.
Risk: uygulama genelinde görünür değişiklik (yeşil ikincil butonlar beyaza döner). Bu, tasarlanan görünümdür; yine de kullanıcı onayı ile başlar.

## Notes / Result
