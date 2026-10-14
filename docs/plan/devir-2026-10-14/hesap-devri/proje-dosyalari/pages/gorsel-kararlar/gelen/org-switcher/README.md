# Sol menünün tepesindeki workspace seçici: Original + 3 varyant

- Kaynak istek: Mert, 13 Ekim 2026 sabah 5:58 (California), proje sohbeti: "sol tarafta gizlenmiş unutulmuş bir organization switcher var en tepede". Thread: "Sol menüdeki gizli workspace seçici".
- Sayfa: `index.html` (tek dosya, ~930 KB). Çerçevelerde main 68a6eaef'in PAGES kopyasından alınmış gerçek uygulama DOM'u ve CSS'i var (masaüstü 1440, telefon 390, More açık). Üstten varyant, senaryo (3 workspace + 1 davet / tek workspace) ve menü (açık / kapalı / daraltılmış ray) seçilir; workspace geçişi iki çerçevede birlikte olur.
- Sekme önerisi: Kabuk (sol menü).
- Görseller: `original-menu-acik.png`, `a-kaldir.png`, `b-gorunur-secici.png`, `c-hesap-menusu.png`.
- Yeniden kurmak: `kaynak/build.py <çıktı.html>` (girdi parçaları /tmp'deydi; app.css ve DOM'lar PAGES `00.04-shell-workspace-switcher.html` sayfasından Playwright ile alınır).

## Bugün
- Bileşen `apps/web/src/shell/WorkspaceSwitcher.tsx`; sol menüye `apps/web/src/shell/AppShell.tsx` satır 313'te giriyor.
- Tek workspace'te tıklanmayan kalın ad. İkinci workspace ya da davet olunca çerçevesiz düğme; çerçeve yalnız fareyle üstüne gelince (`apps/web/src/styles.css` 2956–2975).
- Hata: 264 px menü 288 px sol menünün `overflow: hidden` kenarında kesiliyor; Answer düğmesi yarım.
- Telefonda sol menü yok; müdürün telefonda geçiş yolu yok. Çalışanın More → Switch workspace'i Account › Workspaces'e gidiyor; seçicinin "All workspaces"ı Workspace Hub'a (`/workspaces`).

## Varyantlar
- **Original:** bugün.
- **A · Kaldır:** tepede yalnız ad; geçiş tek yerden, Account › Workspaces.
- **B · Görünür seçici:** aynı yerde çerçeveli düğme (harf rozeti, ad, rol, ⇅), tek workspace'te de tıklanır; menü kesilmez; altta "Manage workspaces" → Account › Workspaces; daraltılmış rayda rozet; telefonda More'un tepesinde aynı liste.
- **D · Settings'in üstünde (Mert, 13 Ekim sabah 7:05, "settings üzerine taşır mısın"):** seçici tepeden kalkar, sol menünün altında Settings'in hemen üstünde öbür satırlar ölçüsünde bir satır olur (harf rozeti, ad, ⇅); tek workspace'te de tıklanır; menü yukarı açılır, kesilmez; içerik bugünküyle aynı; davet sayısı Account satırında kalır; tepede ☰'nin yanında ad sade yazı olarak kalır (Mert, sabah 7:22, karar kartı); telefon değişmez. Kodlanan bu.
- **C · Hesap menüsünde:** sol alttaki Account satırı menüye döner (kim, workspace listesi, davet, Manage workspaces, Account settings, Sign out); tepede yalnız ad; telefonda More'daki Account satırı aynı listeyi açar.

## Kod aşaması (Mert "kodla" deyince)
Dokunulacak: `WorkspaceSwitcher.tsx`, `AppShell.tsx`, `ManagementMobileNav.tsx` (B, C), `styles.css`, testleri; PAGES 0.1 (sol menü), 0.3 (müdür telefon menüsü), 0.4 (workspace seçici) yeniden derlenir.
