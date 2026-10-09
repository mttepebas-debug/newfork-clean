# FB-6.2.9 — kırmızı dosyalar (nf-test işçisi, 2026-09-29)

Branch `task/fb62-9-red-files` (taban `origin/main` `da8e3dc0`), commit **`d3669ede`**, push edildi (main'e değil).
Worktree: `newfork-clean/.claude/worktrees/nice-montalcini-4040cc`.

## 1. Nerede duruyor
Bitti. `roles_permissions_rls` yeşil ve yeşil listede; açık açık (güvenlik) bulunmadı; ürün koduna dokunulmadı.

## 2. Ne yapıldı (etkisi)
**Yeniden ölçüm** (2026-09-29 12:26 PDT, ortak yerel DB, 395 migration = main, `db.lock` altında):
`roles_permissions_rls` 42/47 — kırmızı yine **#3, #7, #30, #35, #46**; `employee_hub` 13/13 yeşil.
Nedenlerden biri değişmiş: **#35** artık tetikleyiciden değil, çekirdekten reddediliyor
(`terminate_employee_service` → `authorize(employee.terminate)` → 42501 `authz.out_of_scope`). Bu, bugünkü kurala uygun:
tam çıkarma yalnız admin/owner (KARARLAR `:53`). Yani 09-28'deki "gerçek açık" T5b'de kapanmış; test eski kuralı sınıyordu.

**Test yeniden yazıldı, beklenti gevşemedi** (`supabase/tests/roles_permissions_rls.test.sql`):
- #3 → admin varsayılan olarak rolleri yönetir (D2, `20260924123013_authorization_core.sql:45-71`) + yeni hücre: yönetici yönetemez.
- #7 → rol yönetimi olmayan üye (yönetici) rol oluşturamaz: 42501.
- #30 → `save_employee_service` 17 parametreli bugünkü imzayla çağrılıyor (orta ad eklendi); ortak lokasyonlu kayıt düzenlemesi yine geçiyor.
- #35 → yönetici işten çıkaramaz (42501) + iki yeni hücre: yönetici kendi lokasyonu olmayan yerden çıkaramaz (42501); kendi lokasyonundan çıkarır ve kişinin öbür lokasyonu durur, üyeliği açık kalır.
- #46 → işten çıkarmayı admin yapar; bağlı üyelik askıya alınır (`suspended`).
- "Dış lokasyon ataması korundu" kontrolü (eski son satır) çıkarma hücrelerinin önüne alındı; aynı şeyi aynı sayıyla sınıyor.

Somut örnek: Yönetici (Shared lokasyonu) "Common Record"ı (Shared + Outside) işten çıkarmayı dener → reddedilir; Shared'dan çıkarır → kayıtta yalnız Outside kalır; admin işten çıkarır → kişinin hesabı askıya alınır.

**Kanıt:**
- `npx supabase test db roles_permissions_rls employee_hub authz_catalog` → **76/76 ok** (53 + 13 + 10), 12:29 PDT.
- `bash scripts/ci-green-guard.sh origin/main` → 0.
- `roles_permissions_rls` `ci-not-green.txt`'ten çıktı, `ci-green.txt`'e girdi. `employee_hub` zaten `ci-green.txt:132`'de (önceki bir adım eklemiş).

## 3. Açık kalanlar
- **Katalog tavanları:** değişiklik gerekmedi. Bugünkü ölçüm (yerel DB, salt okunur, 12:28 PDT) yedi sayacın yedisini de tam tavanda buldu, hepsi Done when 4/18 hedefinin altında:
  `auth.uid()` 24 (hedef ≤24), jwt 25 (≤29), kapsam/rütbe 41 (≤46), `_base/_vN` 13, politika 10 (≤10), ertelenmiş tetikleyici 10, ipucusuz 42501 176 (ilk ölçüm 255). T5b'de her `nf-db` adımı tavanı kendi commit'inde indirmiş; düşürülecek boşluk yok.
- **`known_gap`:** silinecek satır yok. Dosyada 4 satır kaldı (`authorization_matrix.test.sql:796-806`), bu dilimin beşi T5b'de silinmiş; Done when 2'nin 9 → 4 hedefi tutuyor. `decide:` hücresi 0 (3 `grep` eşleşmesi yorum + işleyici).
- `authorization_matrix` bu işte koşturulmadı: dosyası değişmedi; iddia `grep` ile.
- Branch CI koşusu push'la başladı; sonucunu koordinatör görür (`gh run list --branch task/fb62-9-red-files`).

## 4. Ekranda ne değişti
Görünürde bir şey değişmedi (yalnız veritabanı testi ve CI listesi).

## 5. Sırada ne var / yolda bulunanlar
- `.9` main'e girince FB-6.2 Done when 1 tamam (her iki dosya yeşil ve listede).
- Yolda bulunan (dokunulmadı): test dosyasında `'Owner explicitly authorizes Admin'` hücresi admin'e zaten sahip olduğu `roles.manage`'i tekrar ekliyor — D2'den sonra açıklaması eskimiş, testi yine doğru şeyi (owner admin rolünü düzenler) sınıyor. Düşük önem; istenirse ad düzeltmesi.
- Yolda bulunan: yeni ret hücreleri yalnız 42501'i kontrol ediyor, `authz.*` ipucunu değil (Done when 23/D5 kalıbı); bu dosya için zorunlu değildi.
