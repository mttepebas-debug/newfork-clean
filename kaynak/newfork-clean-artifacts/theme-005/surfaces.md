# THEME-005 — yüzey taraması (light, 1440x900, development identity, web 5558 / API 5556)

Kural (branch `task/theme-005`, `apps/web/src/styles.css`): yeni kural yok. Mevcut `.secondary-button` ve `.secondary-button:hover` blokları
değer değişmeden `.nf-button:disabled` bloğunun hemen altına TAŞINDI (main'e göre net diff = saf taşıma + 1 yorum):

```css
/* must stay after .nf-button (same specificity; Button always adds nf-button) */
.secondary-button { border: 1px solid #bdc8c3; background: var(--theme-surface); color: #315048; }
.secondary-button:hover { background: #f0f4f2; }
```

İlk sürüm `.nf-button:where(.secondary-button)` idi (031b544); koordinatör kararıyla taşımaya çevrildi (559c0d9).
İki sürümün taraması birebir aynı: 35 senaryo, 148 buton ölçümü, fark 0 (`after-where-styles.json` vs `after-styles.json`).

Dosyalar: `before-*.png` (main), `after-*.png` (kural sonrası), `optA-*` / `optB-*` (seçici karşılaştırması),
`compare-before-after.txt` (buton başına computed style), `consumers.txt` (grep listesi), `*-styles*.json` (ham ölçüm).

Önce (tüm tüketiciler): zemin #196f5b, yazı #fff, çerçeve yok (birincil gibi).
Sonra: zemin #fff, yazı #315048, 1px #bdc8c3 — düz `<button class="secondary-button">` ile birebir aynı.
Hover: #125b4b -> #f0f4f2. Disabled: aynı renkler + `.nf-button:disabled` (opacity .55, not-allowed) aynen geçerli; ek `:disabled` kuralı gerekmedi.

| # | Yüzey | Butonlar (kaynak satırı) | Sonuç |
|---|-------|--------------------------|-------|
| 01 | /sign-in (dev) | Use development identity (SignInPage:154) | yeşil -> ikincil |
| 02-05 | /onboarding adım 1-4 (gerçek sayfa; harness yalnız dev context yanıtını "incomplete" yapar, repo değişmez) | Start over [compact] (482); Back (602/705/761); Add location (610), Add job (713), Add employee / Clear draft (769/780) disabled | yeşil -> ikincil; disabled soluk beyaz |
| 06 | /organization-switcher | Open x12 [compact] (141); aktif workspace [compact active-workspace] | Open: yeşil -> ikincil. Aktif: #e8f1ed / #0f4f42 korunur, tasarlanan 1px #89b9aa çerçeve artık görünür; hover #dceee7 (06b), Open hover #f0f4f2 (06c) |
| 07-09 | /account/profile (+dirty, +crop dialog) | Upload (159), Discard (248) disabled/enabled, Cancel crop (AvatarCropDialog:62) | yeşil -> ikincil |
| 07, 11 | /account/profile, /account/security | Remove (ProfilePage:164), Cancel change (SecurityPage:133) — eskiden `secondary-button danger-button` | Koordinatör kararıyla çelişkili `secondary-button` sınıfı kaldırıldı (f1694ed). Önce = sonra: #a84034 / #fff / çerçevesiz; disabled opacity .55; hover kırmızı kalıyor (11b). Ara durum (yalnız CSS kuralı, okunaksız koyu yazı) `optA-*`/`optB-*` görüntülerinde |
| 10-11 | /account/security (+pending email) | Sign out other sessions (167) disabled, Resend (130) | yeşil -> ikincil |
| 13-14 | /account/preferences, /preferences/notifications | Discard (98, 213) disabled | yeşil -> ikincil |
| 15-18 | /account/workspaces (+create, transfer, close dialogları) | Open x10 [compact] (517), Cancel (870, 671), Keep organization (759) | yeşil -> ikincil |
| 19-23, 29 | /app/employees drawer (owner + manager) | Cancel (1276), Resend / Invite (1287), Send reminder (2385), Revoke invitation (2394), Remove access (2340), Remove photo (2512) disabled, terminate Cancel (1542) | yeşil -> ikincil |
| 24-25 | /app/employees create drawer | Cancel (1154), Keep editing (1353) | DEĞİŞMEDİ: `.employee-drawer-create .nf-button.secondary-button` istisnası kazanıyor (transparent / inherit / #bac6bf) |
| 26-27 | /app/settings/support (+hover) | Copy diagnostics (87) | yeşil -> ikincil; hover #f0f4f2 |
| 30 | employee rolü /account/profile | Upload, Discard | yeşil -> ikincil |
| 31 | employee rolü /app/employee-hub | düz `<button class="secondary-button">` Retry | değişmedi (kontrol) |

Render edilemeyen tüketiciler (aynı sınıf kombinasyonu başka yüzeyde doğrulandı; kapsayıcılarında buton rengi veren kural yok — grep):
- KioskSettingsPage:296 (+ düz `nf-button secondary-button` 422): `postMvpSurfaces = false`, route yönlendiriyor.
- RolesSettingsPage:589/635: dev identity'de `permission denied for function read_role_workspace`, editör açılmıyor. Bu butonlar zaten `.bl051-roles .secondary-button` (0,2,0) ile boyanıyor; taşınan `.secondary-button` (0,1,0) onu ezmez, görünüm değişmez.
- PendingInvitationsPage:113 (Decline, `.workspace-row-actions` + compact): bekleyen davet verisi gerekir; Workspaces "Open" ile aynı kombinasyon.
- WorkspacesPage:456/801/825 (ownership transfer banner + yanıt diyaloğu): bekleyen transfer verisi gerekir; aynı kapsayıcı/kombinasyon 15-18'de doğrulandı.
- SecurityPage:196 (delete dialog Cancel): dev identity'de "Delete account" disabled.
- EmployeeDrawer:1776/1789 (Open document / Request changes), 2438 (Reset PIN), 2484 (avatar Retry): local veride bu durumlar yok.
