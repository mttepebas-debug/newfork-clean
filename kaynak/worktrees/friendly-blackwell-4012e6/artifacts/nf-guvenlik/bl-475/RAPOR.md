# BL-475 — katalog A→Z, elle sıralama kalkıyor: bağımsız inceleme (R2)

**KARAR: ONAY @7bce0322** (dal CI `36785288492` yeşil bitmesi şartıyla; bakarken koşuyordu)

Rol: nf-guvenlik (salt okunur), 2026-09-30. Dal `task/bl-475` (taban `9dcbb1ec`; main `6dbbf4a3`, arada migration yok), üç commit, 18 dosya +1267 / −208.

## 1. Nerede duruyor
İnceleme bitti. Bulgu yok (Kritik / Yüksek / Orta / Düşük). Bir ürün sorusu (N1) ve bir sıra notu (N2) var; ikisi de birleştirmeyi durdurmaz.

## 2. Ne görüldü (sorulan dört soru)

**S1 — 14 gövde, sıralama dışında bir şey kaydı mı? Hayır.**
Migration'ın yeniden yazdığı 14 fonksiyonun (üçü değil, hepsi) dal gövdesini yerel veritabanındaki canlı tanımla (`pg_get_functiondef`; yerel DB = main, son migration `20261003000000`) `diff -w` ile karşılaştırdım. Kalan farklar yalnız: `order by … sort_order …` → `order by lower(name), id`; oluşturma servislerinde `next_order` hesabının ve `sort_order` kolonunun eklemeden çıkması. Yetki çağrısı, kapsam yüklemi, arşiv süzgeci ve dönen alanlar birebir aynı — `list_employees_service`, `update_job_assignments_service`, `get_employee_hub_service` dahil.
Dikkat: dosyalardaki "en son tanım" yanıltıcı olabiliyor. `document_definition_target_options_service` main'de dosya dışı değiştirilmiş: bir `do $$ … replace(pg_get_functiondef(...)) … $$` bloğu `signature_templates.manage` iznini eklemiş (`20260916011654_bl052_policy_assignments.sql:53`). Dal canlıdan kopyaladığı için bunu doğru taşıyor. Dosyadan kopyalansaydı izin daralırdı; canlıdan kopyalama doğru yöntemdi.
Bir sıra değişikliği anlam taşıyor ama kararın gereği: Duyurular (`get_announcements_service`) `department_names` / `job_names` artık duyurunun kendi sırasıyla değil A→Z geliyor.

**S2 — silinen `reorder_*`'ı çağıran kaldı mı? Hayır.**
Yerel DB'de gövdesinde `reorder_organization_entities` geçen başka fonksiyon 0; `cron.job`'da 0. Kodda (`apps`, `api`, `packages`, `e2e`, `scripts`, `vercel.json`, `seed.sql`) yalnız başka katalogların kendi reorder uçları kaldı: Shift types, Shift labels, Document types — kapsam dışı, kendi fonksiyonlarını çağırıyorlar. Departman/iş ucunun kalktığını bir API hücresi 404 ile kilitliyor (`organization-settings-routes.test.ts`, "organization/entities/reorder").

**S3 — CHECK + `set constraints`, canlıda güvenli mi; sayaçlar? Güvenli; sayaçlar yalnız azaldı.**
- Sıra doğru: eski CHECK'ler ve sıra indeksleri düşüyor, satırlar `sort_order = 0`'a çekiliyor, sonra `check (sort_order = 0)` ekleniyor. Kolon varsayılanı zaten `0` (jobs, departments). Eski ve yeni kodun giriş şemaları (`jobInputSchema`, `departmentInputSchema`) `sort_order` taşımıyor; tarayıcıdan gelen ekleme ve güncelleme CHECK'e takılmaz.
- `document_assignment_changed` ertelenmiş (deferrable initially deferred) bir constraint trigger. `update jobs …` onu kuyruğa atıyor; bekleyen olay varken `ALTER TABLE` reddedilirdi. `immediate` kuyruğu o anda boşaltıyor, `deferred` geri alıyor; ikisi de yalnız o işlemi etkiler. Tetikleyici `jobs` güncellemesinde yalnız `department_id` ya da `archived_at` değiştiyse iş yapıyor; yalnız `sort_order` değişen satırda erken dönüyor. Belge yeniden hesabı ya da bildirim yok. Migration işlem dışında koşsa bile `SET CONSTRAINTS` yalnız uyarı verir; zararsız.
- `authz_catalog` tavanları: `request.jwt.claim` yazanlar 25 → 24, ipucusuz retler 175 → 173. `authorization_coverage` bir satır eksildi (silinen servis). `retired_objects_stay_gone`'a iki fonksiyon ve iki kısıt eklendi.

**S4 — OPS-03 penceresinde başka kırılma var mı? Hayır.** Pencere: önce canlı migration, main sonra.
- Beklenen tek kırılma: canlıdaki eski web Settings → Jobs'ta "Move up / Move down"a basılırsa eski API silinmiş fonksiyonu çağırır ve 500 döner.
- Eski kod `sort_order` yazmıyor: giriş şemalarında yok, oluşturma servisleri aynı imzayla yeni gövdeye düşüyor.
- Eski web `sort_order` sonra ad ile diziyor; hepsi 0 olunca sonuç A→Z'ye yakın, yalnız görünüm.
- Shared okuma şemaları `sort_order`'ı `nonnegative` istiyor; 0 geçiyor.

## 3. Açık kalan ve nedeni

- **N1 (ürün sorusu, koordinatör → kullanıcı).** Main'deki KARARLAR (`docs/plan/KARARLAR.md:275-281`) "Management departmanı ayrıcalıksız… departmanların sırasını okuyan Schedule ve seçiciler de A→Z" diyor. Ama iki yerde "Management en sonda" kuralı duruyor ve bu dal onlara dokunmuyor:
  - Employees → çekmece → Jobs seçicisi: Management grubu en altta (`apps/web/src/employees/EmployeeDrawer.tsx:3103-3124`, BL-218 .5).
  - Schedule → "Job/Position": Management'ın iş grupları en altta (`apps/web/src/schedule/lib/scheduleEmployeeSort.ts:16-23`; EMP-001 madde 13, o da kullanıcı kararı).

  İki karar çelişiyor mu, yoksa BL-475 yalnız listelerin sırası için mi? Tahmin etmedim. Çelişiyorsa ayrı iş (`nf-arayuz`); bu dalın onayını etkilemez.
- **N2 (sıra notu).** Bu işte "önce main" sırası hiç kırılma yaratmazdı: yeni kod reorder çağırmıyor, eski veritabanı `sort_order` ile diziyor, yalnız görünüm. OPS-03 sırası ise kısa bir 500 penceresi açıyor (S4). Kural gevşetilmesin (dün yaşandı); pencere kısa tutulsun ya da canlıda o ara Settings → Jobs'ta taşıma yapılmasın.
- Ekranda denenmedi. Tam `test:db`, e2e ve yeni `catalog_sorted_by_name` dosyasını ben koşmadım; kanıt yazarın koşusu ve dal CI'ı.
- Dalın `docs/plan` kopyası eski: BACKLOG'da "departmanlarınki kalır" yazıyor. Main'deki KARARLAR güncel ve kodla aynı. Dal docs değiştirmediği için birleştirmede sorun çıkmaz.

## 4. Ekranda ne değişti (dalın getirdiği; ben ekranda bakmadım)
- **Settings → Jobs:** departmanlar ve işler A→Z; Management de ötekilerle ada göre (ör. "Bar, Kitchen, Management, Service"). "Move up / Move down" yok.
- **Schedule üst çubuğu (departman süzgeci):** departmanlar sunucudan A→Z.
- **Seçiciler ve okumalar** (Employees listesi iş adı, çekmece iş listesi, Employee Hub iş adları, Duyurular, belge hedef seçenekleri, kurulum): A→Z.

## 5. Sırada ne var
1. N1'i kullanıcıya sor (tek tık: "Management her yerde A→Z" / "Job/Position ve çekmecede en sonda kalsın").
2. Birleştirme: yerel migration → canlı gönderim (kullanıcı; OPS-03) → main; pencere kısa.
3. İkinci adım (kapsam dışı, backlog'da): `sort_order` kolonunun silinmesi. Shared şemalardan, `organization-data.ts:352/359` seçiminden ve DB okumalarından birlikte çıkmalı; bu alan silen bir söküm, sırası da alan silen kurala göre.

## Kanıt (2026-09-30, bu oturumda, salt okuma)
| Komut | Sonuç |
|---|---|
| 14 fonksiyon: dal gövdesi ↔ yerel DB `pg_get_functiondef` (`diff -w`, yalnız sıralama satırları gizli) | başka fark yok |
| Aynı 14 fonksiyon ↔ main dosyalarındaki son tanım | tek ek fark `document_definition_target_options_service` izin satırı; kaynağı main'deki dinamik yeniden yazım |
| Yerel DB: `prosrc` içinde `reorder_organization_entities` (fonksiyonun kendisi hariç), `cron.job` | 0, 0 |
| `git grep` reorder / `sort_order` yazanları (dal, test hariç) | yalnız başka katalogların uçları; giriş şemalarında `sort_order` yok |
| Tetikleyici tanımı ve gövdesi, kolon varsayılanları | S3 |
| `authz_catalog`, `authorization_coverage`, `retired_objects_stay_gone` farkı | yalnız azalan tavanlar ve eklenen söküm satırları |
