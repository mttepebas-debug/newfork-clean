# THEME-005 Buton rolleri: aksiyon yeşil, vazgeçme beyaz, destructive iki tık (ikincil buton cascade düzeltmesinden genişledi)
Status: beklemede (2026-09-17 kullanıcı kararı: kararlar UI-LAB-001 F2 hazır olunca lab üzerinden verilecek)
Session: "THEME-005: ikincil buton cascade düzeltmesi" (local_739c4385)   Branch: task/theme-005   Worktree: newfork-wt/theme-005   DB: -   Port: web 5558 (API 5556)
Öneri: Sonnet 5, medium. Tek kök kural ve görsel tarama.

Goal: `@newfork/ui` `Button` ile kullanılan `secondary-button` uygulamanın her yerinde tasarlandığı gibi (beyaz zemin, çerçeveli) görünsün.

Kök neden (AUTH-UX-001 worker bulgusu, koordinatör doğruladı 2026-09-17): `apps/web/src/styles.css`'te `.secondary-button` (~3366) kuralı `.nf-button` (~3401) kuralından önce ve aynı özgüllükte. `Button` (`packages/ui/src/components/Button.tsx`) her zaman `nf-button` sınıfını eklediği için `.nf-button` background/color/border kazanıyor. Etkilenen örnekler: Owner onboarding "Start over", switcher "Open", ownership-transfer "Reject", Workspaces "Open". `secondary-button` 39 `.tsx` dosyasında geçiyor. Düz `<button className="secondary-button">` etkilenmiyor. Tek mevcut istisna: `.employee-drawer-create .nf-button.secondary-button` (2607).

Sıra (koordinatör): AUTH-UX-001'i beklemeden main'den başlar. İki branch `styles.css`'te farklı bloklara dokunur (AUTH-UX-001: `.secondary-button` seçici listesi; bu task: `.nf-button` bloğundan sonra yeni kural). AUTH-UX-001'in kapsamlı (scoped) üç seçicisi (`.sign-in-panel`, `.onboarding-header-actions`, `.workspace-row-actions` altındaki `.nf-button.secondary-button`) main'e ikinci giren tarafından kaldırılır; koordinatör takip eder.

In scope:
- Tek kök kural: `.nf-button.secondary-button` (+ `:hover`, `:disabled`); değerler mevcut `.secondary-button` ile aynı, `--theme-*` token'lı. `.nf-button` ve `.nf-button:hover` bloklarından sonra konur. Yeni hex yok, dark kuralı yok.
- Tüketici listesi grep ile çıkarılır (`<Button` + `secondary-button`); her yüzey light temada gözden geçirilir. `compact-button`, `danger-button`, `danger-text-button`, `active-workspace` kombinasyonları ve `:disabled` kontrol edilir.
- Beklenmeyen görünüm değişikliği (ör. bilinçli olarak yeşil bırakılmış bir ikincil buton) varsa uygulamadan önce koordinatöre sor; sessizce sayfa bazlı override ekleme.
- `.employee-drawer-create .nf-button.secondary-button` istisnası: kök kural aynı görünümü veriyorsa kaldır, farklıysa bırak ve raporla.
- Oturum: parola girme. Local'de sign-in sayfasındaki development identity (rol butonları) ile manager/employee yüzeyleri taranır; gerekirse kullanıcıdan oturum açmasını iste.

Out of scope: buton sistemi redesign'ı, yeni varyantlar, THEME-003 ton birleştirme, AUTH-UX-001 dosyaları.

Done when:
- Kök kural yerinde; `light-theme.test.ts`, web typecheck ve build PASS.
- Etkilenen yüzeylerin önce/sonra listesi ve light ekran görüntüleri (`artifacts/theme-005/`, commit edilmez) raporda; kullanıcı görsel onayı.
- Branch push edilmiş, rapor koordinatöre gönderilmiş.

Test plan: CSS işi; sonda typecheck, build, light-theme testi bir kez.
Risk: uygulama genelinde görünür değişiklik (yeşil ikincil butonlar beyaza döner). Tasarlanan görünüm budur; kullanıcı onayladı.

## Notes / Result
- 2026-09-17 koordinatör kararları (worker kanıtı: artifacts/theme-005, 32 senaryo): (1) Kök kural `.nf-button:where(.secondary-button)` (+ :hover) olur; (0,1,0) özgüllük sayesinde `.active-workspace`, `.compact-button`, `.danger-button` tasarlandığı gibi kazanır. `.nf-button.secondary-button` (0,2,0) switcher'daki aktif workspace butonunu ve danger hover'ı bozuyordu. (2) ProfilePage "Remove" ve SecurityPage "Cancel change" kullanımlarından çelişkili `secondary-button` sınıfı kaldırılır (görünüm bugünküyle aynı kalır). `.employee-drawer-create` istisnası kalır.
- 2026-09-17 worker raporu (031b544, push edildi): `:where` kök kuralı, 33 senaryo / 100 buton ölçümü (yeşil → ikincil), aktif workspace görünümü korunuyor, light-theme 2/2, typecheck ve build PASS; kanıt `artifacts/theme-005/` (surfaces.md, 76 png). Koordinatör güncellemesi: yeni kural yerine mevcut `.secondary-button` bloklarının `.nf-button:disabled` altına TAŞINMASI (aynı cascade, değer tekrarı yok); tarama yeniden koşulup ölçümlerin birebir aynı olduğu doğrulanacak. Karar 2 (iki çelişkili danger buton) uygulanacak. Merge: bu ikisi + kullanıcı görsel onayı sonrası. AUTH-UX-001'in scoped seçicileri rebase'de düşürülecek (worker notu: (0,3,0) seçiciler switcher'da `.active-workspace`'i eziyor).
- 2026-09-17 KULLANICI YÖNÜ (mobilden, doğrudan worker session'ına): "tüm ikincil butonlar beyaz" sonucu onaylanmadı. Niyet:
  1. Destructive ve yanlış tıklamaya açık butonlar (Start over, Remove photo, Revoke invitation …) iki tıkla çalışsın; ilk tıkta onay için kırmızıya dönsün. Referans: Roles & permissions rol silme butonu.
  2. Add location, Send reminder, Resend yeşil kalsın.
  3. "Cancel change" metni "Cancel" olsun; kendiliğinden kırmızı butonlar yumuşatılsın, onay aşamasında daha kırmızı olsun.
  4. Account > Workspaces: o anki workspace satırı highlight; Open butonları yeşil; seçili satırın Open'ı yeşil ama disabled.
- Koordinatör kararı: yeni ID yok; aynı worker/branch. Kök kural (taşınan `.secondary-button` bloğu) beyaz kalacak vazgeçme butonları için gerekli, tek başına merge edilmez. AUTH-UX-001 main'de olduğu için dosya kısıtı kalktı; branch main'e rebase edilir.
- Süreç: (1) tüm tüketiciler için sınıflandırma tablosu (aksiyon / vazgeçme / destructive), kullanıcı onayı olmadan kod yok; (2) gerçek uygulamada mockup: yumuşatılmış kırmızı, armed kırmızı, Workspaces satır highlight + disabled Open (rozet varyantı); (3) implementasyon: REUSE UI-09, tek ortak iki-tık parçası, mevcut ad hoc uygulamalar taşınmaz (backlog), erişilebilirlik (metin değişir, blur/Escape söndürür), `window.confirm` hedeflerde iki tıkla değişir, yalnız token'lar; (4) testler + tarama.
- Önceki kararlar geçerli: kök kural taşıma biçimi, iki çelişkili danger butondan `secondary-button` sınıfının kaldırılması (metin "Cancel" olacak).
- 2026-09-17 KULLANICI KARARLARI (worker üzerinden, mobilden):
  - A. Yeşil kalır (görünüm main ile birebir): Add location / Add job / Add employee, Send reminder, Resend / Invite, Open; ayrıca "dokunma, eski halinde kalsın" denenler: Upload/Replace, Copy diagnostics, Sign out other sessions, Open document, Use development identity. Teknik karşılığı: bu kullanımlardan `secondary-button` sınıfı düşer.
  - B. Beyaz yalnız vazgeçme butonları: Cancel, Back, Discard, Keep editing, Keep organization, Cancel crop.
  - C. Destructive / onay gereken: iki tık (Roles rol silme gibi: ilk tık kırmızı + "Click again to …", ~3,2 sn sonra söner). Kendiliğinden kırmızılar dinlenirken yumuşak, onayda dolu kırmızı. "Cancel change" → "Cancel".
  - D. Kapsam kuralı: yalnız çıplak işlem onayı isteyen yerler iki tık alır; etki listesi/şifre adımı gösteren diyaloglara dokunulmaz (Delete account, Terminate employee, workspace close/transfer).
  - E. Account > Workspaces: aktif satır highlight, "Current" rozeti kalkar, Open her satırda yeşil ve tıklanabilir (disabled fikrinden vazgeçildi).
- Koordinatör kararları: aynı task/worker/branch; tek geçiş (AUTH-UX-001 main'de); D hedefleri: Onboarding Start over, EmployeeDrawer Remove access / Remove photo / rehire restore, InvitationRow Decline, Revoke invitation, profil foto Remove, e-posta "Cancel". App geneli üç çıplak `window.confirm` (SchedulePage, ScheduleTemplateDialogs, DocumentReviewDrawer) kapsam DIŞI; worker raporlar, backlog'a alınır. Switcher'ın aynı modele (satır highlight + yeşil Open) uyup uymayacağı mockup'ta kullanıcıya sorulur. Emin olunmayan butonda varsayılan: dokunma.
- Merge koşulu: (iii) soft/armed danger ve (iv) satır highlight için gerçek uygulamada önce/sonra + kullanıcı görsel onayı; testler, light-theme, typecheck, build, tarama.
- 2026-09-17 worker durum raporu (yerel 70a43c7, main'e rebase'li; uzak branch eski yedek): `packages/ui` `ConfirmButton` (tek ortak iki-tık parçası; armed etiket + erişilebilir ad değişir; 3200 ms / blur / Escape söndürür; unit 2/2). Gerçek yüzeylerde mockup = implementasyon tabanı: Start over, Revoke invitation, Remove photo, Remove access, Decline, profil Remove → ConfirmButton; "Cancel change" → "Cancel" + danger-soft + iki tık; aksiyon butonlarından `secondary-button` düştü; Workspaces o anki satır `--theme-selected` + `aria-current`, "Current" rozeti kalktı. Bilerek kırmızı: 6 dosyada 12 web testi (eski davranış beklentisi); kararlar sonrası güncellenecek. Kullanıcıya gönderildi: sınıflandırma tablosu + 7 akış kartı (`artifacts/theme-005/classification.md`, `flows/`). Bekleyen kullanıcı kararları: tablo onayı (Restore employee sorusu), armed rengi A/B, highlight A/B, görünür "cannot be undone" ipucu, düz <button> adayları, armed etiket kayması. Koordinatör notları: force-push yerine yeni uzak adla yedek; WIP ile merge yok; geri alınamaz işlemlerde metin görünür kalmalı (title yetmez).
- 2026-09-17 ek (yerel a362fe4): ortak parça `useConfirmClick` + `ConfirmButton` (aynı dosya); Restore employee hook ile bağlandı ve kullanıcıya SORU (kart 8); switcher mockup'ı A (satır highlight + yeşil Open) / B (bugünkü tik'li soluk buton), kart 9; Delete template kapsam dışı. Üç çıplak `window.confirm` değerlendirmesi BACKLOG'a işlendi.
- 2026-09-17 BEKLEMEDE: branch `task/theme-005` yerelde @ a362fe4, force'suz yedek `origin/task/theme-005-r2`. 12 web testi bilerek kırmızı, WIP commit'ler duruyor, merge yok. UI-LAB-001 F2 main'e girince branch main'e rebase edilir, 5558'de `VITE_UI_LAB=true` ile açılır; kullanıcı 5555 (main) ile yan yana karşılaştırıp armed rengi, soft danger tonu, satır highlight, etiket kayması, görünür "cannot be undone" metni ve düz buton adayları kararlarını verir. Sonra `?variant=b` iskelesi silinir, testler güncellenir, tarama + rapor.
