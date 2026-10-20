# e2e, test disiplini, CI

Playwright e2e, vitest tuzakları, kırmızı testi ayırmak. `.github/` ve `scripts/` kuralları da buradadır.

## e2e
- `global-setup.ts` her koşuda builder'la yeni workspace kurup ortak yerel DB'ye commit'ler (`.world.json`): ayse, emre (Kadikoy), mehmet (Besiktas), zeynep (admin), ali, deniz (ikisi). Ek kişi ve rol: `fixtures/documents.ts`; kişi sayan spec kendi dünyasını kurar.
- Tek dosya: `e2e` klasöründe `npx playwright test flows/<dosya>` (`pnpm.cmd e2e -- <dosya>` bütün paketi koşturur). Ortak DB'ye dokunduğu için `e2e` klasöründen `node ../scripts/lock.mjs run db --e2e -- npx playwright test flows/<dosya>` ile. DB'siz hızlı kapı: `pnpm.cmd --filter @newfork/e2e typecheck` ve `lint`.
- `--repeat-each` yalnız spec `fixtures/world.ts`'teki `roundWeek`, `roundLabel`, `draftName`'i kullanırsa çalışır; sabit ad ikinci turda çakışır.
- Config `npx supabase status -o env` okur: "did not print …" yerel Supabase kapalı demektir.
- `signIn` girişi beklemez: ardından `expect(page).not.toHaveURL(/\/sign-in/)` ya da `signInAs`.
- Sunucu kuralı ekranı atlayıp `tokenOf(person)` ile API'den sınanır (`ownership-transfer-password.spec.ts`). Kayıt e-postası Mailpit'te (`E2E_MAILPIT_URL`).
- API'nin Resend e-postası (davet, parola sıfırlama, hesap kurtarma) Mailpit'e düşmez: bağlantı GoTrue admin `POST /auth/v1/admin/generate_link` ile üretilir, `hashed_token` cevabın üst düzeyinde (`flows/password-reset.spec.ts`).
- "Hayır" kontrolünün yanına bir "evet" konur. Yerleşik Manager yönettiği yerde belgeleri okur ve onaylar (BL-560); belge izni olmayan müdür gereken testte rol, Manager'ın izinlerinden `employee_documents.*` çıkarılarak kurulur.
- Kendiliğinden yönlenen sayfada (onboarding sihirbazı) DB değil adres beklenir (`toHaveURL`); CI'daki kırmızı buydu. Toast her zaman çıkmaz (BL-561): kararı DB'den bekle.
- `ConfirmButton`: iki ayrı `getByRole("button", { name, exact: true })` ("Remove…" → "Confirm remove…", 3,2 sn'de söner). `<select>`: `getByRole("combobox")`. `toContainText` gizli Tooltip metnini de okur: `{ useInnerText: true }`.
- Schedule kartı çift tık ya da Enter ile açılır. Employees satırı Employment'ı açar, Profile için ada tıklanır. Employee Hub yalnız bugün−2…+42 günü çeker.

## Kırmızı testi ayırmak
- Görev metnine değil loga bak: `gh run view <id> --log-failed`; e2e izi ve görüntüsü `gh run download <id> -n playwright-report` (7 gün).
- `workers: 1` tek tarayıcı: `test-failed-N.png` önceki testlerin açık sayfalarını da içerir; görüntüyü düşen testin kendi adımıyla eşleştir.
- Yalnız tam koşuda düşen vitest: Testing Library `findBy`/`waitFor` varsayılanı 1 sn, vitest'in 20 sn'si değil (`configure({ asyncUtilTimeout: 5000 })`); tembel rota ilk ziyarette derlenir (`App.test.tsx` `lazyRoute`); effect'le dolan form dolmadan tıklanmaz.
- CI `TZ=America/Los_Angeles`, bu makine de. Başka dilim: PowerShell `$env:TZ='Asia/Tokyo'`; Git Bash'te `TZ=… node` yok sayılır.
- skip ya da todo eklemek de beklenti gevşetmektir.

## CI ve runner
- `.github/workflows/ci.yml`: check (lint → typecheck → test → build) + db (pgTAP; `supabase/tests/ci-green.txt` yalnız büyür; Schedule hız testi ayrı koşar) + e2e. Mert'in bilgisayarındaki self-hosted runner'da koşar (şu an tek runner); bir runner, onu yalıtan değişiklik main'e girmeden havuza eklenmez.
- CI yalnız trende (`train/**`) ve elle koşar, PR'da koşmaz; `docs/**` ve `*.md` değişikliği koşturmaz.
- Runner yalıtımı (`scripts/ci-supabase-apart.sh`) ve "forwards/expose … 500" port tuzağı: KARARLAR OPS-01.

## Tuzaklar
- Eski daldan gelen spec trene verilmeden önce tam `pnpm.cmd lint` koşulur: e2e/flows'ta `@playwright/test`'ten `test`/`expect` içe aktarmak yasak, `../fixtures/test`'ten alınır (BL-990; tren CI 37919832135 bu yüzden düştü).
- `scripts/*.test.mjs` kökteki `pnpm.cmd test` içinde `node --test` ile koşar.
- `flows/password-reset.spec.ts` dünya kişisi Deniz'in parolasını değiştirir: UI'dan giriş yapan yeni spec ya kendi kişisini kurar (`personWithPassword` + `signInAs`) ya da Deniz'i kullanmaz (TAKAS-RELEASE).
- `ci.yml` düzenlemesi izin sınıflandırıcısınca reddedilebilir; izni kullanıcı o pencerede verir.
- Diske PNG için repo içinde geçici Playwright betiği (`chromium.launch({ channel: "chrome" })`), sonra silinir; scratchpad'den modül bulunmaz. Spec içi görüntü yolu worktree köküne göre: `artifacts/...`.
