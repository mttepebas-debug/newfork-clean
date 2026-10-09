# FB-6.2.10 — e2e: davet, kapsam, "Employee view" geçişi, erişim-yok çekmecesi

nf-test, 2026-09-30. Dal `task/fb62-10` (worktree `.claude/worktrees/elastic-mirzakhani-85c7aa`),
taban `169ec0a9`. Push edilmedi.

| Commit | İçerik |
|---|---|
| `f1f75b51` | `test(e2e): invite, manager scope, no-access drawer and the employee view switch (FB-6.2.10)` — iki yeni spec |
| `ff0cf56f` | `docs(agent-memory): …` — nf-test hafıza notu (istersen alma; ayrı commit) |

Not: dal açıldıktan sonra main bir docs commit'i ilerledi (`b406ca9e`, yalnız `docs/plan/BACKLOG.md`);
rebase çatışmasız olmalı.

## 1. Nerede duruyor
Bitti. İstenen dört madde yazıldı ve yeşil. Employment sekmesine dayanan hiçbir adım yok; sormam
gereken bir durum çıkmadı. Uygulama kusuru bulmadım.

## 2. Ne yapıldı (etkisi)
Altı yeni tarayıcı testi, hepsi gerçek giriş ekranından, test dünyasındaki kişilerle:

**`e2e/flows/invite.spec.ts`** (akış 2, Done when 8)
1. **Yönetici kendi lokasyonuna davet eder, davetli kabul eder, listede görünür.** Kadikoy yöneticisi
   Ayse, Employees ekranında henüz davet edilmemiş bir Kadikoy kaydını açar ("Not Invited"), Profile'daki
   E-mail alanına adresi yazar, alttaki "Invite role"dan Employee seçer, "Invite"a basar. Satır "Invited"
   olur. Davetli, çekmecenin verdiği bağlantıyı oturumsuz açar, "I already have an account" ile girer,
   "Accept invitation"a basar, "You're in" görür. Ayse listeyi yenileyince satır "Onboarding" olur.
2. **Başka lokasyona davet 403.** Ayse, yalnız Besiktas'ta çalışan bir kayıt için davet isteğini API'ye
   doğrudan gönderir → 403, veritabanında davet satırı 0. Aynı isteği admin Zeynep gönderince 200 ve
   davet satırı 1: Ayse'yi reddeden şey isteğin biçimi değil, lokasyon.

**`e2e/flows/scope-and-employee-view.spec.ts`** (akış 10 kapsam yarısı, Done when 7, BL-195)
3. **Eş rütbe görünürlüğü.** Test Kadikoy'a ikinci bir yönetici ekler. Admin Zeynep listede hem onu hem
   Besiktas yöneticisi Mehmet'i görür (ikisi de var). Ayse ikinci Kadikoy yöneticisini görür ve kaydını
   açabilir; Mehmet'in satırı Ayse'de yok.
4. **Erişim-yok çekmecesi (BL-195).** Ayse, Mehmet'in kaydının adresini doğrudan açar
   (`/app/employees?employeeId=…`). Çekmece "You don't have access to this employee" başlığını ve
   "Back to Home" linkini gösterir; ham hata (`role="alert"`) yok, "Mehmet" adı çekmecede geçmiyor.
5. **Çalışan görünümüne geçiş, masaüstü.** Ayse kenar çubuğundaki "Employee view" linkine basar →
   `/app/employee-hub`; kenar çubuğundan "Employees" kalkar, link "Management view" olur. Ona basınca
   `/app/workspace`'e döner, "Employees" ve "Employee view" geri gelir.
6. **Aynı geçiş, telefon (390×844).** Alt çubukta "More" → açılan pencerede "Employee view" →
   `/app/employee-hub`; çalışan alt çubuğunda "More" → "Management view" → `/app/workspace`.

### Kanıt (hepsi 2026-09-30, bu worktree, CI boştayken, `db.lock` ile)
| Komut | Sonuç |
|---|---|
| `pnpm.cmd e2e` (tam takım) | **25 passed (3.0m)** — 19 eski + 6 yeni; mevcut takım bozulmadı |
| `pnpm.cmd e2e flows/invite.spec.ts flows/scope-and-employee-view.spec.ts --repeat-each=2` | **12 passed (1.0m)** — iki ardışık tur, ikisi de yeşil |
| `pnpm.cmd --filter @newfork/e2e typecheck` | temiz |
| `pnpm.cmd --filter @newfork/e2e lint` | temiz |

Done when: iki spec boşta iki ardışık koşuda yeşil ✔ (tam takım koşusu + tekrarlı koşunun iki turu =
üç yeşil); mevcut e2e bozulmadı ✔; lint ve typecheck e2e için temiz ✔. Kilit bırakıldı
(`node scripts/lock.mjs status` → `db.lock: boş`).

İlk denemede kırmızı olan iki adım test hatasıydı, uygulama kusuru değil (beklenti gevşetilmedi):
satırın ortasına tıklamak çekmeceyi Employment bölümünde açıyordu (lokasyon/iş hücresi öyle tasarlanmış)
→ artık ada tıklanıyor; davet bağlantısı oturumsuz kişide giriş değil hesap açma ekranına düşüyordu →
"I already have an account" adımı eklendi.

## 3. Açık kalan ve nedeni
- **"Kendi lokasyonundan çıkar" e2e'si yazılmadı** — senin talimatın (Employment sekmesi değişecek).
  Done when 8'in bu parçası açık kalıyor; sekme planı netleşince yazılır.
- **Dal CI'ı koşmadı** (push etmedim; sen göndereceksin).
- **Koddaki geçici bozmayla kırmızı kanıtı yok.** Bunun yerine her "yok/reddedildi" iddiasının yanında
  aynı testte olumlu karşılığı var: Mehmet admin'de görünüyor, Ayse'de görünmüyor; aynı davet isteği
  admin'de 200, Ayse'de 403.

## 4. Ekranda ne değişti
Hiçbir şey. Yalnız test dosyaları eklendi.

## 5. Sırada ne var / yolda bulunanlar
1. **Davetlinin yeni hesap açarak kabul etmesi e2e'de yok** (leave: medium / do: safe). Davet
   bağlantısını oturumsuz açan kişi "Create your employee account" ekranına düşüyor; gerçek davetlinin
   çoğu bu yoldan gelir (hesap aç → e-postayı doğrula → kabul et). Yazdığım test hesabı zaten olan
   kişiyi sınıyor. E-posta doğrulaması Mailpit'ten okunabiliyor (`owner-legal-name-setup.spec.ts`
   kalıbı), yani yazılabilir; ayrı küçük iş. Backlog'a yazmadım (`docs/plan` benim alanım değil).
2. **Yeni spec'ler ortak test dünyasına kişi ekliyor** (leave: low / do: safe). Her koşu Kadikoy'a bir
   yönetici ve bir "Onboarding" çalışan, Besiktas'a bir davetli kayıt bırakıyor; spec'ler alfabetik
   koştuğu için `schedule-*`, `shift-hub-*` ve `sign-in-lands` bunlardan sonra koşuyor. Bugün 25/25
   yeşil. İleride Kadikoy'daki kişileri ya da yöneticileri sayan bir spec yazılırsa kendi dünyasını
   kurmalı. Hafıza notuna yazdım.
3. **Rol seçicisi değişirse tek satır değişir.** Davet testi alttaki "Invite role" kutusundan "Employee"
   seçiyor; BL-430 (tek seçenekli rol seçici) bu kutuyu kaldırır ya da önceden seçili getirirse
   `invite.spec.ts`'deki o satır güncellenir.
4. **"Invite" arka planda kaydı da kaydediyor.** E-mail Profile'da yazılıp "Invite"a basılınca çekmece
   önce kaydı kaydediyor, sonra daveti gönderiyor (`EmployeeDrawer.tsx:1365-1377`). Test bu yolu
   kullanıyor; Employment sekmesindeki Save'e dokunmuyor. Çekmecenin kaydetme düzeni değişirse (BL-431…433
   "Save hand-over") bu adım etkilenebilir.
5. **BL-404** (dünya owner'ı parolayla giremiyor): owner girişi gerekmedi, owner'ın işleri SQL ile
   yapıldı; yeni bir gözlem yok.
6. **e2e sunucu günlüğünde tekrar eden uyarı:** "Realtime send() is automatically falling back to REST
   API… use httpSend()" — yayın yapan her spec'te birkaç kez. Bugün zararsız, kütüphane "ileride
   kaldırılacak" diyor. BACKLOG'da karşılığını bulamadım (`grep httpSend` → 0). (leave: low / do: safe,
   `nf-backend`.)

Skills: `ecc:e2e-testing` (spec yazımı) ve `superpowers:verification-before-completion` kullanıldı;
`superpowers:systematic-debugging` gerekmedi (iki kırmızı adımın nedeni hata çıktısı ve ekran
görüntüsünden doğrudan okundu).
