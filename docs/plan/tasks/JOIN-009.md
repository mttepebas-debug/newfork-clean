# JOIN-009 Kapı ekranları ve hesap alanı: yeniden tasarım
Status: kismen done (2026-09-21); kalan kisim JOIN-011
Session: -   Branch: task/join-009   Worktree: yok   DB: KILIT (yeni okuma fonksiyonu)

Plan ID'leri: E1, E3, E4 (görsel), M1 (hesap globaldir) + kullanıcı kapsamı 2026-09-21 (login/signup/onboarding/switcher/account sekmeleri yeniden tasarım)

Goal: Giriş kapısından hesap alanına kadar her ekran aynı dili konuşsun ve gerçek bir SaaS gibi okunsun; hesabın ne olduğu, workspace'in ne olduğu ekranın kendisinden anlaşılsın.

## Tasarım kararları (bu task'ın sözleşmesi)
- **Kaynak uygulamanın kendisi**: `--theme-*` token'ları, PreBiz kiti, `packages/ui` `Button`/`ConfirmButton`, kayıtlı buton dili (aksiyon yeşil · vazgeçme beyaz · yıkıcı iki tık kırmızı). Yeni renk ve yeni token yok.
- **Kart yok.** Kapı ekranları `PreBizFrame`'in ince üst çubuğu + ortalı sütunu üzerinde kalır (`e203109`, `bdf4bc6`). Canvas'ın 560px kart çizimi bu kararla düşer; canvas sonunda güncellenir.
- **Sözcük**: workspace + team. "Create your workspace account", "Name your workspace", "Choose a workspace".
- **Switcher menünün tepesinde** (`AppShell.tsx:316-324` yuvası), hesap butonu altta ayrı kalır — plan E5 ve Slack/Linear/Notion deseni. Canvas'ın "tek kontrol" önerisi BACKLOG'a.

In scope:
- **Sign in / sign up**: tek sayfa, iki mod, nötr. Sign-up'ta ad + e-posta + parola; davetten gelindiğinde ad alanı düşer (davet onu taşıyor) ve başlık "Create your employee account" olur. Alt satır: "You will name the workspace itself in the next step." Yasal linkler tek satırda.
- **Owner onboarding**: dört adım, sol panel adımları taşır, her adım aynı alt çubukla biter; çıkış paneldedir ve adı "Back" değildir. 1. adımda hesabın adı doğrulanır (JOIN-008) ve "Do you work shifts yourself?" sorulur.
- **Employee onboarding**: aynı iskelet; sayaç yalnız görünen adımları sayar.
- **Switcher**: JOIN-005'in kontrolünün görsel dili burada kesinleşir.
- **Account alanı — altı sekme, her biri tek konuya**:
  - `Profile` — hesabın kendisi: görünen ad, e-posta, telefon, avatar. Altında **salt okunur** "How you appear in each workspace" listesi: workspace adı, o workspace'teki rol, orada görünen ad. Hesabın global olduğu buradan anlaşılır.
  - `Security` — parola, oturumlar, sahiplik devri, hesap silme ve geri alma.
  - `Preferences` — tema, tarih ve saat biçimi.
  - `Notifications` — kanallar ve workspace bazlı politika.
  - `Workspaces` — JOIN-003'ün hub'ı, uygulama içi mount'u. Davetler, yarım kurulumlar, hazır workspace'ler, yeni oluştur.
  - `Documents` — workspace'e göre gruplu, bekleyen iş sayısıyla; workspace seçme `<select>`'i kalkar.
- **Rozet kuralı**: sayı "senden bir şey bekleniyor" demek, "yeni bir şey oldu" değil; okumakla kapanmaz, iş bitince kapanır. Account nav'ında sekme başına, sidebar hesap butonunda toplam.
- **Kendi istihdam kaydın**: workspace içindeki kişi kendi `employee_private_profiles` verisini görür ve düzeltir; `internal_note` ve yönetici alanları görünmez. Giriş noktası account ▸ Workspaces satırından o workspace'e.

Out of scope: işletme ayarları (`apps/web/src/settings/*`), employee hub içeriği, dark tema, mobil tur.
Done when: yedi ekranın (sign in, sign up, owner 1-4, employee welcome, switcher, account'un altı sekmesi) her birinde tek yeşil birincil buton; ham sunucu mesajı yok; `window.confirm` yok; kullanıcı metninde "organization"/"business" yok; görsel kanıt (önce/sonra) raporda; `pnpm.cmd test` + `typecheck` + `build` PASS.
Touches: `apps/web/src/views/SignInPage.tsx`, `OwnerOnboardingPage.tsx`, `apps/web/src/employees/EmployeeOnboardingPage.tsx`, `apps/web/src/account/*`, `apps/web/src/shell/prebiz/*`, `apps/web/src/shell/AppShell.tsx`, `apps/web/src/styles.css`.
Test plan: ekran başına render testi (başlık, tek birincil, eylem adları) + `light-theme.test.ts` + mevcut string assertion'ların güncellenmesi.
Risk: yüzey geniş. Ekran ekran ilerlenir, her ekranın testi o ekranla birlikte yazılır; tasarım kararı değişirse canvas artboard'ı da güncellenir.

## Notes / Result
- 2026-09-21. Bu dilimin **kapi ekranlari** kismi baska dilimlerde zaten kapandi: sign-up metni ve alti davet hali JOIN-004'te, owner sihirbazi adim 1 JOIN-008'de, switcher JOIN-005'te, durum ekranlari JOIN-006'da. Burada kalan is hesap alaniydi.
- **Yapilan: Profile > "How you appear in each workspace".** Migration `20260921230000_how_you_appear_in_each_workspace`; `list_my_workspace_identities_service` hesabin kendi satirlarini okuyor (baska izin gerekmiyor, kisi zaten o hesap). Profile sayfasinda salt okunur liste: workspace, oradaki rol, orada kayitli ad ve calisan kodu; kayit yoksa "No record yet".
- Neden bu: hesabin global oldugu, her workspace'in kendi kaydini tuttugu ve oradaki adi bir yoneticinin duzeltebildigi ekranda hicbir yerde yazmiyordu. Ustteki adi degistiren kisi bir workspace'in onu baska bir adla tuttugunu ogrenemiyordu.
- **Olculen ve kapsamdan cikan:** `WorkspacesPage` 937 satir ama hub'in kopyasi degil - sahiplik devri ve kapatma akislarini tasiyor. JOIN-003'te ertelenen "tek bilesen iki mount" hedefi **yanlis hedefmis**; iki sayfa farkli isler yapiyor. Paylasilacak sey satir sunumu, sayfa degil.
- **JOIN-011'e kalan:** Account > Documents'in workspace `<select>`'i yerine grupli liste; kisinin kendi istihdam kaydini (resmi ad, acil durum kisisi) duzenledigi ekran (BL-080, owner'in resmi adi buna bagli); account nav'inda rozet kurali.
- **Kanit:** `ProfilePage.test.tsx` 10/10 (iki yeni test: kayit varken liste, hicbir yere ait degilken bolum hic cikmiyor), `typecheck`/`test` PASS, tarayicida iki workspace'li hesapta goruldu.

