# THEME-005 buton rolleri — sınıflandırma (kullanıcı onayı bekliyor)

Kaynak: sen = kullanıcının örneği/kararı (bağlayıcı), eski = "eski halinde kalsın", öneri = worker önerisi, soru = karar gerekli. Satırlar rebase sonrası (main 2b64163).

## A. YEŞİL KALIR (aksiyon)

Bugün: yeşil. Sonra: yeşil (secondary-button sınıfı düşer). Geri alınabilirlik: yıkıcı değil.

| Buton | dosya:satır | Kaynak | Not |
|---|---|---|---|
| Add location | OwnerOnboardingPage:636 | sen |  |
| Add job · Add employee | OwnerOnboardingPage:739, 795 | öneri |  |
| Send reminder | EmployeeDrawer:2385 | sen |  |
| Resend / Invite (drawer alt bar) | EmployeeDrawer:1287 | sen |  |
| Resend (e-posta doğrulama) | SecurityPage:130 | öneri |  |
| Open (Workspaces) | WorkspacesPage:544 | sen |  |
| Continue (onboarding'e devam) | WorkspacesPage:535 | öneri |  |
| Open / View status (switcher) | OrganizationSwitcherPage:171 | soru | A: Workspaces ile aynı (yeşil + aktif satır highlight) · B: bugünkü tik işaretli soluk buton kalır. Kart 9 |
| Upload / Replace (profil foto) | ProfilePage:159 | eski |  |
| Sign out other sessions | SecurityPage:167 | eski |  |
| Copy diagnostics | SupportSettingsPage:87 | eski |  |
| Open document | EmployeeDrawer:1776 | eski |  |
| Use development identity (yalnız DEV) | SignInPage:161 | eski |  |
| Request changes (belge inceleme) | EmployeeDrawer:1789 | öneri |  |
| Retry (avatar) · Reset PIN (disabled) | EmployeeDrawer:2484, 2438 | öneri |  |
| Reject transfer (yanıt diyaloğunun ana butonu) | WorkspacesPage:828 | öneri | yanındaki Cancel beyaz |

## B. BEYAZ (vazgeçme / gezinme)

Bugün: yeşil (hata). Sonra: beyaz zemin + çerçeve. Yıkıcı değil.

| Buton | dosya:satır | Kaynak | Not |
|---|---|---|---|
| Cancel | EmployeeDrawer:1276, 1542 · SecurityPage:196 · WorkspacesPage:698, 852, 897 · Kiosk:296, 422 | öneri |  |
| Back | OwnerOnboardingPage:628, 731, 787 | öneri |  |
| Discard | ProfilePage:248 · PreferencesPage:98 · NotificationPreferencesPage:213 | öneri |  |
| Keep editing · Keep organization · Cancel crop | EmployeeDrawer:1353 · WorkspacesPage:786 · AvatarCropDialog:62 | öneri |  |
| Switch organization · Sign out (onboarding üst bar) | OwnerOnboardingPage:493, 501 | öneri |  |
| Reject owner transfer (banner; diyalog açar) | WorkspacesPage:469 | öneri |  |
| Clear draft (yalnız yerel taslak) | OwnerOnboardingPage:806 | öneri | iki tık yok |
| Değişmeyen: create drawer Cancel/Back · Roles Duplicate/Discard | EmployeeDrawer:1154 · RolesSettingsPage:589, 635 | öneri | kendi sayfa stilleri var |

## C. İKİ TIK KIRMIZI ONAY

Dinlenirken beyaz. İlk tık: kırmızı + "Click again to …"; ~3 sn, blur ya da Escape söndürür; ikinci tık çalıştırır. window.confirm kalkar.

| Buton | dosya:satır | Kaynak | Not |
|---|---|---|---|
| Start over | OwnerOnboardingPage:508 | sen | bugün window.confirm · geri alınamaz (kurulum verisi silinir) |
| Revoke invitation | EmployeeDrawer:2394 | sen | bugün onaysız · geri alınamaz (yeni davet gerekir) |
| Remove photo (employee) | EmployeeDrawer:2512 | sen | bugün window.confirm · geri alınamaz |
| Remove access | EmployeeDrawer:2340 | öneri | bugün window.confirm · yeniden davetle geri alınır |
| Decline (davet) | InvitationRow:64 | öneri | bugün window.confirm, "cannot be undone" · geri alınamaz |
| Restore employee (arşivden geri al) | EmployeeDrawer:1242 | soru | çıplak onay ama olumlu işlem: iki tık (kırmızı) uygulansın mı? Kart 8 önerimi gösteriyor |

## D. ZATEN KIRMIZI OLANLAR

Bugün: dolu kırmızı. Dinlenme hali yumuşar; onay aşaması dolu kırmızı.

| Buton | dosya:satır | Kaynak | Not |
|---|---|---|---|
| Cancel (eski "Cancel change") | SecurityPage:133 | sen | yumuşak kırmızı + iki tık · onaysız sunucu işlemi |
| Remove (profil foto) | ProfilePage:164 | öneri | yumuşak kırmızı + iki tık · Save'e kadar Discard ile geri alınır |
| Delete account | SecurityPage:180 | öneri | yumuşak kırmızı, iki tık yok · diyalog açar (şifre + sonuçlar) |
| Confirm account deletion · Close now | SecurityPage:197 · WorkspacesPage:767 | öneri | diyalog içi son onay: dolu kırmızı kalır |

## E. DOKUNULMAYANLAR + WORKSPACES

Etki listesi / şifre adımı gösterenler kuralın gereği değişmez.

| Buton | dosya:satır | Kaynak | Not |
|---|---|---|---|
| Terminate employee · Transfer ownership · Close later/now menüleri | diyalog açar | sen |  |
| Taslak üstüne yazma onayı · "Discard unsaved changes?" | SchedulePage:1258 · DocumentReviewDrawer:277 | öneri | buton değil, akış onayı · bu işin dışında |
| Delete template | ScheduleTemplateDialogs:170 | öneri | çıplak onay, iki tık uygun; ama Schedule yüzeyi bu işin dışında (backlog) |
| Roles / Announcements / Templates mevcut iki tık | çalışıyor | öneri | ortak parçaya taşıma backlog |
| Workspaces sekmesi | WorkspacesPage:528+ | sen | o anki satır highlight · "Current" rozeti kalkar · Open her satırda yeşil ve tıklanabilir |
