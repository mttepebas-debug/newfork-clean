# G18 dilim c: hesap düğmesindeki Documents sayısı yalnız belgeleri sayıyor (BL-341) — nf-db, 2026-09-30

## 1. Nerede duruyor
Bitti, commit'li. Push edilmedi. Migration ortak yerel veritabanına kalıcı uygulanmadı.

| | |
|---|---|
| Dal | `task/g18-c` (yerel), tabanı `origin/main` @ `9733f42c` |
| Commit | `c8cac1e6` |
| Worktree | `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\wizardly-goldberg-d97422` |
| Migration | `supabase/migrations/20261001020000_the_documents_count_counts_documents.sql` (`20261001010000`'dan büyük) |
| Test | `supabase/tests/invitation_acceptance_needs_a_confirmed_email.test.sql` (5 yeni hücre; yeni dosya açılmadı, `ci-green.txt` değişmedi) |

## 2. Ne yapıldı (etkisi)
Sol alttaki hesap düğmesinde ve Account → Documents'ta görünen "bekleyen belge" sayısı artık yalnız belgeleri sayıyor. Dün, işe katılırken doldurulan profil adımı ve müsaitlik adımı da belge sayılıyordu.

Örnek: Emre işe katılmış, profilini doldurmuş, kendisinden hiç belge istenmemiş. Dün düğmede 2 görüyordu, bugün 0. Workspace "Food handler card" belgesini herkesten isteyince 1 görür; belgeyi gönderip incelemeye düşünce yine 0.

- Değişen tek fonksiyon: `public.count_account_attention_service` (hesap düğmesinin okuduğu sayaç). Tek satır eklendi: yalnız `document` ve `acknowledgement` türündeki adımlar sayılır. Account → Documents listesinin kullandığı süzgecin aynısı.
- Değişmeyenler: kimin satırı sayılır, hangi durumlar dışarıda kalır (tamamlanmış, incelemede, muaf, kaldırılmış, duraklatılmış), Workspaces sayısı, fonksiyonun imzası ve dönüş şekli (`documents`, `workspaces`), yetkileri (`service_role`). Sayının şekli değişmediği için web'e ve API'ye dokunulmadı.

### Testler
Yöntem: dosya başına ayrı `psql` oturumu; kurucu (`builder.sql`) ve migration dosyanın kendi `begin;` satırından sonra, sonunda geri alınır; `ON_ERROR_STOP=1`. Koşulardan önce `gh run list` ile baktım; main CI koşuyordu, bitmesini bekledim (36720132559, yeşil bitti), sonra başladım.

- **Önce kırmızı (13:24 UTC, migration'sız):** dört hücre kırmızı — 0 yerine 2, 1 yerine 3, 0 yerine 2, 1 yerine 3. (Beşinci kırmızı benim test hatamdı: sıralama; düzelttim.)
- **Sonra yeşil (13:25 UTC, migration'la):**

| Dosya | Sonuç |
|---|---|
| `invitation_acceptance_needs_a_confirmed_email` | 19/19 |
| `authz_catalog` | 10/10 (sayaçlar artmadı) |
| `authorization_coverage` | 5/5 (fonksiyonun sınıfı aynı: `account.self`) |
| `browser_privileges` | 9/9 |
| `public_roles_reach_no_table_directly` | 4/4 |
| `document_publication` | 58/58 |

- Tam paket koşulmadı (görev öyle istedi); dal CI'ı tamamını koşar.
- `bash scripts/ci-green-guard.sh origin/main` = 0.
- **Kalıcı iz yok** (13:26 UTC): son migration `20261001010000`, sayaç fonksiyonu eski gövdesinde, workspace / kullanıcı / test kimliği sayıları koşudan önceki gibi (310 / 1214 / 4514). `db.lock` alındı ve bırakıldı.

### Done when karşılığı
| Madde | Durum |
|---|---|
| Belgesi olmayan çalışan → 0; tamamlanmış profil adımı sayılmıyor | yeşil (hücre 15–16) |
| Bir bekleyen belgesi olan → 1 | yeşil (hücre 17) |
| Gönderilip incelemeye düşünce → 0 | yeşil (hücre 18) |
| Bekleyen acknowledgement → 1 | yeşil (hücre 19) |
| İlgili dosyalar + `authz_catalog` + `authorization_coverage` yeşil, sayaçlar artmadı | tamam |
| `ci-green-guard` = 0, kalıcı iz yok | tamam |
| Görev dosyası madde 11 (bir hesapta elle: sayaç = Documents'ta "yapılacak" satır sayısı) | aşağıda, not 1 |

## 3. Açık kalanlar ve notlar
1. **Elle doğrulama yerelde sınırlı.** Ortak yerel veritabanında belge ya da acknowledgement türünde tek satır yok (ölçüm 13:25 UTC: 0). Bu yüzden migration'la her hesap 0 görüyor ve Documents sayfasında da "yapılacak" satır yok; ikisi tutuyor ama tek bir değerle. "1 görür" kanıtı test hücrelerinden geliyor (belge yayımlanınca 1, acknowledgement 1).
2. **İki hücre elle kuruldu** (test içinde `ponytail:` notuyla): belgenin "incelemede" durumu (ürünün yolu dosya yüklemesinden geçiyor) ve acknowledgement türü (kendi yayımlama ve uygulama adımı var; sayaç yalnız türe bakıyor).
3. **Yolda bulunan, dokunulmadı:** sayaç satırın sahibini çalışan kaydının hesabından (`employee.user_id`) buluyor; Account → Documents listesi ise satırdaki `lifecycle_user_id`'den ve ayrıca `document_actor_can_read` kuralından. Bugün ikisi aynı kişiyi veriyor; ayrıştıkları bir durum (ör. hesabı sonradan değişen kayıt) olursa sayı ile liste yine ayrışır. Backlog önerisi: `leave: low / do: safe`.
4. Skill'ler: `supabase-postgres-best-practices`, `test-driven-development`, `verification-before-completion` bu oturumda yüklüydü; yeniden çağrılmadı (haftalık sınır notu).

## 4. Ekranda ne değişti
Bu dalda arayüz kodu yok. Migration uygulanınca, sol alttaki hesap düğmesi ve Account → Documents:

| Hesap | Önce | Sonra |
|---|---|---|
| Çalışan kaydı olan, belgesi istenmemiş hesap (yerelde 898 hesap) | 2 | 0 |
| Çalışan kaydı olup zaten 0 gören hesap (yerelde 263 hesap) | 0 | 0 |
| Bir belgesi bekleyen çalışan (test dünyası) | 3 | 1 |
| Belgesini gönderip inceleme bekleyen çalışan (test dünyası) | 2 | 0 |

Yerel ölçüm (13:25 UTC): 1161 hesap; toplam önce 1796, sonra 0. Sonuç fazla düzgün görünüyor; nedeni not 1 (yerelde hiç belge satırı yok).

## 5. Sırada ne var
1. `nf-guvenlik` tek bağımsız inceleme. Sorusu görev dosyasında: "sayaç başka hesabın ya da silinmiş workspace'in satırını sayıyor mu; yetkiler aynı mı". Cevabım: ikisi de değişmedi — süzgeçler (`employee.user_id = actor`, `workspace.lifecycle_status <> 'deleted'`, `archived_at is null`) aynen duruyor, yalnız bir `kind` satırı eklendi (sayı yalnız azalabilir); `create or replace` olduğu için grant'lar yerinde (`browser_privileges` yeşil).
2. Migration main'e alınmadan hemen önce uygulanır.
3. Backlog: not 3.
