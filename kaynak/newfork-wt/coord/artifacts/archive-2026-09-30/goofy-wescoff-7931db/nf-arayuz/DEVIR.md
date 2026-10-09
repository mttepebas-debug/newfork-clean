# DEVİR — nf-arayuz, Employees çekmecesi (EMP-001 A/A2/A3 → C3). 2026-09-30, main `8b1b0cf0`

Yalnız koddan çıkmayanlar. Satırlar `apps/web/src/employees/EmployeeDrawer.tsx` (3343 satır) içindir; kaydıysa adla ara.

## 1. Harita
- `renderSection` :1646 sekmeyi seçer. `ProfileSection` :1904, `EmploymentSection` :2140, `AccessSection` :2283, `EmployeeAvatarControl` :2594.
- İş ve lokasyon kutucukları tek bileşen: `AssignmentPicker` :2941 (Locations çağrısı :2206, Jobs :2240). "Primary" radyosu :3046 (`label.primary-choice`; Management işinde çizilmez). Departman başlıkları `byDepartment` :3079 → `strong.employee-assignment-group`.
- Bir kutucuğu kilitlemenin hazır yolu: `lockedIds` (Set) + `rowAction` (:2223-2224; lokasyondaki "Remove" böyle geliyor) → satır `data-locked="true"`, kutucuk `disabled`; CSS `employee-location-parts.css`. Owner işi ve lokasyonları için yeni yol açma, bunu kullan.
- Owner kaydı: `detail.role_name === "Owner"` (`toDraft` :3121 `is_owner_record`; `AccessSection` :2336). İşin `owner` / `management` bayrakları `employee-data.ts` → `EmployeeJobOption`.
- Kilitli alan görünümü: salt okunur input gri = `.employee-field input[readonly]` (`styles.css:1794`); `disabled` = `:1907`. Alan bileşeni `Field` :2830: `lockedReason` (neden), `mark` (input içi simge; `.employee-field-mark is-verified|is-pending`, `:1873`).
- Çekmecenin eski CSS'i `styles.css` ~1570-2500 ham hex dolu; yeni kuralı token'la yaz, eskisine dokunma (BL-259).

## 2. Görünmeyen açıklama kalıbı
- Alan altında görünür yardım yazısı yok (kullanıcı kararı). Neden = `<span id=… className="sr-only">` + hedefte `aria-describedby` + saran etikette ya da düğmede `title`. Örnekler: `Field` :2932, rol seçici :2336 / :2471, fotoğraf düğmesi (`EmployeeAvatarControl`).
- Test yardımcısı `described(el)` (`EmployeeDrawer.test.tsx:2017`, "EMP-001 look" bloğu :1988) → `{ text, hidden }`; `hidden: true` = `sr-only`. Doğrulama hatası görünür kalır (`<small id="…-error">`).

## 3. Ekran görüntüsü
- Betik: bu worktree'de `artifacts/nf-arayuz/tools/emp-shots.mjs` (kendi klasörüne kopyala). `node emp-shots.mjs <outDir> <email> <önek> 1280,390 <ad>:<employeeId>:<sekme> …`; `<ad>:create:profile` = yeni kişi. Env: `AX=1` Chrome erişilebilirlik ağacı; `OWNER_SELF=<userId>` kişi okumasını "kayıt senin, rolün Owner" diye cevaplar; `CSS=…` deneme stili; `BASE`. Her görüntüde yatay taşmayı ve aynı satırdaki input kenarlarını yazar. Git Bash'te `MSYS_NO_PATHCONV=1` + `C:/…` yol.
- Sunucular: `.claude/launch.json` (gitignore) girişi + `preview_start`; `tools/emp-api.cmd`, `tools/emp-web.cmd` (içindeki klasör yolunu değiştir). Web 5612, api 5613.
- Hesaplar (sihirli bağlantı yerel mailpit'e düşer; aynı adrese 60 sn'de bir): `test.admin@meyhouse.test` → büyük Meyhouse, BAR / FOH / Management (Test Employee `6da01b53-0909-44c6-be01-9442deb5f3c0`, Test Manager `7bfb2be9-5647-4f30-81a8-e6e5453c482c`, owner kaydı `61e411f5-c0cc-4ec4-95c2-1c4975d1316f`). e2e dünyasının admin/manager'ı → bekleyen davetli kayıt. Seed `owner@newfork.test` (id `d9f43e62-e099-48e1-bc6f-a5aabe8e87d5`) → küçük Meyhouse, Alex Kim `15000000-0000-4000-8000-000000000001`.
- Tuzak: admin, owner kaydında Access sekmesini görmez ve kaydı salt okunur görür; e2e dünyasının owner'ı giriş yapamaz → owner'ın kendi görünümü yalnız `OWNER_SELF` ile çekilir (raporda "kısmen sahte" de). `git rebase` sonrası vite eski CSS'i verir → web sunucusunu yeniden başlat.

## 4. Tuzaklar
- Yazı silince komşunun hizasına bak: onu dengeleyen boşluk kalıyor (`.employee-remove-access` margin, `::after` min-height, boş `<span/>`). `.employee-field` `align-content: start` kalmalı; yoksa aynı satırdaki inputlar 11px kayar.
- Test kurulumu: jest-dom yok (`toHaveProperty`, `getBy*`). `renderDrawer(section, detail, onboarding)`; Employment'ta tıklamadan önce `await employeeLoaded()`. Departman/iş listesi teste `loadEmployeeReferenceData` → `mockResolvedValueOnce` ile verilir (varsayılan: departman yok). Testler satırı `getByLabelText(ad).closest("div")` ile buluyor: satırlar fieldset'in doğrudan çocuğu kalmalı.
- Bütün web vitest'ini dev sunucular açıkken koşma: `PublicTrustPages` 5 sn sınırını aşıp düştü. Önce `preview_stop`, `gh run list --limit 3`, `node scripts/lock.mjs status`.
- Playwright `getByLabel("E-mail")` alt dize eşler ("Emergency e-mail" de uyar): owner/admin bakışında 2 öğe → `exact: true`.
- GateGuard: her gelen mesajdan sonraki ilk Bash'ten önce 2 madde (istek; komut neyi doğrular). Her dosyanın ilk Edit/Write'ından önce 4 madde (içe alanlar, etkilenen API, veri, talimat alıntısı). Her dosyanın ilk dokunuşu bir kez reddedilir; maddeleri yazıp aynı çağrıyı yeniden gönder. Silme komutunda (ör. `git branch -D`) dosya listesi + geri alma satırı ister.
- `send_message` ilk denemede "undelivered" dönebilir; bir kez daha gönder ("queued" yeter). Asıl kanal rapor dosyası: koordinatör klasörden okuyor.
- Önceki raporlar: `artifacts/nf-arayuz/emp-001-a/`, `-a2/`, `-a3/RAPOR.md` (verilen kararlar D1–D8, silinen metinler).
