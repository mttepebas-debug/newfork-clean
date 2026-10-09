# EMP-001 A3 — Access sekmesi, "Profile photo" grubunun iki açıklaması (BL-446)

Rol: `nf-arayuz`. Dal: `task/emp-001-a3` (`origin/main` `ddb2e359` üstünde),
commit `edd64463`, push edilmedi. Worktree:
`C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\goofy-wescoff-7931db`.
Tarih: 2026-09-30.

Ekran: Employees → bir kişiye tıkla → çekmece → Access → "Profile photo".

## 1. Nerede duruyor

Bitti. Açık soru yok.

## 2. Ne yapıldı (etkisi)

- "Profile photo" başlığının altındaki "Remove the workspace profile photo shown
  for this employee in this workspace." satırı kalktı.
- Satırdaki "Remove only the photo shown for this workspace." artık ekrana
  basılmıyor. "Remove photo" düğmesinin adı neyin silindiğini söylüyor ama
  **nereden** silindiğini söylemiyor (yalnız bu workspace'teki fotoğraf, hesabın
  fotoğrafı değil); bu yüzden cümle düğmenin ekran okuyucu açıklaması ve fare
  ipucu olarak kaldı — A2 kalıbı: `EmployeeDrawer.tsx:2604-2605` (metin),
  `:2663` (`aria-describedby`), `:2664` (`title`), `:2672` (`sr-only`).
- Fotoğrafı kaldıramayan okuyucuda düğme yok; onda cümle hiç yok.
- Hiza bozulmadı: satır dikeyde ortalı (`.employee-avatar-control`,
  `align-items: center`); CSS'e dokunmadım.

Kalanlar: "Profile photo" başlığı, "Profile photo removal" satır adı, "Remove
photo" düğmesi. Çekmecenin başka hiçbir yerine dokunulmadı.

## 3. Açık kalan ve nedeni

Yok.

## 4. Ekranda ne değişti

Access → Profile photo: başlığın altı ve satır adının altı boş; grup masaüstünde
yaklaşık 21px kısaldı (düğme 378 → 357). Telefonda düzen aynı (düğme satırın
altında, tam genişlik).

Silinen kullanıcı metinleri:
- "Remove the workspace profile photo shown for this employee in this workspace."
- "Remove only the photo shown for this workspace." — görünür metin olarak yok;
  düğme varken görünmez öğe olarak duruyor (`getByText` bulur, `toBeVisible` bulmaz).

`e2e/` araması: `grep -rn "Remove the workspace profile photo\|Remove only the photo shown" e2e`
→ **0 satır**. İki metin de e2e'de geçmiyor; dokunulacak bir şey yok.

## 5. Sırada ne var (yolda bulunanlar; dokunmadım)

- Aynı grupta üç yazı artık aynı şeyi söylüyor: başlık "Profile photo", satır
  adı "Profile photo removal", düğme "Remove photo". Satır adı fazlalık gibi
  duruyor; kaldırılırsa fotoğrafın yanı boş kalır, o yüzden metin kararı.
  (leave: low / do: safe)
- "Remove photo" fotoğraf yokken soluk (kilitli) duruyor ve nedenini hiçbir yerde
  söylemiyor ("No photo to remove" gibi). Bu işten önce de böyleydi.
  (leave: low / do: safe)

## Kanıt

Commit `edd64463` üzerinde, 2026-09-30:

| Komut | Sonuç |
|---|---|
| `pnpm.cmd --filter @newfork/web exec vitest run` (bütün web, bir kez) | 221 dosya geçti; 1967 test geçti, 1 atlandı; "Unhandled" yok |
| `pnpm.cmd --filter @newfork/web typecheck` | hatasız |
| `pnpm.cmd lint` | 0 hata, 20 uyarı (önceden vardı), 5/5 görev |
| Ağır koşudan önce | main CI 36724425552 bitene kadar bekledim (yeşil); iki kilit boş; dev sunucularım kapalıydı |

Testler (`EmployeeDrawer.test.tsx:2125`, `:2136`): ikisi de değişiklikten önce
kırmızıydı (`expected { text: null, hidden: false }`; `expected <span> to be null`),
sonra yeşil.

Chrome erişilebilirlik ağacı (gerçek tarayıcı, 1280 ve 390):
- Önce: `button "Remove photo"` açıklama boş (cümle düğmeye bağlı değildi).
- Sonra: `button "Remove photo"` açıklama "Remove only the photo shown for this
  workspace.".

Ekran görüntüleri (`artifacts/nf-arayuz/emp-001-a3/`; Meyhouse, Test Employee,
admin bakıyor; gerçek yerel veri, yazma yok):
- `before-employee-access-1280.png`, `after-employee-access-1280.png`
- `before-employee-access-390.png`, `after-employee-access-390.png`
- Yatay taşma: sayfa, çekmece ve sekme içeriğinde 0px (dört görüntüde ölçüldü).

Skills: `design:accessibility-review` ve `superpowers:verification-before-completion`
bu oturumda yüklüydü, ölçütlerini uyguladım. `superpowers:test-driven-development`'ı
kullanım tasarrufu için yüklemedim; önce kırmızı, sonra yeşil sırasını izledim.

Bakım: dev sunucular durduruldu. A ve A2 main'de doğrulandı (`git cherry
origin/main` → main'de olmayan 0 commit); yerel `task/emp-001-a` ve
`task/emp-001-a2` dallarını sildim. `.claude/launch.json`'daki `emp-*` girişleri
(gitignore'da) C3 için duruyor.
