# FB-6.2 `.7b` QA düzeltmesi, veritabanı kısmı (nf-db, 2026-09-30)

## 1. Nerede duruyor
Bitti; push edildi.

| | |
|---|---|
| Dal | `origin/task/fb62-7b-qa-db` |
| Commit | `4480d41f` + `866945fb` (boş nesne nf-backend'in istediği biçimde) |
| Taban | `origin/main` @ `840b92a7` |
| Worktree | `.claude/worktrees/dreamy-sinoussi-7c5a4a` |

- `scripts/ci-green-guard.sh origin/main`: 0 (guard 0).
- Ortak yerel veritabanına uygulanmadı; bütün denemeler geri alındı.
- `db.lock` alındı ve bırakıldı.

## 2. Ne yapıldı
Migration: `supabase/migrations/20260930190000_the_drawer_tells_nothing_on_file_from_not_allowed.sql`. Yalnız `get_employee_detail_service` gövdesi değişti. Çağrı biçimi, dönen şekil, grant'lar ve çekirdek eylemleri aynı.

### Bulgu 1: satırı olmayan kişide owner da alanları görmüyordu
Employees → çekmece → Profile'da owner, onboarding'i bitmemiş Alex Kim'in doğum tarihini, telefonunu, acil durum kişisini ve adresini görmüyordu.

Nedeni: sunucu iki farklı durumu aynı `private_contact: null` cevabıyla veriyordu. Durumlar "okuma izni yok" ve "izin var ama gizli profil satırı henüz yok". Ekran ikisini de "izin yok" diye okuyordu.

Şimdi iki durum ayrı cevap alıyor:

| Durum | `private_contact` |
|---|---|
| Okuma izni yok | `null` (değişmedi) |
| İzin var, satır yok | boş nesne |

Boş nesne, yeni açılan bir satırın varsayılan değerleridir:
- `legal_first_name`, `legal_last_name` ve `preferred_name` anahtarları hiç yok (biçim nf-backend'le birebir kararlaştırıldı).
- `emergency_contact_email: ""`.
- `share_phone_with_teammates` ve `share_email_with_teammates`: `false`.
- Geri kalan alanlar `null`.

Bu biçim mevcut `employeeDetailSchema` ile olduğu gibi parse ediliyor; shared kodda değişiklik gerekmiyor. Koordinatörün "alanlar null" önerisi olduğu gibi uygulanamazdı: şemada yasal ad alanları, `emergency_contact_email` ve paylaşım anahtarları `null` kabul etmiyor.

### Bulgu 2: hesabı bağlı kişide Invite görünüyordu
- `allowed.invite` artık davet komutuyla (`prepare_employee_invitation_service`) aynı kuralı uyguluyor: hesabı bağlı ya da arşivlenmiş kayıtta `false`.
- Komut bu iki durumu zaten reddediyor (P0002); çekmece ise "davet edebilir" diyordu.
- "Hesap bağlı mı" bilgisi detayda zaten var (`user_id`), yeni alan eklenmedi.

## Testler
Hepsi migration ve test tek işlemde koşulup geri alınarak yapıldı.

**`employee_drawer_reads.test.sql`: 39/39.**
- Migration olmadan 4 hücre kırmızıydı: üç davet hücresi ve boş profil hücresi.
- Eklenen hücreler:
  - Owner, Emre'nin dolu profilini okuyor (pozitif ön koşul).
  - Owner, satırı olmayan Pia için boş nesneyi okuyor.
  - Özel okuma izni olmayan müdür, hem Emre hem Pia için `null` okuyor.
  - Hesabı olmayan Pia'ya owner da müdür de davet gönderebiliyor.
  - Hesabı bağlı Selin ve Emre'ye, arşivlenmiş Ola'ya kimse davet gönderemiyor.
- Düzeltilen iki hücre eski yanlış kurala göre yazılmıştı: hesabı bağlı Selin ve Emre için "invite: true" bekliyordu.

**Diğer dosyalar:**

| Dosya | Sonuç |
|---|---|
| `employee_directory_rls` | 118/118 |
| `employees_on_the_core` | 61/61 |
| `authorization_coverage` | 5/5 |
| `browser_privileges` | 9/9 |
| `authz_catalog` | 10/10 |
| `roles_permissions_rls` | 53/53 |
| `authorization_matrix` | 8060 hücreden 7986 ok; kalan 74 hücrenin hepsi önceden bilinen `TODO known` hücresi |

- Katalog sayaçları değişmedi; yetki matrisinde yeni hücre yok.
- Tam `test:db` ve e2e koşulmadı; koordinatörün toplu turunda.

## 3. Açık kalanlar
- **Web tarafı (nf-backend işçisi `local_47d3e133…`, dal `task/fb62-7b-qa-fixes`):** biçimi kendisi istedi ve `866945fb` onun istediğiyle birebir aynı. İki commit'in cherry-pick edilmesi için sha'lar ona bildirildi.
  - Çekmece `privateContact !== null`'ı "okuma izni var" diye okumaya devam eder; bu artık doğru.
  - Yasal ad inceleme paneli `legal_first_name` yoksa gizlenmeli.
  - Alt çubuktaki Invite `allowed.invite`'a bağlanmalı.
- **Bulgu 3 ve sonrası** (yönetilen lokasyon listesinde kişinin zaten çalıştığı lokasyonun da çıkması ve metin işleri): bu görevin kapsamında değil, dokunulmadı.

## 4. Ekranda ne değişti
- **Employees → çekmece → Profile:** owner ve özel okuma izni olan admin, onboarding'i bitmemiş kişide alanları "Not provided" olarak yeniden görür. Web, alanları sunucu cevabından okuyor.
- **Employees → çekmece, alt çubuk:** web `allowed.invite`'a bağlanınca, hesabı bağlı kişide Invite düğmesi kalkar.
- **Arayüz kodu:** bu dalda değişmedi.

## 5. Sırada ne var
1. nf-backend dalıyla aynı toplu turda main'e alınması.
2. Migration'ın main'e göndermeden hemen önce ortak veritabanına uygulanması.
3. Toplu tam veritabanı testi (`test:db`).
4. Çekmecenin görsel QA'sının yeniden yapılması (KK-37).
