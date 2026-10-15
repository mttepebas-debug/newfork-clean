# Devir raporu: Org switcher (workspace seçici) thread'i

> **PAGES emekli (Mert, 15 Ekim 2026):** ekran ekran belge sayfaları (PAGES) artık kurulmaz, güncellenmez, yayınlanmaz; eski PAGES Artifact'leri yeni hesapta yeniden kurulmaz. Bu rapordaki PAGES adımları çıkarıldı; kalan PAGES sözleri yalnız geçmiş bilgisidir. `PAGES/_kaynak` yalnız varyant sayfalarındaki "Original" görüntüsünü demo veriyle çekmek için araç olarak kalır.

Hazırlayan: bu thread'in Claude'u, 2026-10-14 16:45Z (California 09:45).
Thread: "Org switcher" (project'teki kök mesaj: Mert, 2026-10-13 12:58Z, "sol tarafta gizlenmiş unutulmus bir organization switcher var en tepede").

## Kısa hüküm
İş bitti ve main'de. Yarım kalan kod yok, push'lanmamış iş yok, Mert'ten beklenen karar yok. Yeni hesapta bu thread'i devam ettirmeye gerek yok; aşağıdaki iki "sonraki iş adayı" ancak Mert isterse yeni iş olarak açılır.

## Amaç
Sol menünün tepesinde unutulmuş, neredeyse görünmeyen workspace seçiciyi bulmak, neden gizli olduğunu anlamak, Account › Workspaces ve Workspace Hub ile karşılaştırmak, Original + varyant çizmek; Mert seçince kodlamak.

## Bulgular (neden gizliydi)
- Tek workspace'i olan kullanıcıda düğme değil düz yazıydı.
- Birden fazla workspace'te bile şeffaf bir düğmeydi; düğme olduğu anlaşılmıyordu.
- Açılan menü, sol menünün `overflow: hidden` kuralı yüzünden kesiliyordu.
- Workspace listesi üç yerde: seçici menüsü, Workspace Hub (`/workspaces`) ve Account › Workspaces. Seçicideki "All workspaces" Hub'a gider; çalışanın telefondaki "Switch workspace"i Account › Workspaces'e gider.

## Mert'in kararları
- 2026-10-13 14:05Z: "bu workspace seçiciyi sol menüde settings üzerine taşır mısın" → seçici, sol menünün altında Settings'in hemen üstünde bir satır oldu.
- 2026-10-13 14:22Z, karar kartı: "Ad tepede de kalsın" → workspace adı ☰ düğmesinin yanında düz yazı olarak tepede de duruyor.
- Karar defterine kaydı main'de (4169aef7, "docs(plan): the workspace switcher sits above Settings in the left menu (Mert 2026-10-13)").

## Bitenler (main'de)
- Seçici Settings'in üstünde, her zaman tıklanır bir satır; menü yukarı açılır, dar menüde (rail) sağa açılır; davet sayısı yalnız Account satırında (835e4071).
- Workspace adı tepede ☰ yanında da kalıyor (ff9cc5d3).
- Kod dalındaki karşılıkları: `claude/project-thread-yuz0lk` (d6fbf1da, 8105b3d7); ikisi de main'e trenle girdi (`git cherry -v origin/main` iki satırı da "-" gösteriyor = main'de var).
- nf-guvenlik incelemesi: ONAY (8105b3d7); 1440 ve 390 ekran görüntüleri alındı.

## Yarım kalan iş
Yok.

## Mert'ten beklenen
Yok. Thread'i kapatmak (resolve) Mert'in ya da koordinatörün kararı.

## Dal ve push'lanmamış iş
- Dal: `claude/project-thread-yuz0lk`, uçta 8105b3d7; origin ile aynı; çalışma klasörü temiz.
- Push'lanmamış commit yok; dalın içeriği main'de. Dal silinebilir (birleşmesi `git cherry` ile doğrulandı), ama silme kararı koordinatörün/yeni hesabın; bu thread silmedi.
- Bu iş için nf-guvenlik ile yeni push gerekmedi.

## İlgili dosyalar
Kod (main'de):
- `apps/web/src/shell/WorkspaceSwitcher.tsx` (seçici satırı ve menüsü)
- `apps/web/src/shell/AppShell.tsx` (tepede `sidebar-workspace-name`, alttaki `.sidebar-footer` ilk satırı seçici)
- `apps/web/src/styles.css` (`.workspace-switcher*`, `.sidebar-workspace-name`)
- Testler: `apps/web/src/shell/WorkspaceSwitcher.test.tsx`, `apps/web/src/shell/AppShellNotificationBadge.test.tsx`, `apps/web/src/App.test.tsx`

Mockup (Original + A, B, C, D; Mert D'yi + "ad tepede" seçti):
- `/mnt/project-files/pages/gorsel-kararlar/gelen/org-switcher/index.html`, `README.md`, PNG'ler, `kaynak/` (page.html, frame.js, frame.css, build.py)

## Yeni hesaba taşınacak bulgular
1. Yönetici (manager/admin/owner) telefonda workspace değiştiremiyor; telefonda seçici yalnız çalışan ekranında, o da Account › Workspaces'e gidiyor. Backlog adayı, sıraya alınmadı.
2. Seçici için test boşluğu: Escape ile kapanma, dışarı tıklayınca kapanma ve `switchTo`'nun önbellek temizliği (`clearTenantQueriesForOrganizationSwitch`) için test yok (nf-guvenlik notu). Backlog adayı.
3. Üç ayrı workspace listesi var (seçici menüsü, Workspace Hub, Account › Workspaces). Birleştirme ya da sadeleştirme bir ürün kararıdır; Mert'e sorulmadı.
4. Teknik tuzaklar:
   - Bulutta vitest `@newfork/ui`'ı bulamazsa önce `pnpm --filter @newfork/shared --filter @newfork/ui build`.
   - Sol menü `overflow: hidden`; içinden açılan menüler aşağı değil yukarı (ya da rail'de sağa) açılmalı, z-index 120.
   - Artifact yeniden yayınında önce `read` ya da `list scope:files` gerekir, yoksa yayın reddedilir.
   - nf-guvenlik alt ajanı bir kez ana checkout'ta `git checkout --detach` yaptı (geri aldı); alt ajana "ana klasörde dal değiştirme" kuralını açıkça yazmak gerekir.

## Brief taslağı (yalnız Mert yukarıdaki 1. ya da 2. maddeyi isterse)
```
İŞ: WS-SWITCHER-2 — Yönetici telefonda workspace değiştirebilsin (ya da: seçicinin eksik testleri)
Bitti ölçütü: telefonda (390) yönetici workspace değiştirebiliyor; yeni test kırmızıdan yeşile
Dokun: apps/web/src/shell/ · Dokunma: supabase/, apps/api/
Sınıf: incelemeli (ortak kabuk, birden çok ekran)
İlgili kararlar: Mert 2026-10-13 "Settings üstüne taşı", "Ad tepede de kalsın" (main 4169aef7)
Not: önce Original + varyant (telefon), Mert seçmeden kod yok.
```

## GÜVENLİ DEĞİL
Yok. Bu thread'de kayıp riski taşıyan iş kalmadı.
