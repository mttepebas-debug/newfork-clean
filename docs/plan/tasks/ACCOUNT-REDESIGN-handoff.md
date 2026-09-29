# ACCOUNT-REDESIGN — devir raporu (2026-09-29)

Devreden: kullanıcının açtığı tekil oturum (Account yeniden tasarımı).
Neden: bağlam %52; kullanıcı "bağlam dolmaya başlayınca hemen devret, beni
bekleme" dedi. Kullanıcı uyuyor, sabah rapor bekliyor.

## Kullanıcının bu iş için kuralları (2026-09-29, kendi sözleriyle özet)

- Karar gereken yerde **sen karar ver**: vizyon, SaaS mantığı, MVP roadmap,
  `docs/plan/KARARLAR.md` maddelerine en uygun olanı seç. **Her kararı
  `docs/plan/tasks/ACCOUNT-REDESIGN-kararlar.md` sonuna ekle** (K-9, K-10…).
  Yanlışsa kullanıcı sonra düzeltir. Durma, emin adımlarla ilerle.
- Zaman tasarrufu: uzun testleri ertele, her küçük değişiklikte test koşma,
  testleri toplu koş (bir kez, sonunda).
- Bağlam dolmaya başlayınca hemen devir raporu yaz, **boş bir oturuma** ver
  (kullanıcı ~20 boş oturum açtı; `list_sessions` ile başlığı boş/yeni olanı
  bul), kart açıp onay bekleme.
- Sonunda kullanıcıya ve koordinatöre rapor (CLAUDE.md §10 biçimi).
- Koordinatör adresi: `local_243f826b-1906-491b-b1fc-1a1bdbb4316d`
  (main `3fa8bc7f`'de doğrulandı).

## İşin hedefi (ilk istek)

Account sayfasını **işlevi, akışı, yetkiyi, veriyi değiştirmeden** görsel
olarak yeniden tasarla: sade, kompakt, profesyonel, uygulamanın kendi
tasarım dilinde (yalnız `--theme-*` token'ları, `@newfork/ui` Button /
ConfirmButton; yeni renk yok). Değişiklik başka sayfalara yansımaz; ortak
bileşene yalnız Account'un kullandığı bir seçenek eklenebilir.

## Durum

- **Bitti (kullanıcı gördü, beğendi):** çerçeve (sol menü, başlık) + Profile.
  Commit'ler branch'te, son `db9473e7`, origin'e push'lu.
- **Sıradaki (başlanmadı, kararları verildi):** Security, Preferences,
  Notifications, Workspaces, Documents. Kararlar K-1…K-8
  (`ACCOUNT-REDESIGN-kararlar.md`). Kod yazılmadı.
- İnceleme (nf-guvenlik, nf-gorsel-qa), tam kapı, e2e: hiçbiri koşulmadı.
  main'e alınmadı. Branch `d66f42c2` üstünde; main ilerledi (`3fa8bc7f`),
  sonda rebase gerekir (REUSE.md → KARARLAR.md adı değişti).

## Profile'da kurulan ilkeler (diğer sekmelere uygula)

1. Tek sütun, max 720px (`.account-main`), kutu yok; bölümler arası ince
   çizgi `--theme-border-subtle`. Bölüm başlığı 16px/700, açıklama 13px muted.
2. Alan: `.account-field` (etiket 13px/600, input 40px, 6px radius, kenar
   `--theme-muted`). Yan yana alanlar `.account-field-grid` subgrid ile
   etiket/input/açıklama satırlarını paylaşır (açıklama komşuyu kaydırmaz).
   3 kolon ızgara `.account-profile-grid`/`.account-contact-grid`;
   `.account-field-span-2`.
3. Butonlar sağda (`.account-form-actions`), normal boy; tam genişlik yok
   (telefonda ≤430px tam genişlik). Etiket "Save". Discard (`secondary-button`)
   yalnız değişiklik varken görünür. Save yalnız değişiklik + zorunlular
   doluyken açık.
4. Yıkıcı: `danger-button` Account içinde dinlenirken yumuşak
   (`--theme-danger-soft` zemin, `--theme-danger-strong` yazı), silahlıyken
   dolu kırmızı (`account.css`). Parola/etki gereken silmede pencere kalır.
5. Bilgi taşımayan öğe kaldırılır (tekrar eden isim/telefon, hep aynı rozet).
   Anlamsız alan kaldırılır ama veri korunur (ör. workspace telefonu:
   `personalPhone` gönderilmez → kayıttaki numara kalır).
6. Telefonda: sekmeler 44px, input 44px, "Back to workspace / Sign out"
   sekmelerin üstünde.

## Sekme sekme yapılacaklar

- **Security** (`account/SecurityPage.tsx`): K-3, K-4, K-5. Email satırındaki
  posta ikonu kalkar; tam genişlik "Change password" sağa, normal boy
  (`account-field-wide` düğme sınıfı kalkar). `account-danger-section`
  pembe zemini ve `account-danger-notice` kalın bloğu sadeleşir (CSS
  `account.css` ve `styles.css`'teki account kuralları). "Cancel change"
  kırmızı ve adı aynen.
- **Preferences** (`PreferencesPage.tsx`): K-2 ("Save preferences" → "Save",
  Discard gizli). Testleri etiket adına bakıyor olabilir, güncelle.
- **Notifications** (`NotificationPreferencesPage.tsx`,
  `notification-preferences.css`): K-1 ve K-2. Başlık "Notification
  Preferences" → "Notifications" (menüyle aynı). Kategori kartları gri
  kutudan ince çizgili satıra; "In app / Email" başlıkları kutucukların
  üstüne hizalı; workspace seçici küçük. Davranış aynı.
- **Workspaces** (`WorkspacesPage.tsx`, 1.200 satır; `account.css` alt kısmı
  `.workspace-*`): K-8. Yalnız çevre sadeleşir; pencereler/akışlar aynen.
- **Documents** (`AccountDocumentsPage.tsx`, ortak
  `documents/EmployeeDocumentsList.tsx`): K-6, K-7. Ortak bileşene
  varsayılanı eskiyle aynı olan bir prop ekle (ör. `personal`), yalnız
  Account versin; yönetici Documents ekranı değişmez (onun testleri yeşil
  kalmalı).

## Doğrulama ve araçlar

- Worktree kurulu (`pnpm install` + shared/ui build yapıldı, `.env.local`'lar
  kopyalı). Deneme sunucuları: web 5632, api 5633 (`.claude/launch.json`'da
  `account-web` / `account-api`; `preview_start` ile başlat; bu oturumdakiler
  devirde durduruldu).
- Ekran görüntüsü: `…/46f24f1b-…/scratchpad/shots.mjs`
  (`node shots.mjs artifacts/account-redesign /account/security,/account/documents <etiket> 1280,390`).
  Aynı e-postaya 60 sn içinde ikinci magic link verilmez; çağrılar arası bekle.
  Oturum hesabı `owner@newfork.test` (fixture; telefonu ve legal name'i boş).
- Test sonunda bir kez: `pnpm.cmd --filter @newfork/web exec vitest run src/account src/documents src/employees`,
  `typecheck`, `eslint src/account src/documents`. Profile için 118 test yeşildi.
- design-ux kuralı: bitince tasarımı kurmayan ayrı bir yargıç ajana ekran
  görüntüleriyle kullanılabilirlik puanlaması yaptır; doğru bulgular düzelt.

## Açık notlar (backlog adayı, rapora yaz)

- `list_my_workspace_identities_service` + API ucu + `listWorkspaceIdentities`
  artık ekranda kullanılmıyor (silme: DB/API işi, OPS-02).
- İki telefon veride: hesap telefonu ve workspace kaydındaki telefon.
- `KARARLAR.md` Account → Profile maddesi "Save changes" diyor; artık "Save".
  Rebase sonrası aynı işte düzelt.
- e2e `e2e/flows/owner-legal-name-setup.spec.ts` uyarlandı, koşulmadı.
- Temizlik (iş kapanınca): `.claude/launch.json`'daki `account-*` iki giriş,
  worktree, branch.
