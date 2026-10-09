# FB-6.2 .7b-db — çekmece okuma projeksiyonu (nf-db) — RAPOR

Tarih: 2026-09-30. Dal `task/fb62-7b-db` @ `02162f94` (origin'e gönderildi). Worktree:
`newfork-clean/.claude/worktrees/nostalgic-mestorf-5b3bba`. Kararlar: KK-35 S1(a)+S2(a), KK-36 (a).

## 1. Nerede duruyor
Bitti, main'e alınmayı bekliyor. Migration ortak yerel DB'ye **uygulanmadı** (yalnız tek
transaction + rollback denemeleri). Dal `.7b` (`nf-backend`) ile aynı toplu turda girmeli.

## 2. Ne yapıldı (etkisi)
Migration `supabase/migrations/20260930180000_the_drawer_reads_what_the_core_allows.sql`:
- **Çalışanlar → kişi çekmecesi** (`get_employee_detail_service`):
  - `managed_locations: [{id, name}]` — kişinin yalnız yönettiği lokasyonlar (KK-29). Örnek: Selin
    Kadıköy'de çalışıyor, Beşiktaş ve Cihangir'i yalnız yönetiyor. Owner ikisini görür. Yalnız
    Beşiktaş'ı yöneten Ayşe yalnız Beşiktaş'ı görür; Cihangir'in adı ona gitmez. Silinmiş lokasyon
    hiç görünmez. Kimse yönetmiyorsa `[]`.
  - `locations[].removable` — okuyan kişi bu kişiyi o lokasyondan çıkarabilir mi
    (`employee.remove_from_location` çekirdek cevabı). Örnek: Ayşe, Emre'yi Beşiktaş'tan
    çıkarabilir, Kadıköy'den çıkaramaz; owner ikisinden de çıkarabilir.
  - `allowed` 6 anahtardan 9'a çıktı: `set_managed_locations`, `invite`, `onboarding_review`
    (çekirdek eylemleri `employee.set_managed_locations`, `employee.invite`, `onboarding.review`;
    anahtar adında nokta `_` oldu). `set_managed_locations` hedef yönetici değilse hep `false`;
    komutun kendisi de yönetici olmayanı `22023` ile reddediyor, sunucu iki yerde aynı cevabı veriyor.
- **Çalışanlar listesi** (`list_employees_service`): son sütun `managed_location_names text[]`,
  "Manages" etiketi için. Aynı erişim süzgeci kullanılıyor. Dönüş şekli büyüdüğü için fonksiyon
  drop + create yapıldı; yetkiler yeniden verildi (yalnız `service_role`).
- **Workspace ana sayfası → düzen kaydetme** (`save_workspace_layout_service`, KK-36 a): artık
  panonun kendi kapısına (`workspace.todos`) soruyor. Eski kapı (`workspace.read` izni) bugün
  çalışana panoyu göremediği hâlde düzen kaydettiriyordu (ölçüldü: `{"status":"saved"}`). Artık
  çalışan `42501 authz.missing_permission`, başka workspace `42501 authz.not_member` alıyor; kapalı
  workspace ve belge engeli de reddediliyor.

Test: `supabase/tests/employee_drawer_reads.test.sql` (26 hücre), `ci-green.txt`'e eklendi.

## 3. Kanıt
- Kırmızı önce: migration'sız çalıştırmada `column e.managed_location_names does not exist`.
  Çalışanın düzen kaydı bugün `{"status":"saved"}` dönüyor.
- Migration + test tek transaction'da, sonra geri alındı: 26/26 ok (düzen hücreleri dahil).
- Tüm pgTAP paketi (153 dosya) her dosya için "migration + dosya + rollback" biçiminde koştu.
  Yeşil listede düşen yalnız iki dosya çıktı:
  - `authorization_matrix`: bilinen TODO satırları; TODO dışı hata 0, migration'lı ve
    migration'sız aynı (74).
  - `roles_permissions_rls`: dalın eski sürümüydü; main'deki `af2ef900` üzerine rebase sonrası
    iki durumda da 0.
- Yeşil listede olmayan 11 bilinen kırmızı dosya migration'lı ve migration'sız aynı sayıda
  düşüyor. **Dalın getirdiği kırmızı: 0.**
- `bash scripts/ci-green-guard.sh origin/main` = 0.
- Kilitler alındı ve bırakıldı (`db.lock`, nf-db/7b-db).

## 4. Açık kalanlar
- Dal `origin/main`'in bir docs commit'i gerisinde (`a5a43ebd`, yalnız `docs/`). Force push
  yasak olduğu için yeniden taşınmadı; entegrasyonda rebase edilir.
- KK-33: yalnız yönettiği lokasyondaki kişi için `onboarding_review` çekirdekte `true` görünür,
  ama servis FB-6.6'ya kadar P0002 döner. Bu bilinen boşluk, dokunulmadı.
- `nf-guvenlik` incelemesi gerekli (R3: yetki okuması ve bir yazma kapısı değişti).

## 5. Ekranda ne değişti
Veritabanında görünür bir şey değişmedi; ekran `.7b` (`nf-backend`) bağlanınca değişir:
- Çalışan çekmecesinde "yalnız yönetir" editörü mevcut listeyle açılır.
- Lokasyon satırlarında "çıkar" yalnız izin varsa görünür.
- Listede "Manages" etiketi çıkar.
- Çalışan artık Workspace düzenini kaydedemez; bunun ekranda karşılığı yok, çünkü panoyu zaten
  açamıyor.

## 5b. İnceleme düzeltmeleri (nf-guvenlik ONAY @02162f94 sonrası, aynı dal)
- **D1:** `authorization_coverage.test.sql:229` düzen servisini artık `workspace.todos` diye
  sınıflıyor. Aynı dosyanın 110. satırı (pano, `workspace.read`) main'de de yanlış; istenmediği için
  dokunulmadı, backlog adayı.
- **D2:** `authz_catalog.test.sql` ipuçsuz 42501 tavanı ölçülen 175'e çekildi (ölçüm: migration'lı
  175, migration'sız 176; ortak DB, rollback).
- **D4:** "Yalnız yönetici yönetir" kuralı tek yardımcıda: `app_private.manages_without_working(w, member)`.
  Hem çekmecenin `allowed.set_managed_locations` cevabı hem de
  `set_employee_managed_locations_service` komutu onu çağırıyor (komut aynı migration'da yeniden
  tanımlandı, gövdenin geri kalanı aynı). Sayaç kalıbını genişletmek (ikinci yarı) backlog'a;
  yapılmadı, madde koordinatörün.
- **D5:** Eylem satırı yoksa artık hata var: detayda `employee.remove_from_location`, listede
  `employee.list` bulunamazsa `22023`. Önceden detay `removable = true` okuyordu (fail-open).
- Kilitleyen hücreler önce yazıldı: eski migration'la 27, 29 ve 30 kırmızıydı; yeni migration'la
  30/30 yeşil.

## 6. Sırada ne var
- `nf-guvenlik` incelemesi. Bakılacak nokta: yetkisiz okuyana lokasyon adı sızmıyor mu.
- `.7b` ile aynı turda main'e alınıp ortak DB'ye uygulanması.
- `.7b` işçisine iki bildirim gönderildi: anahtar adları ve düzen kapısı.
- Yolda bulunan: mevcut `locations[]` (kişinin çalıştığı lokasyonlar) okuyana erişimi olmayan
  lokasyon adlarını da gösteriyor (T5a'dan kalan davranış). Yeni alanlar süzülüyor, bu alan
  süzülmüyor. Workspace içi lokasyon adları gizli sayılıyorsa ayrı madde olarak ele alınabilir;
  kapsam dışı, dokunulmadı.
