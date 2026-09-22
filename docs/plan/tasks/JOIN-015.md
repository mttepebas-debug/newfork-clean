# JOIN-015 Workspace yaşam döngüsü: kapatma, planlı kapatma, devir
Status: draft
Session: -   Branch: task/join-015   Worktree: yok   DB: KİLİT (muhtemel)

Plan ID'leri: M2, E7, S12, S13 + kullanıcı kapsamı 2026-09-21

Goal: Kapatma, planlı kapatma ve sahiplik devri uçtan uca kullanışlı olsun ve ekranlar geliştirici diliyle konuşmayı bıraksın.

## Kullanıcı şikâyetleri (2026-09-21)
1. Bu düğmelerin açtığı pencereler ve **şifre girme ekranı** geliştirici mesajları gibi okunuyor.
2. Devri bloklayan mesajlar **tek tek sayıyor**: "bu employee bu workspace'e bağlı, bu employee bu workspace'e bağlı…". Kuralı bir kez söyleyen **toplu bir mesaj** olmalı.
3. Akışın tamamı elden geçirilip mimariye uygun hâle gelmeli.

In scope:
- Engelleme mesajları tek kural cümlesine iner (ör. "Bu workspace'te hâlâ 12 çalışan var. Anında kapatmak için önce hepsinin erişimini kaldır.") — satır satır liste yerine sayı ve tek eylem.
- `WorkspacesPage` (937 satır) içindeki kapatma ve devir akışları okunabilir parçalara ayrılır; onay pencereleri kit diline (`PreBizFrame`/`ConfirmButton`) iner.
- **Şifre ekranı kararı kullanıcıya sorulacak:** reauth kapısı yıkıcı işlem öncesi kimlik doğrulaması. Kaldırılırsa çalınmış bir oturum workspace'i kapatabilir. Seçenekler: (a) kalsın ama metni insanlaşsın, (b) yalnız anında kapatmada kalsın, planlıda ve devirde kalksın, (c) tamamen kalksın. **Karar alınmadan dokunulmaz.**
- Ham sunucu mesajı gösteren yerler temizlenir.

Out of scope: kapanma sonrası veri saklama/purge işi (OPS), faturalama.
Done when: her engel tek cümle; hiçbir pencerede ham sunucu mesajı yok; S12 ve S13 elle turu geçmiş ve testli.
Touches: `apps/web/src/account/WorkspacesPage.tsx`, `request_workspace_closure_service`, `initiate_workspace_ownership_transfer_service`, reauth yüzeyi.
Risk: yıkıcı işlemler. Her değişiklik testle sabitlenir; güvenlik kapısı kullanıcı kararı olmadan gevşetilmez.

## Notes / Result

### JOIN-015a (ilk yarı) — `task/join-015a`, web tarafı

Kapsam: `apps/web/src/account/WorkspacesPage.tsx` içindeki kapatma / planlı kapatma /
kapatmayı iptal / devir / devre cevap akışları. Şifre kapısının **davranışı**na
dokunulmadı (kullanıcı kararı bekliyor); metni denetime dahil edildi.

#### Deliverable 1 — Denetim tablosu

Satır numaraları denetim anındaki `main` (333c7c3) hâline aittir.

**Kaynak sütunu:** `web` = web uygulamasında sabit metin · `api→web` = API'nin
`{ error }` gövdesi `apiRequest` tarafından `Error.message` yapılıp ekrana basılıyor ·
`db→api→web` = Postgres `raise exception` metni `requestError` üzerinden aynen geçiyor.

| # | Yer | Metin | Kaynak | Sorun |
|---|-----|-------|--------|-------|
| 1 | `WorkspacesPage.tsx:148` | `error.message` (yoksa `Admins could not be loaded`) | db→api→web | Ham sunucu cümlesi DOM'a giriyordu; PostgREST/RLS metni kullanıcıya görünür |
| 2 | `WorkspacesPage.tsx:297` | `Enter your account password to continue` | web | Kabul edilebilir, yalnız nokta eksik |
| 3 | `WorkspacesPage.tsx:299` | `Account email is required to reauthenticate` | web | Geliştirici dili ("reauthenticate"), sonraki adım yok |
| 4 | `WorkspacesPage.tsx:305` | `Recent reauthentication failed` | web | Geliştirici dili; asıl olay "şifre tutmadı", kullanıcı ne yapacağını bilmiyor |
| 5 | `WorkspacesPage.tsx:345` | `closureError.message` (yoksa `Workspace closure could not be requested`) | db→api→web | Ham sunucu cümlesi; hiçbir engel için sonraki adım yok |
| 6 | `WorkspacesPage.tsx:363` | `closureError.message` (yoksa `Workspace closure could not be cancelled`) | db→api→web | Aynı |
| 7 | `WorkspacesPage.tsx:399` | `transferError.message` (yoksa `Ownership transfer could not be started`) | db→api→web | Aynı |
| 8 | `WorkspacesPage.tsx:429` | `transferError.message` (yoksa `Ownership transfer response could not be saved`) | db→api→web | Aynı |
| 9 | `WorkspacesPage.tsx:443` | `error.message` (yoksa `Transfer could not be cancelled`) | db→api→web | Aynı |
| 10 | `WorkspacesPage.tsx:466` | `Ownership transfer · {name}` | web | İyi |
| 11 | `WorkspacesPage.tsx:467` | `You have been asked to become the owner. Review the request before it expires.` | web | "before it expires" var, tarih yok — oysa `pendingOwnershipTransfer.expiresAt` elde |
| 12 | `WorkspacesPage.tsx:474` | `Accept owner transfer` / `Reject owner transfer` | web | İyi |
| 13 | `WorkspacesPage.tsx:526` | `Closes {formatClosureDate(...)}`, tarih yoksa `at period end` | web | "period" faturalama dönemini ima ediyor; öyle bir dönem yok (DB `now() + 14 days`) |
| 14 | `WorkspacesPage.tsx:529` | `Ownership transfer needs response` / `pending` | web | İyi |
| 15 | `WorkspacesPage.tsx:593,597,602,610,616` | `Transfer ownership` · `Close later` · `Close now` · `Cancel close` · `Cancel transfer` | web | İyi (menü öğeleri) |
| 16 | `WorkspacesPage.tsx:635` | `Transfer ownership` (panel başlığı) | web | Hangi workspace olduğu yazmıyor |
| 17 | `WorkspacesPage.tsx:637-641` | `The target must be an active admin with completed onboarding and a verified email. Accepting the transfer promotes that admin to owner, demotes you to admin and requires billing details to be added again before the next payment.` | web | Şartname dili ("target", "promotes/demotes"); **faturalama kapsam dışı ve kodda karşılığı yok** — yanlış vaat |
| 18 | `WorkspacesPage.tsx:644,649,653` | `Find an admin by name or email` · `Enter at least 2 characters` · `Searching eligible admins...` | web | İyi |
| 19 | `WorkspacesPage.tsx:655` | `No eligible admins found.` | web | **Çıkmaz sokak.** Kural bir kez söylenmiyor, sonraki adım yok. Kullanıcının şikâyetinin tarayıcıda doğrulanmış hâli |
| 20 | `WorkspacesPage.tsx:670` | `I understand an accepted ownership transfer cannot be reversed. I can cancel while it is pending.` | web | Açıklamayla birebir tekrar |
| 21 | `WorkspacesPage.tsx:673,744,818` | `Account password` (reauth alanı) | web | **Davranışı kapsam dışı.** Etiket nötr; asıl eksik, panelin neden şifre istediğini söylememesi (md. 22, 34) |
| 22 | `WorkspacesPage.tsx:694-695` | `Starting transfer` / `Start transfer` | web | İyi |
| 23 | `WorkspacesPage.tsx:722-723` | `Close organization now` / `Schedule organization closure` | web | **`organization` yasaklı sözlük**; workspace adı yok |
| 24 | `WorkspacesPage.tsx:727` | `This cancels active access immediately, revokes pending invitations and removes this organization from every member's switcher. It cannot be restored by support.` | web | Geliştirici dili ("revokes", "switcher"), yasaklı sözlük, kuralı kişiye göre değil sisteme göre anlatıyor |
| 25 | `WorkspacesPage.tsx:728` | `This keeps access until the current trial or paid period ends. You can cancel the closure before that time.` | web | **Yanlış.** DB `coalesce(target_effective_at, now() + interval '14 days')` kullanıyor; deneme/ödeme dönemiyle ilgisi yok |
| 26 | `WorkspacesPage.tsx:734` | `Type organization name` | web | Yasaklı sözlük |
| 27 | `WorkspacesPage.tsx:760` | `I understand the organization closure impact.` | web | Yasaklı sözlük; "impact" geliştirici dili; neyi kabul ettiği yazmıyor |
| 28 | `WorkspacesPage.tsx:780-783` | `Closing` / `Close now` / `Schedule close` | web | İyi |
| 29 | `WorkspacesPage.tsx:794` | `Keep organization` | web | Yasaklı sözlük |
| 30 | `WorkspacesPage.tsx:810-811` | `Accept ownership transfer` / `Reject ownership transfer` | web | Hangi workspace olduğu yazmıyor |
| 31 | `WorkspacesPage.tsx:814` | `Enter your account password to accept ownership of this workspace.` | web | Yalnız mekaniği söylüyor, sonucu söylemiyor (sahiplik el değiştiriyor) |
| 32 | `WorkspacesPage.tsx:814` | `Reject this request without changing workspace ownership. No password is needed.` | web | "No password is needed" uygulamanın iç işleyişi; kullanıcıyı ilgilendirmiyor |
| 33 | `WorkspacesPage.tsx:846-849` | `Saving response` / `Accept transfer` / `Reject transfer` | web | İyi |
| 34 | `workspace-account-routes.ts:170,233,267` | `Recent reauthentication required` (403) | api→web | Ham hâlde ekrana basılıyordu; kullanıcı "reauthentication" ne demek bilmiyor |
| 35 | `workspace-account-routes.ts:159,225,259,301` | `Valid workspace closure details required` vb. | api→web | Zod doğrulama dili; web zaten aynı kuralı uyguladığı için normalde erişilmez, ama erişilirse ham geçiyordu |
| 36 | `workspace-account-routes.ts:162` vb. | `Workspace account service is not configured` | api→web | Dağıtım hatası; kullanıcıya gösterilecek cümle değil |
| 37 | `lib/supabase.ts:135` | `Workspace operation failed` | api→web | Son çare metni; sonraki adım yok |
| 38 | `20260908176000_...:26,31,34,43,57,62` | `valid actor required` · `workspace closure requires explicit acknowledgement` · `valid workspace closure mode required` · `workspace not found` · `workspace owner access required` · `workspace name confirmation does not match` | db→api→web | Hepsi geliştirici dili, hepsi ham geçiyordu |
| 39 | `20260908176000_...:213` | `scheduled workspace closure requires a future effective time` | db→api→web | Aynı |
| 40 | `20260908161000_...:817` | `workspace closure is not scheduled` | db→api→web | Aynı |
| 41 | `20260908162000_...:78` | `pending ownership transfer must be resolved before workspace closure` | db→api→web | Gerçek engel; tek cümleye ve tek eyleme inmesi gereken tam da bu |
| 42 | `20260908162000_...:114-199` | `ownership transfer target must be another account` · `pending ownership transfer already exists` · `ownership transfer target must be an active admin` · `... must have a verified email` · `... must have completed onboarding` · `workspace owner access required` · `workspace not found` | db→api→web | Aynı; "target" kullanıcı sözlüğünde yok |
| 43 | `20260908162000_...:261-286` | `valid ownership transfer action required` · `pending ownership transfer not found` · `ownership transfer target access required` · `ownership transfer has expired` | db→api→web | Aynı |
| 44 | `20260908162000_...:329` | `system owner and admin roles are required` (P0002) | db→api→web | Kurulum hatası; kullanıcıya gösterilecek cümle değil |

Kapsam dışı ama aynı şikâyetin birebir kaynağı (bkz. Deliverable 2, madde 6):
`apps/web/src/account/SecurityPage.tsx:176` hesap silme engellerini **workspace başına
bir `<li>`** olarak sayıyor.

#### Deliverable 2 — Koordinatöre devredilen işler (DB / API)

1. **`get_account_deletion_blockers_service`** (`20260914115233_account_security_deletion_lifecycle.sql:48`)
   — bugün her aktif üyelik ve her bekleyen devir için **ayrı bir satır** döndürüyor;
   `SecurityPage.tsx:176` bunu satır satır listeliyor. Kullanıcının "her employee için
   tek tek" şikâyetinin birebir karşılığı bu. Yerine tek bir toplu özet dönmeli:
   `{ active_membership_count, owned_workspace_count, pending_transfer_count }`.
   Ekranın kuracağı cümle: *"Hesabını silmeden önce 3 workspace'teki erişiminin
   kalkması gerekiyor; 1'inin sahibi sensin, önce sahipliği devret."* — satır listesi yok.

2. **Üye sayısı hiçbir yerde yok.** `workspaceSummarySchema`
   (`packages/shared/src/index.ts:363`) ve `/v1/account/workspaces` yanıtı üye sayısı
   taşımıyor; bu yüzden kapatma paneli "Bu workspace'te hâlâ 12 kişinin erişimi var"
   diyemiyor, ancak "Everyone loses access" diyebiliyor. Gereken: her workspace satırına
   `activeMemberCount` ve `pendingInvitationCount`. Sonra panel şunu diyecek:
   *"Bu workspace'te 12 kişinin erişimi ve 3 bekleyen daveti var. Kapattığında hepsi
   aynı anda gider."* — tek cümle, sayıyla.

3. **Planlı kapatmanın tarihi baştan söylenmiyor.**
   `request_workspace_closure_service` (`20260908176000_...:211`) süreyi
   `coalesce(target_effective_at, now() + interval '14 days')` ile kendi belirliyor;
   kullanıcı tarihi ancak kapatmayı planladıktan **sonra** rozette görüyor. Gereken:
   bu tarihi önceden okunabilir bir uçtan vermek (ör. `GET .../closure/preview` ya da
   workspace satırında `defaultClosureEffectiveAt`). Panel o zaman şunu diyecek:
   *"Erişim 6 Eki 2026'ya kadar açık kalır; o güne kadar istediğin an vazgeçebilirsin."*
   Şu an web tarafı tarihi yazamadığı için "kapanış tarihine kadar" demekle yetiniyor.

4. **`raise exception` metinleri sözleşme hâline geldi.** Web artık sunucu cümlesini
   ekrana basmıyor; tanıdığı cümleleri `lifecycleSentences` haritasından karşılıyor
   (`WorkspacesPage.tsx`, dosyanın sonu). Haritanın anahtarları **birebir** şu
   cümlelerdir ve **yeniden yazılırsa** ekran sessizce genel yedek cümleye düşer:
   `pending ownership transfer must be resolved before workspace closure`,
   `workspace owner access required`, `workspace not found`,
   `workspace closure is not scheduled`, `workspace name confirmation does not match`,
   `workspace closure requires explicit acknowledgement`,
   `Recent reauthentication required`, `pending ownership transfer already exists`,
   `ownership transfer target must be an active admin`,
   `ownership transfer target must have a verified email`,
   `ownership transfer target must have completed onboarding`,
   `ownership transfer target must be another account`,
   `pending ownership transfer not found`,
   `ownership transfer target access required`,
   `ownership transfer has expired`.
   Kalıcı çözüm: her `raise exception`'a İngilizce cümleden bağımsız, sabit bir makine
   anahtarı eklemek (`using errcode = ..., hint = 'workspace.closure.transfer_pending'`),
   `requestError`'ın bunu `{ error, code }` olarak taşıması, webin de cümleye değil
   koda bakması. Cümle metni o zaman serbestçe değişebilir.

5. **`block_closure_when_ownership_transfer_pending`** (`20260908162000_...:64`) trigger'ı
   tek satır döndürüyor, bu iyi; ama hangi devir olduğunu söylemiyor. 4. maddedeki
   anahtar eklendiğinde bu kayıt da `detail` içinde `transfer_id` taşımalı ki ekran
   "şu deviri iptal et" diye doğrudan bağlantı verebilsin.

6. **`hasRecentReauthentication`** (`workspace-account-routes.ts:570`) penceresi
   10 dakika ve yalnız `Recent reauthentication required` diyor. Şifre kapısı kararı
   kullanıcıya ait (kapsam dışı), fakat karar hangi yöne çıkarsa çıksın bu yanıtın
   kalan süreyi ya da "yeniden giriş yap" eylemini taşıması gerekiyor; web şu an
   kendi cümlesini uyduruyor.
