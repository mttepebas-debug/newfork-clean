# UI-PRE-001 Business öncesi ekranlar: tek tasarım dili ve akış (şemsiye)
Status: active (2026-09-18; kullanıcı planı onayladı)
Session: "Pending invitations sayfası UI tasarımı" (local_563f7591)   Branch: task/ui-pre-001   Worktree: newfork-wt/ui-pre-001   DB: - (D5 hariç)   Portlar: web 5557, API 5556 (5559 UI Lab'de)
Öneri: Opus 5, high. Çok ekranlı, hem UI hem mantık; dilim dilim merge edilir.
Plan (bağlayıcı, tamamı okunur): `C:/Users/TheWe/.claude/plans/resilient-crafting-pearl.md`. Okuma sırası: Kararlar → Ortak kit → Kapsam kararları → Yürütme planı. Problem günlüğü kanıt ekidir.
İlişki: AUTH-UX-001 (done, 59446ff) bu ekranların *akışını* düzeltti; bu task görsel dil + sihirbaz mantığı. THEME-005 beklemede; yalnız `ConfirmButton` main'e alındı (a4330f3).

Goal: Kullanıcı bir business'a bağlanana kadar gördüğü ekranların hepsi tek çerçeve, tek dil ve tek durum modeliyle çalışsın. Kullanıcı hükmü: "her sayfa kendi kafasına göre davranıyor".

Kapsam (ekranlar): sign-in giriş modu, accept-invite (iki durum), `/invitations/pending`, `/no-organization` (+ no-invitation), organization switcher, employee onboarding, owner onboarding, onboarding hata ekranı, `account/workspaces` satırı.

Kullanıcı kararları (2026-09-18, ayrıntı planda):
- Yön: `apps/web/src/dev/EmployeeOnboardingPreview.tsx` dili, geliştirilerek.
- Sözlük: kullanıcı metinlerinde **business** ve **team**; "workspace"/"organization" kalkar. Kod ve DB adları değişmez.
- Ortak kit K1–K12: iki panelli sihirbaz çerçevesi (sticky sol panel), tek hesap bloğu + Sign out (çıkışsız ekran yok), ekran başına tek yeşil birincil, vazgeç beyaz, yıkıcı iki tık (`ConfirmButton`, `window.confirm` kalkar), sabit alt eylem çubuğu ve tek "Back", tek business satırı bileşeni (pending/switcher/Workspaces aynı meta sırası ve eylem sözlüğü), metin kuralı (sistem dili ve ham sunucu mesajı yok), rozetle durum dili, form kuralı (label bağlama, help hizası), hata/boş ekranlar aynı çerçevede.
- Owner sihirbazı mantığı bu task'ta: çoklu departman (bugün `OwnerOnboardingPage.tsx:680` yalnız ilkini alıyor), ekleneni düzenle/sil, timezone varsayılanı, eklenen lokasyon ve employee listesi.
- No-org guard'ı: business'ı olan hesaba "bağlı değilsin" denmez.

Koordinatör kararları (2026-09-18):
- Tek şemsiye task; dilimler burada izlenir. Paralel session gerekirse dilim kendi ID'sini alır.
- **Faz 0 tamam:** `ConfirmButton` main'de (a4330f3; `packages/ui`). THEME-005'ten yalnız bileşen, testi ve export alındı; o branch'in kalanı beklemede ve sonra bu işin üstüne rebase edecek.
- THEME-005 ile çakışmayı küçültmek için yeni CSS kit sınıflarında toplanır; global `.secondary-button` kuralına dokunulmaz. Not: bugün "ikincil" işaretli butonların yeşil görünmesi bilinen cascade hatası; kök düzeltmesi THEME-005'te, kullanıcı görsel onayını bekliyor. Bu task o ekranları zaten yeniden giydirdiği için beklemesi sorun değil.
- Onay bekleyen tek madde (kullanıcıya soruldu): owner adım 4'e lokasyon + job seçimi (bugün her employee ilk aktif lokasyon ve job'a atanıyor, `:371-381`).

Dilimler:
- **Faz 1 mockup (karar için, kod kalıcı değil):** `?shell=a|b` (iniş çerçevesi: üst bar + ortalı kolon / her yerde iki panel) pending ve no-org üzerinde; `?docs=1|2` (belgeler tek adım / Documents + Policies) employee onboarding üzerinde. Yalnız DEV. Kullanıcı görerek seçer, seçilmeyen silinir.
- **D1** kit bileşenleri + iniş ekranları + Workspaces satırı + no-org guard'ı + `window.confirm` temizliği. BACKLOG F5 maddeleri (capitalize, başlığın yüklenirken görünmesi) burada kapanır.
- **D2** employee onboarding: sabit adım modeli, profile bölünmesi, belge/poliçe sayfası baştan, sayaç görünen adımlara göre.
- **D3** owner onboarding: çerçeve, tek "Back", metinler, form kuralı, çoklu departman, düzenle/sil, timezone varsayılanı, employee listesi.
- **D4** sign-in giriş modu.
- **D5** davet satırına rol ve davet eden (DB: lock, sonra).

Out of scope: akış/yönlendirme mantığı (AUTH-UX-001), yeni dependency, dark tema, global `.secondary-button`, planın backlog ekranları (sign-in kayıt modu, account-recovery, suspended, WorkspaceSetupPending/ProtectedRoute, mobil tur, diğer account sayfaları).

Done when (dilim başına): ilgili ekranlarda tek yeşil birincil; Sign out her ekranda aynı bileşen; `window.confirm` yok; başlıklar tek satır; kullanıcı metninde "workspace"/"organization" yok; etkilenen testler ve `pnpm.cmd --filter @newfork/web typecheck` PASS; görsel kanıt (önce/sonra) raporda.
Test plan: dilim başına yalnız etkilenen testler + web typecheck. String assertion güncellemeleri beklenen dosyalar: PendingInvitationsPage, EmployeeOnboardingPage, NoOrganizationPage, OwnerOnboardingPage testleri. Yeni hedefli testler: çoklu departman, no-org guard'ı, business satırı durum→eylem eşlemesi. Geniş suite merge öncesi koordinatörde.
Risk: kapsam büyük (~10 ekran) → dilimleme şart; THEME-005 ile 6 ortak dosya; görsel doğrulama oturum ister (parola girilmez, fixture magic-link ya da kullanıcının kendi oturumu).

## Notes / Result
- 2026-09-18: Faz 0 tamam (ConfirmButton main'de, a4330f3). Session Faz 1'e başlayabilir.
- 2026-09-18 Faz 1 ara durum (worker branch `task/ui-pre-001`, henüz push yok):
  - **Kullanıcı kararı:** iniş çerçevesi **B = her yerde iki panel**. A varyantı silindi (000e695). `?docs=1|2` (belgeler tek adım / Documents + Policies) hazırlanıyor.
  - **Ortak pakete dokunuldu (koordinatör onayladı):** `ConfirmButton` çift tıklamanın ikinci tıkını onay sayıyordu; kullanıcı "Click again to…" etiketini görmeden eylem çalışıyordu. Düzeltme 144e763: `event.detail > 1` ise dönüyor, basılı Enter'ın tekrarı engelleniyor. Kit `window.confirm` yerine bu butona güvendiği için açık kapatılmadan ilerlenemezdi. THEME-005 rebase'inde bu dosya main'deki hâliyle alınır.
  - Aynı bileşende iki bulgu: (a) silahlı durum ekran okuyucuya duyurulmuyor → **bu dilimde düzeltilecek** (erişilebilirlik temeli, testiyle); (b) 3,2 sn süre → **dokunulmuyor**, kullanıcının 2026-09-17 kararı, blur ve Escape zaten söndürüyor.
  - `DocumentReviewDrawer`'a geriye uyumlu tek opsiyonel prop (`hideHeader`) eklenecek; uygulama içi Documents ekranı değişmez, raporda kanıtlanacak.
